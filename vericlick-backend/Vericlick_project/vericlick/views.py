from datetime import timedelta
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
from django.db.models import Count, Q, F
from django.db.models.functions import TruncDate
from django.conf import settings
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.shortcuts import get_object_or_404
from django.http import HttpResponse, HttpResponseRedirect

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from decouple import config

from .models import (
    Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, TrackerEvent,
    Plan, DiscountCode, SiteConfig, tracking_host,
)
from .serializers import (
    UserSerializer,
    WorkspaceSerializer,
    RegisterSerializer,
    DomainRegistrySerializer,
    TrackingLinkSerializer,
    ClickLogSerializer,
    IPRuleSerializer,
    TrackerEventSerializer,
    BlockedIPSerializer,
    PlanSerializer,
)
from .version import get_version
from .emails import send_welcome_email, send_password_reset_email, send_plan_upgraded_email
from .services import (
    classify_request,
    lookup_location,
    get_safe_destination,
    verify_domain_ownership,
    refresh_stale_domains,
)


def get_user_workspace(user):
    return Workspace.objects.filter(owner=user).first()


def _merge_query_params(destination, incoming_query):
    # Preserves UTM / campaign / click-id parameters on the tracked URL by
    # appending them to whatever destination the visitor is routed to (target
    # URL or the safe page). Incoming params win over destination defaults so
    # attribution/funnel pixels keep firing on the final page.
    if not incoming_query:
        return destination
    parts = list(urlparse(destination))
    params = dict(parse_qsl(parts[4], keep_blank_values=True))
    params.update({k: v[0] if isinstance(v, (list, tuple)) else v for k, v in incoming_query.items()})
    parts[4] = urlencode(params)
    return urlunparse(parts)


class TrackerEventThrottle(ScopedRateThrottle):
    scope = 'tracker'


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def workspace_detail(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = WorkspaceSerializer(workspace)
        return Response(serializer.data)

    serializer = WorkspaceSerializer(workspace, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({'status': 'ok', 'version': get_version()})


@api_view(['GET'])
@permission_classes([AllowAny])
def pricing(request):
    # Public pricing data for the pricing page. During beta, SiteConfig marks
    # the product free, so the page shows "free for now" while still advertising
    # the upcoming paid tiers (admin-managed via SiteConfig.beta_free_mode).
    plans = Plan.objects.filter(is_active=True).order_by('sort_order', 'code')
    return Response({
        'beta_free_mode': SiteConfig.is_beta_free_mode(),
        'plans': PlanSerializer(plans, many=True).data,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def site_config(request):
    # Public, unauthenticated status flags mirror what the admin exposes. The
    # frontend uses these to adapt copy and gate features (beta free mode, or
    # signups closed).
    return Response({
        'beta_free_mode': SiteConfig.is_beta_free_mode(),
        'signups_open': SiteConfig.signups_allowed(),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upgrade_workspace(request):
    # Plan selection for a workspace (the "checkout gating" hook). Today this
    # just assigns the chosen paid plan, which then enforces that plan's domain
    # limit via Workspace.effective_domain_limit. A payment provider (e.g.
    # Stripe checkout session) can be wired in here later without changing the
    # contract: the frontend sends plan_code and gets the updated workspace back.
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    code = (request.data.get('plan_code') or '').strip()
    try:
        plan = Plan.objects.get(code=code, is_active=True)
    except Plan.DoesNotExist:
        return Response(
            {'errors': [{'field': 'plan_code', 'detail': 'That plan is not available.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    workspace.plan = plan
    workspace.save(update_fields=['plan'])
    send_plan_upgraded_email(request.user, workspace, plan)
    return Response(WorkspaceSerializer(workspace).data)


@api_view(['POST'])
@permission_classes([AllowAny])
def discount_code_validate(request):
    # Validates an admin-created discount code. Returns the discount percent
    # when the code is usable, plus a plain-language message otherwise. It does
    # not consume the code — consumption happens when a checkout exists.
    raw_code = (request.data.get('code') or '').strip()
    if not raw_code:
        return Response(
            {'errors': [{'field': 'code', 'detail': 'Discount code is required.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        discount = DiscountCode.objects.get(code__iexact=raw_code)
    except DiscountCode.DoesNotExist:
        return Response(
            {'errors': [{'field': 'code', 'detail': 'That discount code is not valid.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not discount.is_usable():
        return Response(
            {'errors': [{'field': 'code', 'detail': 'That discount code has expired or is no longer available.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        'valid': True,
        'code': discount.code,
        'discount_percent': discount.discount_percent,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
def tls_allowed(request):
    # Caddy on-demand TLS gate. Caddy calls this with ?domain=<hostname>
    # before issuing a certificate for a host that isn't statically listed in
    # SITE_ADDRESSES. We only say yes for domains a customer has registered AND
    # proven ownership of (verified), so strangers can't make us mint Let's
    # Encrypt certificates for domains they don't control.
    host = (request.query_params.get('domain') or '').strip().lower().rstrip('.')
    if not host:
        return Response(status=status.HTTP_400_BAD_REQUEST)
    # Allow a registered verified domain itself, OR its tracking host. An apex
    # domain (e.g. donnable.site) can't hold a CNAME, so its branded links run
    # on the `t.` subdomain (t.donnable.site) which Caddy must also serve TLS
    # for.
    allowed = False
    for d in DomainRegistry.objects.filter(verified=True):
        if d.domain == host or tracking_host(d.domain) == host:
            allowed = True
            break
    if not allowed:
        return Response(status=status.HTTP_403_FORBIDDEN)
    return Response(status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
def serve_tracker_script(request):
    try:
        with open(settings.TRACKER_SCRIPT_PATH, 'r', encoding='utf-8') as f:
            template = f.read()
    except (OSError, FileNotFoundError):
        return Response(
            {'errors': [{'field': 'script', 'detail': 'Tracker script not found'}]},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    api_base = request.build_absolute_uri('/api/')
    script = template.replace('__API_BASE_URL__', api_base)
    response = HttpResponse(script, content_type='application/javascript')
    response['Cache-Control'] = 'public, max-age=3600'
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([TrackerEventThrottle])
def receive_tracker_event(request):
    site_id = request.data.get('site_id')
    if not site_id:
        return Response(
            {'errors': [{'field': 'site_id', 'detail': 'site_id is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        workspace = Workspace.objects.get(id=site_id)
    except (Workspace.DoesNotExist, ValueError):
        return Response(
            {'errors': [{'field': 'site_id', 'detail': 'Invalid workspace'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token = request.data.get('token')
    if not token or token != str(workspace.tracker_secret):
        return Response(
            {'errors': [{'field': 'token', 'detail': 'Invalid tracker token'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        ip = forwarded.split(',')[0].strip()

    data = {
        'workspace': workspace.id,
        'page_url': request.data.get('page_url'),
        'referrer': request.data.get('referrer', ''),
        'signals': request.data.get('signals') or {},
        'engagement': request.data.get('engagement') or {},
        'ip': ip,
        'user_agent': request.META.get('HTTP_USER_AGENT', ''),
    }

    serializer = TrackerEventSerializer(data=data)
    if not serializer.is_valid():
        return Response(
            {'errors': [{'field': field, 'detail': str(msg)} for field, msg in serializer.errors.items()]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    serializer.save(workspace=workspace)
    return Response({'status': 'ok'})


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    if not SiteConfig.signups_allowed():
        return Response(
            {'errors': [{'field': 'email', 'detail': 'New sign-ups are currently paused. Please try again later.'}]},
            status=status.HTTP_403_FORBIDDEN,
        )
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    send_welcome_email(user)
    return Response(RegisterSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def google_login(request):
    id_token = request.data.get('id_token')
    if not id_token:
        return Response(
            {'errors': [{'field': 'id_token', 'detail': 'ID token is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    import secrets
    import urllib.request
    import json

    try:
        url = f'https://oauth2.googleapis.com/tokeninfo?id_token={id_token}'
        with urllib.request.urlopen(url, timeout=10) as resp:
            info = json.loads(resp.read().decode())
    except Exception:
        return Response(
            {'errors': [{'field': 'id_token', 'detail': 'Invalid or expired token'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    google_client_id = config('GOOGLE_CLIENT_ID', default='')
    if google_client_id and info.get('aud') != google_client_id:
        return Response(
            {'errors': [{'field': 'id_token', 'detail': 'Token audience mismatch'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = info.get('email')
    if not email:
        return Response(
            {'errors': [{'field': 'email', 'detail': 'Email not provided by Google'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not info.get('email_verified'):
        return Response(
            {'errors': [{'field': 'email', 'detail': 'Google email not verified'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        # New-account creation via Google also respects the admin signups toggle.
        if not SiteConfig.signups_allowed():
            return Response(
                {'errors': [{'field': 'email', 'detail': 'New sign-ups are currently paused. Please try again later.'}]},
                status=status.HTTP_403_FORBIDDEN,
            )
        base = email.split('@')[0]
        username = base
        suffix = 1
        while User.objects.filter(username=username).exists():
            username = f'{base}{suffix}'
            suffix += 1
        user = User.objects.create_user(
            username=username,
            email=email,
            password=secrets.token_urlsafe(16),
        )
        send_welcome_email(user)

    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def auth_me(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def delete_account(request):
    # Self-service account removal. Requires typing DELETE to confirm so an
    # impostor or a misfired request can't wipe an account by accident. Related
    # data (workspace, links, domains, clicks, IP rules, settings) is removed
    # through the workspace/owner cascade. The Django user is deleted last.
    confirmation = (request.data.get('confirmation') or '').strip().upper()
    if confirmation != 'DELETE':
        return Response(
            {'errors': [{'field': 'confirmation', 'detail': 'Type DELETE to confirm you want to close your account.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user
    user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_request(request):
    email = request.data.get('email')
    if not email:
        return Response(
            {'errors': [{'field': 'email', 'detail': 'Email is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        user = User.objects.get(email=email)
        token = default_token_generator.make_token(user)
        send_password_reset_email(user, user.pk, token)
    except User.DoesNotExist:
        pass
    # Generic response: never reveal whether an account exists for an email.
    return Response({'status': 'ok', 'message': 'If an account exists for this email, a reset link has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_confirm(request):
    uid = request.data.get('uid')
    token = request.data.get('token')
    password = request.data.get('password')

    if not uid or not token or not password:
        return Response(
            {'errors': [{'field': field, 'detail': 'This field is required'} for field in ['uid', 'token', 'password'] if not request.data.get(field)]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(password) < 8:
        return Response(
            {'errors': [{'field': 'password', 'detail': 'Password must be at least 8 characters'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(pk=uid)
        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Invalid or expired token'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save()
        return Response({'status': 'ok'})
    except (User.DoesNotExist, ValueError):
        return Response({'error': 'Invalid user'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    # Refresh stale domain health from inside the app so the dashboard counts
    # reflect current status without depending on an external scheduler.
    refresh_stale_domains(workspace)

    now = timezone.now()
    twenty_four_hours_ago = now - timedelta(hours=24)

    clicks_24h = ClickLog.objects.filter(
        link__workspace=workspace, created_at__gte=twenty_four_hours_ago
    )
    total_clicks_24h = clicks_24h.count()
    bot_clicks_24h = clicks_24h.filter(is_bot=True).count()
    blocked_24h = clicks_24h.filter(decision=ClickLog.Decision.BLOCKED).count()
    challenged_24h = clicks_24h.filter(decision=ClickLog.Decision.CHALLENGED).count()

    # Real change vs the previous 24h window today, not a placeholder. Falls back
    # to null (no badge shown) when there's no prior traffic to compare against.
    previous_clicks_24h = ClickLog.objects.filter(
        link__workspace=workspace,
        created_at__gte=twenty_four_hours_ago - timedelta(hours=24),
        created_at__lt=twenty_four_hours_ago,
    ).count()
    if previous_clicks_24h > 0:
        clicks_trend = round(
            ((total_clicks_24h - previous_clicks_24h) / previous_clicks_24h) * 100, 1
        )
    else:
        clicks_trend = None

    active_links = TrackingLink.objects.filter(workspace=workspace, status=TrackingLink.Status.ACTIVE).count()
    domains_healthy = DomainRegistry.objects.filter(
        workspace=workspace, health_status=DomainRegistry.HealthStatus.HEALTHY
    ).count()
    domains_degraded = DomainRegistry.objects.filter(
        workspace=workspace, health_status=DomainRegistry.HealthStatus.DEGRADED
    ).count()
    domains_blacklisted = DomainRegistry.objects.filter(
        workspace=workspace, health_status=DomainRegistry.HealthStatus.BLACKLISTED
    ).count()

    data = {
        'totalClicks24h': total_clicks_24h,
        'clicksTrend': clicks_trend,
        'botTrafficBlocked': bot_clicks_24h,
        'blocked': blocked_24h,
        'challenged': challenged_24h,
        'allowed': total_clicks_24h - bot_clicks_24h,
        'botTrafficPercentage': round(
            (bot_clicks_24h / total_clicks_24h * 100) if total_clicks_24h else 0, 1
        ),
        'activeLinks': active_links,
        'domainsHealthy': domains_healthy,
        'domainsDegraded': domains_degraded,
        'domainsBlacklisted': domains_blacklisted,
        'lastDomainScan': workspace.last_domain_scan_at,
    }
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_traffic(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    range_param = request.query_params.get('range', '7d')
    days_map = {'7d': 7, '30d': 30, '90d': 90}
    days = days_map.get(range_param, 7)

    since = timezone.now() - timedelta(days=days)

    qs = (
        ClickLog.objects
        .filter(link__workspace=workspace, created_at__gte=since)
        .annotate(date=TruncDate('created_at'))
        .values('date')
        .annotate(
            human=Count('id', filter=Q(is_bot=False)),
            bot=Count('id', filter=Q(is_bot=True)),
        )
        .order_by('date')
    )

    data = [
        {
            'date': entry['date'].isoformat() if entry['date'] else None,
            'human': entry['human'],
            'bot': entry['bot'],
        }
        for entry in qs
    ]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def blocked_ips(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    qs = ClickLog.objects.select_related('link').filter(
        link__workspace=workspace,
        decision=ClickLog.Decision.BLOCKED,
    )

    search = request.query_params.get('search', '').strip()
    if search:
        qs = qs.filter(Q(ip__icontains=search) | Q(link__slug__icontains=search))

    qs = qs.order_by('-created_at')[:500]

    paginator = PageNumberPagination()
    paginator.page_size = 50
    paginator.page_size_query_param = 'size'
    paginator.max_page_size = 100
    page = paginator.paginate_queryset(qs, request)

    serializer = BlockedIPSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_activity(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    clicks = ClickLog.objects.select_related('link').filter(link__workspace=workspace).order_by('-created_at')[:50]
    serializer = ClickLogSerializer(clicks, many=True)
    return Response(serializer.data)


class TrackingLinkPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'size'
    max_page_size = 100


class TrackingLinkViewSet(viewsets.ModelViewSet):
    queryset = TrackingLink.objects.select_related('domain').all()
    serializer_class = TrackingLinkSerializer
    pagination_class = TrackingLinkPagination
    filterset_fields = ['status', 'domain']

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '')
        if search:
            qs = qs.filter(
                Q(slug__icontains=search) | Q(destination_url__icontains=search)
            )
        workspace = get_user_workspace(self.request.user)
        if workspace:
            qs = qs.filter(workspace=workspace)
        return qs

    def perform_create(self, serializer):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            raise PermissionError('No workspace found')
        serializer.save(workspace=workspace)


class DomainRegistryViewSet(viewsets.ModelViewSet):
    queryset = DomainRegistry.objects.all()
    serializer_class = DomainRegistrySerializer

    def list(self, request, *args, **kwargs):
        # Health checks run automatically in-app when a domain is stale, so
        # no external cron/systemd job is required to keep statuses current.
        workspace = get_user_workspace(self.request.user)
        if workspace:
            refresh_stale_domains(workspace)
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        workspace = get_user_workspace(self.request.user)
        if workspace:
            qs = qs.filter(workspace=workspace)
        return qs

    def perform_create(self, serializer):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            raise ValidationError({'detail': 'No workspace found for this account.'})
        if not workspace.can_add_domain:
            limit = workspace.effective_domain_limit
            raise ValidationError({
                'detail': (
                    f'You have reached the {limit}-domain limit for your plan. '
                    'Remove a domain or upgrade to a higher plan to add more.'
                )
            })
        domain = serializer.save(workspace=workspace)
        try:
            domain.run_health_check()
        except Exception:
            # A health check must never fail the create request.
            domain.health_status = DomainRegistry.HealthStatus.DEGRADED
            domain.last_checked = timezone.now()
            domain.save(update_fields=['health_status', 'last_checked'])

    def perform_destroy(self, instance):
        # A domain owns its links. Deleting the domain removes the links
        # (and their click logs, which cascade) — otherwise orphaned links would
        # keep serving on a domain the user just removed.
        instance.links.all().delete()
        instance.delete()

    @action(detail=True, methods=['post'])
    def recheck(self, request, pk=None):
        domain = self.get_object()
        domain.run_health_check()
        return Response({
            'status': 'ok',
            'health_status': domain.health_status,
            'points_to_server': domain.points_to_server,
            'last_checked': domain.last_checked,
        })

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        # DNS TXT ownership verification. The owner publishes the domain's
        # verification_record as a TXT record, then calls this to confirm they
        # control the domain. A domain can resolve (healthy) but only become
        # 'verified' once ownership is proven.
        domain = self.get_object()
        # Refresh the DNS-pointing status so the response always reflects the
        # current A/CNAME state (not a stale health-check result).
        try:
            domain.run_health_check()
        except Exception:
            pass
        verified, detail = verify_domain_ownership(domain)
        if verified:
            domain.verified = True
            domain.save(update_fields=['verified'])
            return Response({
                'status': 'ok',
                'verified': True,
                'points_to_server': domain.points_to_server,
                'verificationRecord': domain.verification_record,
            })
        return Response(
            {'errors': [{'field': 'domain', 'detail': detail}]},
            status=status.HTTP_400_BAD_REQUEST,
        )


@api_view(['GET'])
@permission_classes([AllowAny])
def redirect_click(request, slug):
    link = get_object_or_404(TrackingLink, slug=slug, status=TrackingLink.Status.ACTIVE)

    ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    workspace = link.workspace

    result = classify_request(link, ip, user_agent, workspace)
    location = lookup_location(ip)

    ClickLog.objects.create(
        link=link,
        ip=ip,
        country=location['country'],
        region=location['region'],
        city=location['city'],
        user_agent=user_agent,
        is_bot=result['is_bot'],
        reason=result['reason'],
        decision=result['decision'],
        matched_rule=result['matched_rule'],
    )

    if result['is_bot']:
        TrackingLink.objects.filter(id=link.id).update(bot_clicks=F('bot_clicks') + 1)
    TrackingLink.objects.filter(id=link.id).update(total_clicks=F('total_clicks') + 1)

    if result['decision'] in ('blocked', 'challenged'):
        # Divert suspicious traffic to the configured safe destination, falling
        # back to a neutral VeriClick page. Humans always reach the real URL.
        safe = _merge_query_params(get_safe_destination(workspace, request), request.query_params)
        return HttpResponseRedirect(redirect_to=safe)

    return HttpResponseRedirect(redirect_to=_merge_query_params(link.destination_url, request.query_params))


@api_view(['GET'])
@permission_classes([AllowAny])
def neutral_page(request):
    # Built-in safe destination: suspicious/automated traffic is bounced to the
    # configured default rather than shown an in-house page. Workspaces can
    # override this entirely by setting their own safe_destination.
    return HttpResponseRedirect(redirect_to=getattr(settings, 'NEUTRAL_DEFAULT_DESTINATION', 'https://google.com'))


class IPRuleViewSet(viewsets.ModelViewSet):
    queryset = IPRule.objects.all()
    serializer_class = IPRuleSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        workspace = get_user_workspace(self.request.user)
        if workspace:
            qs = qs.filter(workspace=workspace)
        return qs

    def perform_create(self, serializer):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            raise PermissionError('No workspace found')
        serializer.save(workspace=workspace, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def whitelist(self, request, pk=None):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            click = ClickLog.objects.select_related('link').get(id=pk, link__workspace=workspace)
        except ClickLog.DoesNotExist:
            return Response(
                {'errors': [{'field': 'id', 'detail': 'Blocked entry not found'}]},
                status=status.HTTP_404_NOT_FOUND,
            )

        rule, created = IPRule.objects.get_or_create(
            workspace=workspace,
            ip_or_cidr=click.ip,
            action=IPRule.Action.ALLOW,
            defaults={
                'reason': 'Whitelisted from blocked list',
                'created_by': self.request.user,
            },
        )
        if not created:
            rule.is_active = True
            rule.save(update_fields=['is_active'])

        return Response(IPRuleSerializer(rule).data)
