from datetime import timedelta
import logging
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.conf import settings
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.http import HttpResponse

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from decouple import config

from .models import (
    Workspace, IPRule, CountryRule,
    DevicePolicy, TrackerEvent, Plan, DiscountCode, SiteConfig, CheckoutIntent,
    ShieldConfig, DomainRegistry,
)
from .serializers import (
    UserSerializer,
    WorkspaceSerializer,
    RegisterSerializer,
    IPRuleSerializer,
    CountryRuleSerializer,
    DevicePolicySerializer,
    TrackerEventSerializer,
    BlockedIPSerializer,
    PlanSerializer,
    DomainRegistrySerializer,
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
    reason_label,
)

logger = logging.getLogger(__name__)


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


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def domain_list_create(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        domains = DomainRegistry.objects.filter(workspace=workspace).order_by('-created_at')
        return Response(DomainRegistrySerializer(domains, many=True).data)

    # POST — add a domain. Enforce the plan's domain_limit.
    serializer = DomainRegistrySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    domain_name = serializer.validated_data['domain']

    # Check duplicate
    if DomainRegistry.objects.filter(workspace=workspace, domain=domain_name, is_active=True).exists():
        return Response(
            {'errors': [{'field': 'domain', 'detail': 'This domain is already registered.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Check limit
    active_plan = workspace.active_plan
    current_count = DomainRegistry.objects.filter(workspace=workspace, is_active=True).count()
    limit = active_plan.domain_limit if active_plan else 3
    if current_count >= limit:
        plan_name = active_plan.name if active_plan else 'your current plan'
        return Response(
            {'errors': [{'field': 'domain', 'detail': f'You\'ve reached the {limit}-domain limit on {plan_name}. Upgrade to add more.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    domain = DomainRegistry.objects.create(workspace=workspace, domain=domain_name)
    return Response(DomainRegistrySerializer(domain).data, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def domain_delete(request, domain_id):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        domain = DomainRegistry.objects.get(id=domain_id, workspace=workspace)
    except DomainRegistry.DoesNotExist:
        return Response(
            {'errors': [{'field': 'domain', 'detail': 'Domain not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )
    domain.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


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

    tracker_signals = request.data.get('signals') or {}
    trajectory = tracker_signals.get('trajectory') or {}
    click_metrics = tracker_signals.get('click_metrics') or {}

    # Layer 5: Compute behavioral score
    from .services import score_from_signals, compute_bot_score
    bot_signals = score_from_signals(request, tracker_signals, trajectory, click_metrics)
    bot_result = compute_bot_score(bot_signals)

    data = {
        'workspace': workspace.id,
        'page_url': request.data.get('page_url'),
        'referrer': request.data.get('referrer', ''),
        'signals': tracker_signals,
        'engagement': request.data.get('engagement') or {},
        'ip': ip,
        'user_agent': request.META.get('HTTP_USER_AGENT', ''),
        # Shield verdict carried on the beacon (set when the page uses the
        # data-shield tracker). Ordinary installs leave these blank.
        'verdict': request.data.get('verdict', ''),
        'is_bot': bool(request.data.get('is_bot', False)),
        'reason': request.data.get('reason', ''),
        # Layer 1: Canvas fingerprint
        'canvas_hash': tracker_signals.get('canvas_hash', ''),
        # Layer 2: Mouse trajectory
        'trajectory': trajectory,
        # Layer 3: TLS fingerprint
        'ja4_hash': getattr(request, 'ja4_hash', ''),
        # Layer 5: Behavioral score
        'bot_score': bot_result['score'],
        'bot_verdict': bot_result['verdict'],
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
def shield_verify(request):
    """Core script verification endpoint. The shield.js script calls this with
    telemetry signals before deciding how to handle the pageview. The endpoint
    runs the full bot detection pipeline and returns a verdict.

    Fail-open: any uncertainty returns 'allow' so real visitors are never blocked."""
    api_key = request.data.get('api_key') or ''
    if not api_key:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'api_key is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Authenticate via workspace tracker_secret (the api_key)
    workspace = Workspace.objects.filter(tracker_secret=api_key).first()
    if not workspace:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'Invalid API key'}]},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    page_url = request.data.get('page_url') or ''
    if not page_url:
        return Response(
            {'errors': [{'field': 'page_url', 'detail': 'page_url is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def _allow(reason=''):
        return Response({
            'verdict': 'allow',
            'is_bot': False,
            'reason': reason,
            'reason_label': '',
        })

    if workspace.plan_status == 'suspended':
        return _allow('suspended')

    # Check shield config
    shield_config = getattr(workspace, 'shield_config', None)
    if shield_config and shield_config.protection_mode == 'monitor':
        # Monitor mode: log but don't block
        _log_shield_event(request, workspace, page_url, blocked=False, reason='monitor-mode')
        return _allow('monitor-mode')

    ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    result = classify_request(None, ip, user_agent, workspace)
    blocked = result['decision'] != 'allowed'

    # In balanced mode, only block obvious bots (not challenged/suspicious)
    if shield_config and shield_config.protection_mode == 'balanced':
        if result['decision'] == 'challenged':
            blocked = False

    if blocked:
        _log_shield_event(request, workspace, page_url, blocked=True, reason=result['reason'])

    reason_label_str = reason_label(result['decision'], result['reason'], result['matched_rule'])

    return Response({
        'verdict': 'block' if blocked else 'allow',
        'is_bot': result['is_bot'],
        'reason': result['reason'],
        'reason_label': reason_label_str,
        'bot_action': shield_config.bot_action if shield_config else 'block',
    })


def _log_shield_event(request, workspace, page_url, blocked=False, reason=''):
    """Log a shield event to TrackerEvent."""
    ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        ip = forwarded.split(',')[0].strip()

    tracker_signals = request.data.get('signals') or {}
    trajectory = tracker_signals.get('trajectory') or {}
    click_metrics = tracker_signals.get('click_metrics') or {}

    from .services import score_from_signals, compute_bot_score
    bot_signals = score_from_signals(request, tracker_signals, trajectory, click_metrics)
    bot_result = compute_bot_score(bot_signals)

    TrackerEvent.objects.create(
        workspace=workspace,
        page_url=page_url,
        referrer=request.data.get('referrer', ''),
        signals=tracker_signals,
        engagement=request.data.get('engagement') or {},
        ip=ip,
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
        verdict='blocked' if blocked else 'allowed',
        is_bot=blocked,
        reason=reason,
        canvas_hash=tracker_signals.get('canvas_hash', ''),
        trajectory=trajectory,
        ja4_hash=getattr(request, 'ja4_hash', ''),
        bot_score=bot_result['score'],
        bot_verdict=bot_result['verdict'],
    )


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
def shield_config_view(request):
    """Serve the shield configuration for a workspace. The script calls this
    on first load to get protection settings."""
    api_key = request.query_params.get('api_key') or ''
    if not api_key:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'api_key is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    workspace = Workspace.objects.filter(tracker_secret=api_key).first()
    if not workspace:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'Invalid API key'}]},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    config = getattr(workspace, 'shield_config', None)
    if not config:
        config = ShieldConfig.objects.create(workspace=workspace)

    return Response({
        'protection_mode': config.protection_mode,
        'bot_action': config.bot_action,
        'protected_paths': config.protected_paths,
        'blocked_paths': config.blocked_paths,
        'rate_limit_per_hour': config.rate_limit_per_hour,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([TrackerEventThrottle])
def shield_telemetry(request):
    """Receive batch telemetry from the script for analytics. Separate from
    verify to keep the verify endpoint fast and focused."""
    api_key = request.data.get('api_key') or ''
    if not api_key:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'api_key is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    workspace = Workspace.objects.filter(tracker_secret=api_key).first()
    if not workspace:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'Invalid API key'}]},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if workspace.plan_status == 'suspended':
        return Response({'status': 'ok'})

    _log_shield_event(request, workspace, request.data.get('page_url', ''), blocked=False, reason='telemetry')
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

    now = timezone.now()
    twenty_four_hours_ago = now - timedelta(hours=24)

    # Use TrackerEvent (script telemetry) instead of ClickLog (link redirects)
    events_24h = TrackerEvent.objects.filter(
        workspace=workspace, created_at__gte=twenty_four_hours_ago
    )
    total_events_24h = events_24h.count()
    bot_events_24h = events_24h.filter(is_bot=True).count()
    blocked_24h = events_24h.filter(verdict='blocked').count()

    previous_events_24h = TrackerEvent.objects.filter(
        workspace=workspace,
        created_at__gte=twenty_four_hours_ago - timedelta(hours=24),
        created_at__lt=twenty_four_hours_ago,
    ).count()
    if previous_events_24h > 0:
        clicks_trend = round(
            ((total_events_24h - previous_events_24h) / previous_events_24h) * 100, 1
        )
    else:
        clicks_trend = None

    shield_config = getattr(workspace, 'shield_config', None)

    data = {
        'totalVisits24h': total_events_24h,
        'clicksTrend': clicks_trend,
        'botsBlocked': bot_events_24h,
        'blocked': blocked_24h,
        'allowed': total_events_24h - bot_events_24h,
        'botTrafficPercentage': round(
            (bot_events_24h / total_events_24h * 100) if total_events_24h else 0, 1
        ),
        'protectionMode': shield_config.protection_mode if shield_config else 'balanced',
        'botAction': shield_config.bot_action if shield_config else 'block',
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
        TrackerEvent.objects
        .filter(workspace=workspace, created_at__gte=since)
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

    qs = TrackerEvent.objects.filter(
        workspace=workspace, created_at__gte=since,
    )

    if dimension == 'device':
        rows = (
            qs.exclude(device_class='')
            .values('device_class')
            .annotate(
                total=Count('id'),
                blocked=Count('id', filter=Q(verdict='blocked')),
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
            blocked=Count('id', filter=Q(verdict='blocked')),
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

    qs = TrackerEvent.objects.filter(
        workspace=workspace,
        verdict='blocked',
    )

    # A whitelisted IP is no longer "blocked"
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
        qs = qs.filter(Q(ip__icontains=search) | Q(page_url__icontains=search))

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

    if workspace.suspended:
        raise ValidationError({
            'detail': (
                'Your plan was suspended. Renew it to restore access and '
                'keep using device rules.'
            )
        })
    if not workspace.has_plan_access():
        raise ValidationError({
            'detail': (
                'A plan is required to use device rules. '
                'Select a plan to get started.'
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

    events = TrackerEvent.objects.filter(workspace=workspace).order_by('-created_at')[:50]
    serializer = TrackerEventSerializer(events, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([AllowAny])
def abuse_report(request):
    return Response({'status': 'ok'})


@api_view(['POST'])
@permission_classes([AllowAny])
def google_safe_browsing_check(request):
    """Check a destination URL against Google Safe Browsing v5. Returns the
    verdict without creating or modifying any links. Used by the frontend
    to show warnings before link creation. Requires GOOGLE_SAFE_BROWSING_API_KEY."""
    api_key = getattr(settings, 'GOOGLE_SAFE_BROWSING_API_KEY', '').strip()
    if not api_key:
        return Response({'safe': True, 'detail': 'Safe Browsing not configured'})

    url = request.data.get('url', '').strip()
    if not url:
        return Response(
            {'errors': [{'field': 'url', 'detail': 'URL is required.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    import urllib.request
    import json as json_module

    payload = json_module.dumps({
        'client': {'clientId': 'vericlick', 'clientVersion': '2.0'},
        'threatInfo': {
            'threatTypes': [
                'MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE',
                'POTENTIALLY_HARMFUL_APPLICATION',
            ],
            'platformTypes': ['ANY_PLATFORM'],
            'threatEntryTypes': ['URL'],
            'threatEntries': [{'url': url}],
        },
    }).encode()

    gsb_url = f'https://safebrowsing.googleapis.com/v4/threatMatches:find?key={api_key}'
    try:
        req = urllib.request.Request(gsb_url, data=payload, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json_module.loads(resp.read())
            matches = result.get('matches', [])
            if matches:
                threats = [m.get('threatType', 'unknown') for m in matches]
                return Response({
                    'safe': False,
                    'detail': f'Detected threats: {", ".join(threats)}',
                    'threats': threats,
                })
            return Response({'safe': True})
    except Exception:
        logger.exception('Google Safe Browsing check failed')
        return Response({'safe': True, 'detail': 'Check failed, allowing by default'})


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
        if workspace.suspended:
            raise ValidationError({
                'detail': (
                    'Your plan was suspended. Renew it to restore access and '
                    'keep using IP rules.'
                )
            })
        if not workspace.has_plan_access():
            raise ValidationError({
                'detail': (
                    'A plan is required to use IP rules. '
                    'Select a plan to get started.'
                )
            })
        serializer.save(workspace=workspace, created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def whitelist(self, request, pk=None):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            event = TrackerEvent.objects.get(id=pk, workspace=workspace)
        except TrackerEvent.DoesNotExist:
            return Response(
                {'errors': [{'field': 'id', 'detail': 'Blocked entry not found'}]},
                status=status.HTTP_404_NOT_FOUND,
            )

        rule, created = IPRule.objects.get_or_create(
            workspace=workspace,
            ip_or_cidr=event.ip,
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
        if workspace.suspended:
            raise ValidationError({
                'detail': (
                    'Your plan was suspended. Renew it to restore access and '
                    'keep using country rules.'
                )
            })
        if not workspace.has_plan_access():
            raise ValidationError({
                'detail': (
                    'A plan is required to use country rules. '
                    'Select a plan to get started.'
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
