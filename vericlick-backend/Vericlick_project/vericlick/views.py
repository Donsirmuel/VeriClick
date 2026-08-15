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
    Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, CountryRule,
    DevicePolicy, TrackerEvent, Plan, DiscountCode, SiteConfig, CheckoutIntent,
)
from .serializers import (
    UserSerializer,
    WorkspaceSerializer,
    RegisterSerializer,
    DomainRegistrySerializer,
    TrackingLinkSerializer,
    ClickLogSerializer,
    IPRuleSerializer,
    CountryRuleSerializer,
    DevicePolicySerializer,
    TrackerEventSerializer,
    BlockedIPSerializer,
    PlanSerializer,
)
from .version import get_version
from .emails import (
    send_welcome_email,
    send_password_reset_email,
    send_plan_upgraded_email,
    send_verification_email,
)
from .services import (
    classify_request,
    lookup_location,
    get_safe_destination,
    verify_domain_ownership,
    refresh_stale_domains_async,
    reason_label,
)


def get_user_workspace(user):
    # Lazy billing lifecycle: every authenticated owner request keeps the
    # period-expiry / grace / suspension ledger and emails current. Status
    # itself is derived from plan_expires_at, so visitor-facing links behave
    # correctly without this hook.
    from .payments import maybe_run_billing_checks
    workspace = Workspace.objects.filter(owner=user).first()
    if workspace is not None:
        try:
            maybe_run_billing_checks(workspace)
        except Exception:
            pass  # Billing housekeeping must never break the request.
    return workspace


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
        # First touch starts the free-trial clock for workspaces with no paid
        # plan, so the UI can show how long their free allowance lasts.
        workspace.ensure_trial_started()
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
    # Public pricing data for the pricing page: every tier gets the full
    # protection engine; plans differ by how many domains you can register.
    plans = Plan.objects.filter(is_active=True).order_by('sort_order', 'code')
    return Response({
        'plans': PlanSerializer(plans, many=True).data,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def site_config(request):
    # Public, unauthenticated status flags mirror what the admin exposes. The
    # frontend uses these to adapt copy and gate features (e.g. signups closed).
    return Response({
        'signups_open': SiteConfig.signups_allowed(),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upgrade_workspace(request):
    # "Choose a plan" → create a Bachs checkout session. The plan is NOT applied
    # here; Bachs is the source of truth. A verified `collection.succeeded`
    # webhook (bachs_webhook) sets the workspace's plan once payment clears.
    # The client redirects the user to `checkout_url` and we predict the rest.
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
    billing_mode = (request.data.get('billing_mode') or 'subscription').strip()
    if billing_mode not in CheckoutIntent.BillingMode.values:
        return Response(
            {'errors': [{'field': 'billing_mode', 'detail': 'Unknown billing mode.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The right Bachs product depends on the mode: subscriptions sell the
    # recurring product (card-only); one-time "period" purchases sell the
    # one-time product so the customer can choose any payment method.
    product_id = plan.bachs_ot_product_id or plan.bachs_product_id if billing_mode == 'period' else plan.bachs_product_id
    if not product_id:
        return Response(
            {'errors': [{'field': 'plan_code', 'detail': f'The {plan.name} plan isn\'t ready to buy yet. Try another plan or contact support.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    payment_methods = request.data.get('payment_methods')
    if payment_methods is not None:
        from .payments import ALL_PAYMENT_METHODS
        if not isinstance(payment_methods, list) or any(
            m not in ALL_PAYMENT_METHODS for m in payment_methods
        ):
            return Response(
                {'errors': [{'field': 'payment_methods', 'detail': 'One or more payment methods are not supported.'}]},
                status=status.HTTP_400_BAD_REQUEST,
            )

    from .payments import create_checkout_session, BachsError

    intent = CheckoutIntent.objects.create(
        workspace=workspace,
        plan=plan,
        user=request.user,
        billing_mode=billing_mode,
    )
    try:
        result = create_checkout_session(
            intent, plan, request.user.email, request.user.username,
            payment_methods=payment_methods,
        )
    except BachsError as exc:
        intent.status = CheckoutIntent.Status.FAILED
        intent.save(update_fields=['status', 'updated_at'])
        return Response(
            {'errors': [{'field': 'checkout', 'detail': f'Could not start the secure checkout. {exc}'}]},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    intent.checkout_id = result.get('checkout_id', '')
    intent.save(update_fields=['checkout_id', 'updated_at'])
    return Response({
        'checkout_id': result.get('checkout_id'),
        'checkout_url': result.get('checkout_url'),
        'expires_at': result.get('expires_at'),
        'plan': plan.code,
        'billing_mode': billing_mode,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def billing_history(request):
    # Payment / subscription history for the workspace. Money source of truth is
    # Bachs; we mirror it in BillingEvent rows (recorded from checkout creation,
    # fulfilment webhooks and renewal webhooks) for display and receipts.
    from datetime import timedelta
    from .models import BillingEvent
    from .serializers import BillingEventSerializer

    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    active = workspace.is_plan_active()
    status = workspace.plan_status
    has_access = active or workspace.in_grace
    next_renewal = None
    if active:
        if workspace.plan_billing_mode == Workspace.BillingMode.PERIOD:
            next_renewal = workspace.plan_expires_at
        else:
            last_charge = workspace.billing_events.filter(
                kind__in=[BillingEvent.Kind.PLAN_PURCHASED, BillingEvent.Kind.PLAN_RENEWED]
            ).first()
            if last_charge is not None:
                next_renewal = last_charge.occurred_at + timedelta(days=30)

    events = workspace.billing_events.all()[:50]
    return Response({
        'subscription': {
            'status': status,
            'active': active,
            'plan': workspace.active_plan.code if has_access else None,
            'planName': workspace.active_plan.name if has_access else None,
            'mode': workspace.plan_billing_mode if has_access else None,
            'startedAt': workspace.plan_started_at,
            'expiresAt': workspace.plan_expires_at if has_access else None,
            'graceExpiresAt': workspace.grace_expires_at,
            'nextRenewalAt': next_renewal,
            'trialActive': workspace.trial_active,
            'trialExpiresAt': workspace.trial_expires_at,
        },
        'events': BillingEventSerializer(events, many=True).data,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([])
def bachs_webhook(request):
    # Bachs webhook destination. Verify the HMAC signature over the RAW body
    # before trusting anything, then fulfil paid checkouts. Returns 200 for
    # every successfully signed delivery (even unknowns) so Bachs doesn't retry.
    from .payments import verify_webhook_signature, fulfil_paid_checkout

    raw_body = request.body
    if not verify_webhook_signature(
        raw_body,
        request.headers.get('X-Bachs-Timestamp', ''),
        request.headers.get('X-Bachs-Signature', ''),
    ):
        return Response(
            {'errors': [{'detail': 'Invalid webhook signature.'}]},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    try:
        import json
        payload = json.loads(raw_body.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return Response(
            {'errors': [{'detail': 'Unparseable webhook body.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    event_type = payload.get('type')
    data = payload.get('data') or {}
    if event_type == 'collection.succeeded':
        # First-time purchases carry a checkout_id; recurring renewals don't.
        if data.get('checkout_id'):
            fulfil_paid_checkout(data.get('checkout_id'), data.get('charge_id') or '')
        else:
            from .payments import record_recurring_collection
            record_recurring_collection(data)
    elif event_type in ('collection.failed', 'collection.abandoned', 'collection.underpaid'):
        from .models import BillingEvent
        from .payments import record_failed_collection
        record_failed_collection(data, event_type)
    return Response({'status': 'ok'})


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
    candidates = [host]
    if host.startswith('t.'):
        apex = host[2:]
        if apex.count('.') == 1:
            candidates.append(apex)
    allowed = DomainRegistry.objects.filter(
        verified=True, removed_at__isnull=True, domain__in=candidates
    ).exists()
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

    if workspace.plan_status == 'suspended':
        # Suspended workspaces get no analytics: the beacon is accepted so the
        # visitor's page loads cleanly, but nothing is recorded or filtered.
        return Response({'status': 'ok'})

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
        # Shield verdict carried on the beacon (set when the page uses the
        # data-shield tracker). Ordinary installs leave these blank.
        'verdict': request.data.get('verdict', ''),
        'is_bot': bool(request.data.get('is_bot', False)),
        'reason': request.data.get('reason', ''),
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
@throttle_classes([TrackerEventThrottle])
def shield_evaluate(request):
    # Site Shield evaluation. The data-shield tracker script calls this with
    # the workspace id + tracker token before deciding how to handle the
    # pageview. The endpoint is deliberately fail-open: any uncertainty
    # (suspended workspace, page host that isn't one of the workspace's own
    # authorized domains, missing data) returns "allowed" so real visitors are
    # never caught in the crossfire.
    site_id = request.data.get('site_id')
    token = request.data.get('token')
    page_url = request.data.get('page_url') or ''
    if not site_id or not token or not page_url:
        return Response(
            {'errors': [{'field': 'site_id', 'detail': 'site_id, token and page_url are required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        workspace = Workspace.objects.get(id=site_id)
    except (Workspace.DoesNotExist, ValueError):
        return Response(
            {'errors': [{'field': 'site_id', 'detail': 'Invalid workspace'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if token != str(workspace.tracker_secret):
        return Response(
            {'errors': [{'field': 'token', 'detail': 'Invalid tracker token'}]},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    def _allow(reason=''):
        return Response({
            'verdict': 'allowed',
            'is_bot': False,
            'reason': reason,
            'reason_label': '',
        })

    if workspace.plan_status == 'suspended':
        # Suspended workspaces get no filtering: fail open so their deployed
        # shield never harms the audience.
        return _allow('suspended')

    # Host authorization, fail-open: the shield only judges pageviews on the
    # workspace's own registered domains (any registered domain is authorized —
    # instant authorization) or on the shared VeriClick host. A page on some
    # other site can't be evaluated for this workspace.
    from .models import tracking_host

    host = (urlparse(page_url).hostname or '').lower().rstrip('.')
    authorized_hosts = set()
    for domain in DomainRegistry.objects.filter(workspace=workspace, removed_at__isnull=True):
        authorized_hosts.add(domain.domain.lower().rstrip('.'))
        authorized_hosts.add(tracking_host(domain.domain).lower().rstrip('.'))
    shared_base = getattr(settings, 'PUBLIC_TRACKING_BASE_URL', '').strip()
    shared_host = (urlparse(shared_base).hostname or '').lower().rstrip('.') if shared_base else ''
    if host and shared_host and host != shared_host and host not in authorized_hosts:
        return _allow('not-authorized')

    ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    result = classify_request(None, ip, user_agent, workspace)
    blocked = result['decision'] != 'allowed'
    if blocked:
        # A blocked pageview is recorded here (the script shows the block page
        # instead of sending the normal beacon, so this is its only chance to
        # be counted).
        TrackerEvent.objects.create(
            workspace=workspace,
            page_url=page_url,
            referrer=request.data.get('referrer', ''),
            signals=request.data.get('signals') or {},
            ip=ip,
            user_agent=user_agent,
            verdict='blocked',
            is_bot=result['is_bot'],
            reason=result['reason'],
        )

    return Response({
        'verdict': 'blocked' if blocked else 'allowed',
        'is_bot': result['is_bot'],
        'reason': result['reason'],
        'reason_label': reason_label(result['decision'], result['reason'], result['matched_rule']),
    })


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
    # New accounts are inactive until the address is confirmed. The welcome
    # email is sent once verification succeeds instead of here.
    token = default_token_generator.make_token(user)
    send_verification_email(user, user.pk, token)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email(request):
    uid = request.data.get('uid')
    token = request.data.get('token')
    if not uid or not token:
        return Response(
            {'errors': [{'field': 'token', 'detail': 'This verification link is incomplete. Please request a new one.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        user = User.objects.get(pk=uid)
    except (User.DoesNotExist, ValueError):
        user = None
    if user is None or not default_token_generator.check_token(user, token):
        return Response(
            {'errors': [{'field': 'token', 'detail': 'Invalid or expired verification link. Please request a new one.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not user.is_active:
        user.is_active = True
        user.save(update_fields=['is_active'])
        send_welcome_email(user)
    # Sign the user straight in — the link itself proved ownership of the email.
    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def resend_verification_email(request):
    identifier = (request.data.get('email') or '').strip()
    if not identifier:
        return Response(
            {'errors': [{'field': 'email', 'detail': 'Email is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Accept an email or a username (login box accepts both). Generic response
    # either way: never reveal whether an account exists or is already verified.
    user = User.objects.filter(Q(email__iexact=identifier) | Q(username__iexact=identifier)).first()
    if user is not None and not user.is_active:
        token = default_token_generator.make_token(user)
        send_verification_email(user, user.pk, token)
    return Response({'status': 'ok'})


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
    except User.MultipleObjectsReturned:
        # Legacy signups allowed duplicate emails. With several accounts on the
        # same address we can't tell which Google identity to attach to, so ask
        # the user to resolve it rather than silently picking one.
        return Response(
            {'errors': [{'field': 'email', 'detail': 'Multiple accounts share this email. Sign in with your username or contact support.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )
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
    # Legacy signups allowed duplicate emails, so there can be more than one
    # account for an address. first() (instead of get()) keeps this a silent
    # no-op for unknown/ambiguous addresses instead of a 500.
    user = User.objects.filter(email=email).first()
    if user is not None:
        token = default_token_generator.make_token(user)
        send_password_reset_email(user, user.pk, token)
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

    # Refresh stale domain health asynchronously so this request never blocks
    # on DNS lookups. The page shows the last-known status immediately.
    refresh_stale_domains_async(workspace)

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

    active_links = TrackingLink.objects.filter(
        workspace=workspace, status=TrackingLink.Status.ACTIVE, removed_at__isnull=True
    ).count()
    domains_healthy = DomainRegistry.objects.filter(
        workspace=workspace, removed_at__isnull=True,
        health_status=DomainRegistry.HealthStatus.HEALTHY
    ).count()
    domains_degraded = DomainRegistry.objects.filter(
        workspace=workspace, removed_at__isnull=True,
        health_status=DomainRegistry.HealthStatus.DEGRADED
    ).count()
    domains_blacklisted = DomainRegistry.objects.filter(
        workspace=workspace, removed_at__isnull=True,
        health_status=DomainRegistry.HealthStatus.BLACKLISTED
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
def dashboard_breakdown(request):
    # Top traffic sources by country or device for the dashboard widgets. Each
    # row carries total clicks and blocked clicks so the widget can show
    # "N blocked" and offer a one-click block button.
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    dimension = request.query_params.get('dimension', 'country')
    range_param = request.query_params.get('range', '7d')
    days_map = {'7d': 7, '30d': 30, '90d': 90}
    days = days_map.get(range_param, 7)
    since = timezone.now() - timedelta(days=days)

    qs = ClickLog.objects.filter(
        link__workspace=workspace, created_at__gte=since,
    )

    if dimension == 'device':
        rows = (
            qs.exclude(device_class='')
            .values('device_class')
            .annotate(
                total=Count('id'),
                blocked=Count('id', filter=Q(decision='blocked')),
            )
            .order_by('-total')[:8]
        )
        return Response([
            {
                'key': row['device_class'],
                'label': row['device_class'].capitalize(),
                'total': row['total'],
                'blocked': row['blocked'],
            }
            for row in rows
        ])

    rows = (
        qs.exclude(country_code='')
        .values('country_code')
        .annotate(
            total=Count('id'),
            blocked=Count('id', filter=Q(decision='blocked')),
        )
        .order_by('-total')[:8]
    )
    # The full country name lives on the (recent) click logs; pull the latest
    # non-empty name per code without an extra join.
    labels = {}
    for code, name in (
        qs.exclude(country_code='').exclude(country='')
        .order_by('-created_at')
        .values_list('country_code', 'country')[:2000]
    ):
        if code not in labels:
            labels[code] = name
    return Response([
        {
            'key': row['country_code'],
            'label': labels.get(row['country_code'], row['country_code']),
            'total': row['total'],
            'blocked': row['blocked'],
        }
        for row in rows
    ])


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

    # A whitelisted IP is no longer "blocked": once an active allow rule exists
    # for it, its old block events must not keep showing up in this list (the
    # IP lives in Traffic Rules > IP Addresses now).
    whitelisted = set(
        IPRule.objects.filter(
            workspace=workspace,
            action=IPRule.Action.ALLOW,
            is_active=True,
        ).values_list('ip_or_cidr', flat=True)
    )
    if whitelisted:
        qs = qs.exclude(ip__in=whitelisted)

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


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def device_policy(request):
    # Workspace-level device/OS policy (Traffic Rules > Devices tab). Read via
    # GET, update via PATCH. The row is created lazily so a workspace that
    # never touches the Devices tab has no policy and no behaviour change.
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    policy, _ = DevicePolicy.objects.get_or_create(workspace=workspace)

    if request.method == 'GET':
        return Response(DevicePolicySerializer(policy).data)

    workspace.ensure_trial_started()
    if workspace.suspended:
        raise ValidationError({
            'detail': (
                'Your plan was suspended. Renew it to restore access and '
                'keep using device rules.'
            )
        })
    if not (workspace.has_plan_access() or workspace.trial_active):
        raise ValidationError({
            'detail': (
                'Device rules are a paid feature. Your free trial ended — '
                'upgrade to any plan to keep using them.'
            )
        })

    serializer = DevicePolicySerializer(policy, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


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
        # Soft-deleted links stay in the DB (they keep counting toward the plan
        # limit until the period ends) but are hidden from the app and no longer
        # serve traffic.
        return qs.filter(removed_at__isnull=True)

    def perform_destroy(self, instance):
        instance.removed_at = timezone.now()
        instance.save(update_fields=['removed_at'])

    def perform_create(self, serializer):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            raise PermissionError('No workspace found')
        workspace.ensure_trial_started()
        if workspace.suspended:
            raise ValidationError({
                'detail': (
                    'Your plan was suspended. Renew it to restore access and '
                    'keep creating links.'
                )
            })
        if not workspace.can_add_link:
            if workspace.is_plan_active():
                raise ValidationError({
                    'detail': 'You have reached the link limit for your plan. Remove a link or upgrade to add more.'
                })
            raise ValidationError({
                'detail': (
                    'Your free trial ended. Upgrade to any plan to keep creating links.'
                    if not workspace.trial_active
                    else 'Your free trial includes 1 link. Upgrade to create more.'
                )
            })
        serializer.save(workspace=workspace)


class DomainRegistryViewSet(viewsets.ModelViewSet):
    queryset = DomainRegistry.objects.all()
    serializer_class = DomainRegistrySerializer

    def list(self, request, *args, **kwargs):
        # Health checks run asynchronously so the list never blocks on DNS
        # lookups; the page shows the last-known status immediately.
        workspace = get_user_workspace(self.request.user)
        if workspace:
            refresh_stale_domains_async(workspace)
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        workspace = get_user_workspace(self.request.user)
        if workspace:
            qs = qs.filter(workspace=workspace)
        # Removed (soft-deleted) domains stay in the DB so they keep counting
        # toward the plan limit until the period ends, but they are hidden from
        # the app and can no longer be acted on.
        return qs.filter(removed_at__isnull=True).annotate(
            links_count=Count('links', filter=Q(links__removed_at__isnull=True))
        ).order_by('-created_at')

    def update(self, request, *args, **kwargs):
        # Renaming a domain onto a name that exists anywhere (another workspace
        # or our own removed row) would hit the global unique constraint and
        # surface as a 500. Fail with a friendly message instead. Resurrection
        # on rename is intentionally NOT offered: the add flow covers that.
        instance = self.get_object()
        new_name = str(request.data.get('domain') or '').strip()
        if new_name:
            dup = (
                DomainRegistry.objects.exclude(pk=instance.pk)
                .filter(domain__iexact=new_name)
                .first()
            )
            if dup is not None:
                raise ValidationError({
                    'detail': 'That domain is already registered by this or another account.'
                })
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}
        return Response(serializer.data)

    def perform_create(self, serializer):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            raise ValidationError({'detail': 'No workspace found for this account.'})
        workspace.ensure_trial_started()
        if workspace.suspended:
            raise ValidationError({
                'detail': (
                    'Your plan was suspended. Renew it to restore access and '
                    'keep adding domains.'
                )
            })

        domain_name = (serializer.validated_data.get('domain') or '').strip()
        existing = (
            DomainRegistry.objects.select_related('workspace')
            .filter(domain__iexact=domain_name)
            .first()
        )
        if existing is not None:
            if existing.workspace_id != workspace.id:
                raise ValidationError({
                    'detail': (
                        'This domain is already registered by another account. '
                        'Register a different domain.'
                    )
                })
            if existing.removed_at is None:
                raise ValidationError({
                    'detail': (
                        f'"{existing.domain}" is already in your Domain Registry. '
                        'Open the Domains page to manage it.'
                    )
                })
            # Resurrect a previously-removed domain: clear the soft-delete, bring
            # its links back, and authorize it instantly (v2.0.0). This keeps the
            # "remove and re-add freely" promise that the unique domain column
            # would otherwise block. Re-adding a removed domain does not consume
            # a new plan slot — the row already existed — so the limit checks
            # below do not apply to it.
            existing.links.filter(removed_at__isnull=False).update(removed_at=None)
            existing.removed_at = None
            existing.verified = True
            existing.save(update_fields=['removed_at', 'verified'])
            domain = existing
            # Point the serializer at the restored row so the 201 response
            # reflects real state (health status, links count, ...).
            serializer.instance = domain
        else:
            if not workspace.can_add_domain:
                if workspace.is_plan_active():
                    limit = workspace.effective_domain_limit
                    raise ValidationError({
                        'detail': (
                            f'You have reached the {limit}-domain limit for your plan. '
                            'Remove a domain or upgrade to a higher plan to add more.'
                        )
                    })
                raise ValidationError({
                    'detail': (
                        'Your free trial ended. Upgrade to any plan to keep adding domains.'
                        if not workspace.trial_active
                        else 'Your free trial includes 1 domain. Upgrade to add more.'
                    )
                })
            domain = serializer.save(workspace=workspace)
            # Instant authorization (v2.0.0): registering the domain from the
            # account is proof enough of ownership — no TXT record needed. The
            # domain is authorized the moment it exists, so links can go live as
            # soon as DNS points at us.
            domain.verified = True
            domain.save(update_fields=['verified'])
        try:
            domain.run_health_check()
        except Exception:
            # A health check must never fail the create request.
            domain.health_status = DomainRegistry.HealthStatus.DEGRADED
            domain.last_checked = timezone.now()
            domain.save(update_fields=['health_status', 'last_checked'])

    def perform_destroy(self, instance):
        # Soft delete: a verified domain (and its links) keep counting toward
        # the plan limit until the current period ends, so users can't churn
        # domains to dodge their limit. Unverified domains (e.g. a typo) never
        # counted, so removing one costs nothing. Links are soft-deleted along
        # with the domain and stop serving.
        stamp = timezone.now()
        instance.links.update(removed_at=stamp)
        instance.removed_at = stamp
        instance.save(update_fields=['removed_at'])

    @action(detail=True, methods=['post'])
    def recheck(self, request, pk=None):
        domain = self.get_object()
        domain.run_health_check()
        return Response({
            'status': 'ok',
            'health_status': domain.health_status,
            'points_to_server': domain.points_to_server,
            'health_detail': domain.health_detail,
            'last_checked': domain.last_checked,
        })

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        # Legacy ownership-verification endpoint, kept for compatibility. With
        # instant authorization a domain is already verified (authorized) from
        # the moment it's registered, so this is a no-op that always reports
        # success.
        domain = self.get_object()
        domain.verified = True
        domain.save(update_fields=['verified'])
        return Response({
            'status': 'ok',
            'verified': True,
            'points_to_server': domain.points_to_server,
            'verificationRecord': domain.verification_record,
        })


@api_view(['GET'])
@permission_classes([AllowAny])
def redirect_click(request, slug):
    link = get_object_or_404(
        TrackingLink, slug=slug, status=TrackingLink.Status.ACTIVE,
        removed_at__isnull=True,
    )

    ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    workspace = link.workspace

    if workspace.plan_status == 'suspended':
        # Suspended workspaces get a pure pass-through: visitors are redirected
        # straight to the destination with zero filtering, bot detection, or
        # logging. This is what keeps a lapsed customer's deployed links safe
        # for their audience while giving them no unpaid service.
        return HttpResponseRedirect(redirect_to=_merge_query_params(link.destination_url, request.query_params))

    result = classify_request(link, ip, user_agent, workspace)
    device = result['device']
    location = result['location']

    ClickLog.objects.create(
        link=link,
        ip=ip,
        country=location['country'],
        country_code=location['country_code'],
        region=location['region'],
        city=location['city'],
        device_class=device['device_class'],
        os_family=device['os_family'],
        browser=device['browser'],
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
        # Suspicious traffic is handled per this link's bot policy, but the
        # hard stops (403 / 404) are reserved for traffic that is demonstrably
        # automated: a UA parsed as a bot, or caught by the UA heuristics. A
        # person blocked by a geo/device/IP-rule block is still a person — their
        # browser should land somewhere neutral (the safe page), never on a
        # hard error page.
        is_ua_bot = result['device']['is_bot'] or result['reason'] == 'Suspicious UA'
        if is_ua_bot and link.bot_action == TrackingLink.BotAction.BLOCK:
            return HttpResponse(status=403)
        if is_ua_bot and link.bot_action == TrackingLink.BotAction.NOT_FOUND:
            return HttpResponse(status=404)
        safe = link.safe_url or get_safe_destination(workspace, request)
        return HttpResponseRedirect(redirect_to=_merge_query_params(safe, request.query_params))

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
        workspace.ensure_trial_started()
        if workspace.suspended:
            raise ValidationError({
                'detail': (
                    'Your plan was suspended. Renew it to restore access and '
                    'keep using IP rules.'
                )
            })
        if not (workspace.has_plan_access() or workspace.trial_active):
            raise ValidationError({
                'detail': (
                    'IP rules are a paid feature. Your free trial ended — '
                    'upgrade to any plan to keep using them.'
                )
            })
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


class CountryRuleViewSet(viewsets.ModelViewSet):
    queryset = CountryRule.objects.all()
    serializer_class = CountryRuleSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        workspace = get_user_workspace(self.request.user)
        if workspace:
            qs = qs.filter(workspace=workspace)
        return qs

    def create(self, request, *args, **kwargs):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            raise PermissionError('No workspace found')
        workspace.ensure_trial_started()
        if workspace.suspended:
            raise ValidationError({
                'detail': (
                    'Your plan was suspended. Renew it to restore access and '
                    'keep using country rules.'
                )
            })
        if not (workspace.has_plan_access() or workspace.trial_active):
            raise ValidationError({
                'detail': (
                    'Country rules are a paid feature. Your free trial ended — '
                    'upgrade to any plan to keep using them.'
                )
            })
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = (serializer.validated_data.get('country_code') or '').upper()
        action = serializer.validated_data.get('action')
        # Upsert: one rule per (country, action). Re-creating the same rule
        # (e.g. from the dashboard one-click block button) reactivates it
        # instead of stacking duplicates.
        existing = CountryRule.objects.filter(
            workspace=workspace, country_code=code, action=action,
        ).first()
        if existing is not None:
            existing.is_active = True
            if serializer.validated_data.get('reason'):
                existing.reason = serializer.validated_data['reason']
            existing.save(update_fields=['is_active', 'reason'])
            data = self.get_serializer(existing).data
            headers = self.get_success_headers(data)
            return Response(data, status=status.HTTP_200_OK, headers=headers)
        rule = serializer.save(
            workspace=workspace,
            country_code=code,
            created_by=self.request.user,
        )
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
