from datetime import timedelta
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
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from decouple import config

from .models import Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, TrackerEvent
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
)
from .version import get_version
from .services import classify_request


def get_user_workspace(user):
    return Workspace.objects.filter(owner=user).first()


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
@throttle_classes([])
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
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
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
        return Response({'token': token, 'uid': user.pk, 'email': email})
    except User.DoesNotExist:
        return Response({'error': 'No user with this email address'}, status=status.HTTP_400_BAD_REQUEST)


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

    now = timezone.now()
    twenty_four_hours_ago = now - timedelta(hours=24)

    clicks_24h = ClickLog.objects.filter(
        link__workspace=workspace, created_at__gte=twenty_four_hours_ago
    )
    total_clicks_24h = clicks_24h.count()
    bot_clicks_24h = clicks_24h.filter(is_bot=True).count()
    blocked_24h = clicks_24h.filter(decision=ClickLog.Decision.BLOCKED).count()
    challenged_24h = clicks_24h.filter(decision=ClickLog.Decision.CHALLENGED).count()

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
        qs = qs.filter(ip__icontains=search)

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
        domain = serializer.save(workspace=workspace)
        domain.run_health_check()

    @action(detail=True, methods=['post'])
    def recheck(self, request, pk=None):
        domain = self.get_object()
        domain.run_health_check()
        return Response({'status': 'ok', 'health_status': domain.health_status, 'last_checked': domain.last_checked})


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

    ClickLog.objects.create(
        link=link,
        ip=ip,
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
        return Response(
            {'error': 'Access denied', 'reason': result['reason']},
            status=status.HTTP_403_FORBIDDEN,
        )

    return HttpResponseRedirect(redirect_to=link.destination_url)


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
