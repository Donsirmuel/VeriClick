from datetime import timedelta
import logging
import re
from django.db.models import Count, F, Q
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
    ShieldConfig, DomainRegistry, InstallToken,
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
    InstallTokenSerializer,
    InstallTokenCreateSerializer,
    ShieldConfigSerializer,
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


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def workspace_shield_config(request):
    """Authenticated shield config for the dashboard. No trackerSecret needed."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    config = getattr(workspace, 'shield_config', None)
    if not config:
        config = ShieldConfig.objects.create(workspace=workspace)

    if request.method == 'GET':
        return Response(ShieldConfigSerializer(config).data)

    serializer = ShieldConfigSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def workspace_onboarding(request):
    """Complete the onboarding wizard. Marks workspace as onboarded and optionally registers the first domain."""
    workspace = Workspace.objects.get(owner=request.user)
    onboarding_type = request.data.get('type')  # 'shield' or 'redirect'
    domain_name = request.data.get('domain', '').strip().lower()

    if onboarding_type not in ('shield', 'redirect'):
        return Response({'errors': [{'field': 'type', 'detail': 'Must be shield or redirect'}]}, status=400)
    if not domain_name:
        return Response({'errors': [{'field': 'domain', 'detail': 'Domain is required'}]}, status=400)

    # Mark onboarding complete regardless of plan
    workspace.onboarding_type = onboarding_type

    # If user has a plan, also register the domain
    if workspace.has_plan_access():
        active_plan = workspace.active_plan
        current_count = workspace.domains.filter(is_active=True).count()
        if current_count >= active_plan.domain_limit:
            workspace.save(update_fields=['onboarding_type'])
            return Response({'errors': [{'field': 'domain', 'detail': f'Domain limit reached ({active_plan.domain_limit})'}]}, status=400)

        # Scoped to this workspace: a global check would let the first tenant to
        # claim a domain lock every other tenant out of it.
        if workspace.domains.filter(domain=domain_name, is_active=True).exists():
            workspace.save(update_fields=['onboarding_type'])
            return Response({'errors': [{'field': 'domain', 'detail': 'This domain is already registered'}]}, status=400)

        purpose = 'protection' if onboarding_type == 'shield' else 'redirect'
        domain = DomainRegistry.objects.create(
            workspace=workspace,
            domain=domain_name,
            purpose=purpose,
        )
        workspace.onboarding_complete = True
        workspace.save(update_fields=['onboarding_complete', 'onboarding_type'])
        return Response({
            'domain': {'id': str(domain.id), 'domain': domain.domain, 'purpose': domain.purpose},
            'workspace': WorkspaceSerializer(workspace).data,
        })

    # No plan — just mark onboarding as complete so user can browse the app
    workspace.onboarding_complete = True
    workspace.save(update_fields=['onboarding_complete', 'onboarding_type'])

    return Response({
        'workspace': WorkspaceSerializer(workspace).data,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def workspace_snippet(request):
    """Return the shield.js snippet for a given domain."""
    workspace = Workspace.objects.get(owner=request.user)
    domain_name = request.query_params.get('domain', '').strip().lower()

    if not domain_name:
        return Response({'errors': [{'field': 'domain', 'detail': 'Domain query param required'}]}, status=400)

    domain = DomainRegistry.objects.filter(workspace=workspace, domain=domain_name, is_active=True).first()
    if not domain:
        return Response({'errors': [{'field': 'domain', 'detail': 'Domain not found'}]}, status=404)

    api_key = str(workspace.tracker_secret)
    api_base = request.build_absolute_uri('/api/').rstrip('/')

    if not domain.verification_token:
        domain.generate_verification_token()
    verification_token = domain.verification_token

    snippet = (
        f'<!-- VeriClick — anti-bot protection + domain verification -->\n'
        f'<meta name="vericlick-verification" content="{verification_token}">\n'
        f'<script src="{api_base}/shield.js" data-api-key="{api_key}" defer></script>'
    )

    return Response({
        'snippet': snippet,
        'domain': domain.domain,
        'apiKey': api_key,
        'apiBase': api_base,
    })


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
    limit = active_plan.domain_limit
    if current_count >= limit:
        plan_name = active_plan.name
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

    # RedirectRoute.domain cascades, so the link goes with the domain. Capture
    # it first so the response can say exactly what was removed.
    route = getattr(domain, 'redirect_route', None)
    removed_route = (
        {'slug': route.slug, 'destination_url': route.destination_url} if route else None
    )

    # Hard delete — the slot is freed immediately and can be reused right away.
    domain.delete()

    active_plan = workspace.active_plan
    return Response({
        'deleted': True,
        'removed_redirect': removed_route,
        'domains_used': workspace.domains.filter(is_active=True).count(),
        'domain_limit': active_plan.domain_limit if active_plan else 0,
    })


# ---------------------------------------------------------------------------
# Domain Verification
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def domain_verify_challenge(request, domain_id):
    """Return the verification challenge for a domain. Generates a token if
    one doesn't exist yet, then returns the meta tag or DNS TXT record the
    user needs to add."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        domain_obj = DomainRegistry.objects.get(id=domain_id, workspace=workspace)
    except DomainRegistry.DoesNotExist:
        return Response(
            {'errors': [{'field': 'domain', 'detail': 'Domain not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    method = request.query_params.get('method', 'html_meta')
    if method not in ('html_meta', 'dns_txt'):
        method = 'html_meta'

    # Generate the token once and keep it stable. The same token backs both
    # methods, so switching between them must not invalidate a record the user
    # has already published on their site or in DNS.
    if not domain_obj.verification_token:
        domain_obj.verification_method = method
        domain_obj.generate_verification_token()
    elif domain_obj.verification_method != method:
        domain_obj.verification_method = method
        domain_obj.save(update_fields=['verification_method'])

    token = domain_obj.verification_token
    meta_tag = f'<meta name="vericlick-verification" content="{token}">'
    dns_record = f'_vericlick-challenge.{domain_obj.domain}'

    return Response({
        'method': domain_obj.verification_method,
        'token': token,
        'meta_tag': meta_tag,
        'dns_name': dns_record,
        'dns_value': f'vericlick-verify={token}',
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def domain_verify_confirm(request, domain_id):
    """Attempt to verify domain ownership by checking for the verification
    challenge on the live domain."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        domain_obj = DomainRegistry.objects.get(id=domain_id, workspace=workspace)
    except DomainRegistry.DoesNotExist:
        return Response(
            {'errors': [{'field': 'domain', 'detail': 'Domain not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    if domain_obj.verified:
        return Response({
            'verified': True,
            'verified_at': domain_obj.verified_at,
            'health_status': domain_obj.health_status,
        })

    if not domain_obj.verification_token:
        return Response(
            {'errors': [{'field': 'verification', 'detail': 'No verification challenge found. Please start verification first.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token = domain_obj.verification_token
    method = domain_obj.verification_method or 'html_meta'

    verified = False
    if method == 'html_meta':
        verified = _check_meta_tag(domain_obj.domain, token)
    elif method == 'dns_txt':
        verified = _check_dns_txt(domain_obj.domain, token)

    if verified:
        from django.utils import timezone as tz
        domain_obj.verified = True
        domain_obj.verified_at = tz.now()
        domain_obj.health_status = 'healthy'
        domain_obj.last_health_check = tz.now()
        domain_obj.save(update_fields=[
            'verified', 'verified_at', 'health_status', 'last_health_check',
        ])
        return Response({
            'verified': True,
            'verified_at': domain_obj.verified_at,
            'health_status': domain_obj.health_status,
        })

    return Response({
        'verified': False,
        'error': 'meta_tag_not_found' if method == 'html_meta' else 'dns_txt_not_found',
        'detail': (
            f'We couldn\'t find the verification record on {domain_obj.domain}. '
            'Make sure you saved your changes and wait a few minutes, then try again.'
        ),
    })


def _check_meta_tag(domain, expected_token):
    """Fetch the domain homepage and look for the verification meta tag.

    Tries HTTPS first: an HTTPS-only site (HSTS, or no listener on :80) can
    never be reached over plain HTTP.
    """
    import urllib.request
    import urllib.error
    import re

    # Attribute order and spacing vary between site builders, so match the two
    # orderings rather than one rigid form.
    token_re = re.escape(expected_token)
    patterns = (
        r'<meta\s+name=["\']vericlick-verification["\']\s+content=["\']' + token_re + r'["\']',
        r'<meta\s+content=["\']' + token_re + r'["\']\s+name=["\']vericlick-verification["\']',
    )

    for scheme in ('https', 'http'):
        try:
            req = urllib.request.Request(
                f'{scheme}://{domain}/',
                headers={'User-Agent': 'VeriClick/1.0 Verification Bot'},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status != 200:
                    continue
                html = resp.read(512 * 1024).decode('utf-8', errors='ignore')
                if any(re.search(p, html, re.IGNORECASE) for p in patterns):
                    return True
        except (urllib.error.URLError, OSError, ValueError):
            continue
    return False


def _check_dns_txt(domain, expected_token):
    """Check DNS TXT records for the verification token."""
    try:
        import dns.resolver
        answers = dns.resolver.resolve(f'_vericlick-challenge.{domain}', 'TXT')
        for rdata in answers:
            txt = b''.join(rdata.strings).decode('utf-8', errors='ignore')
            if f'vericlick-verify={expected_token}' in txt:
                return True
        return False
    except Exception:
        return False


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def domain_recheck(request, domain_id):
    """Re-run health check on a verified domain."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        domain_obj = DomainRegistry.objects.get(id=domain_id, workspace=workspace)
    except DomainRegistry.DoesNotExist:
        return Response(
            {'errors': [{'field': 'domain', 'detail': 'Domain not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(
            f'http://{domain_obj.domain}/',
            headers={'User-Agent': 'VeriClick/1.0 Health Check'},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            healthy = resp.status < 400
    except (urllib.error.URLError, OSError, ValueError):
        healthy = False

    from django.utils import timezone as tz
    domain_obj.health_status = 'healthy' if healthy else 'unhealthy'
    domain_obj.last_health_check = tz.now()
    domain_obj.save(update_fields=['health_status', 'last_health_check'])

    return Response({
        'health_status': domain_obj.health_status,
        'last_health_check': domain_obj.last_health_check,
    })


# ---------------------------------------------------------------------------
# Install Tokens
# ---------------------------------------------------------------------------

MAX_INSTALL_TOKENS = 5


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def install_token_list_create(request):
    """List active install tokens or generate a new one. The raw token is
    returned ONLY on creation — it cannot be recovered."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        tokens = InstallToken.objects.filter(workspace=workspace)
        return Response(InstallTokenSerializer(tokens, many=True).data)

    # POST — generate new token
    active_count = InstallToken.objects.filter(workspace=workspace, is_active=True).count()
    if active_count >= MAX_INSTALL_TOKENS:
        return Response(
            {'errors': [{'field': 'token', 'detail': f'You can have at most {MAX_INSTALL_TOKENS} active install tokens. Revoke one first.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = InstallTokenCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    label = serializer.validated_data.get('label', 'Primary')

    raw_token, token_instance = InstallToken.create_for_workspace(workspace, label=label)

    return Response({
        'id': str(token_instance.id),
        'token': raw_token,
        'token_prefix': token_instance.token_prefix,
        'label': token_instance.label,
        'expires_at': token_instance.expires_at,
        'created_at': token_instance.created_at,
    }, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def install_token_revoke(request, token_id):
    """Revoke an install token."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        token = InstallToken.objects.get(id=token_id, workspace=workspace)
    except InstallToken.DoesNotExist:
        return Response(
            {'errors': [{'field': 'token', 'detail': 'Token not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )
    token.is_active = False
    token.save(update_fields=['is_active'])
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Redirect Domains (for edge proxy CNAME setup)
# ---------------------------------------------------------------------------

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def redirect_domain_list_create(request):
    """List or add redirect-purpose domains."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        domains = DomainRegistry.objects.filter(
            workspace=workspace, is_active=True,
        ).filter(
            # Redirect-purpose domains, plus protection domains whose ownership
            # is already proven — those are reusable as redirect targets.
            Q(purpose='redirect') | Q(purpose='protection', verified=True),
        ).order_by('-created_at')
        return Response(DomainRegistrySerializer(domains, many=True).data)

    serializer = DomainRegistrySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    domain_name = serializer.validated_data['domain']

    # Already registered in this workspace? Reuse it rather than rejecting —
    # a verified protection domain doubles as a redirect domain.
    existing = DomainRegistry.objects.filter(
        workspace=workspace, domain=domain_name, is_active=True,
    ).first()
    if existing:
        if existing.purpose == 'redirect' or existing.verified:
            return Response(DomainRegistrySerializer(existing).data)
        return Response(
            {'errors': [{'field': 'domain', 'detail':
                'This domain is already registered for bot protection but is not '
                'verified yet. Verify it on the Domains page to use it for redirects.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Check limit (redirect domains count toward the same domain limit)
    active_plan = workspace.active_plan
    current_count = DomainRegistry.objects.filter(workspace=workspace, is_active=True).count()
    limit = active_plan.domain_limit
    if current_count >= limit:
        plan_name = active_plan.name
        return Response(
            {'errors': [{'field': 'domain', 'detail': f'You\'ve reached the {limit}-domain limit on {plan_name}. Upgrade to add more.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    domain = DomainRegistry.objects.create(
        workspace=workspace, domain=domain_name, purpose='redirect',
    )
    return Response(DomainRegistrySerializer(domain).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def redirect_domain_verify_cname(request, domain_id):
    """Check that a redirect domain's CNAME points to edge.vericlick.cc."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        domain_obj = DomainRegistry.objects.get(
            id=domain_id, workspace=workspace, is_active=True,
        )
    except DomainRegistry.DoesNotExist:
        return Response(
            {'errors': [{'field': 'domain', 'detail': 'Redirect domain not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    import dns.resolver
    expected_cname = 'edge.vericlick.cc'

    try:
        answers = dns.resolver.resolve(domain_obj.domain, 'CNAME')
        for rdata in answers:
            target = str(rdata.target).rstrip('.')
            if target.lower() == expected_cname.lower():
                return Response({
                    'cname_ok': True,
                    'target': target,
                    'detail': f'CNAME correctly points to {expected_cname}.',
                })
        return Response({
            'cname_ok': False,
            'target': str(answers[0].target).rstrip('.'),
            'detail': f'CNAME points to {str(answers[0].target).rstrip(".")} instead of {expected_cname}.',
        })
    except dns.resolver.NoAnswer:
        return Response({
            'cname_ok': False,
            'target': None,
            'detail': f'No CNAME record found. Add a CNAME record pointing to {expected_cname}.',
        })
    except dns.resolver.NXDOMAIN:
        return Response({
            'cname_ok': False,
            'target': None,
            'detail': f'Domain does not exist. Make sure DNS is configured.',
        })
    except Exception as exc:
        logger.warning('CNAME check failed for %s: %s', domain_obj.domain, exc)
        return Response({
            'cname_ok': False,
            'target': None,
            'detail': 'DNS lookup failed. Please try again in a few minutes.',
        })


# ---------------------------------------------------------------------------
# Redirect Routes
# ---------------------------------------------------------------------------

# SlugField(max_length=200) with the character set the wizard enforces client-side.
_SLUG_RE = re.compile(r'^[a-zA-Z0-9_-]*$')


def _clean_route_field(field, raw):
    """Validate one redirect-route field.

    Returns (cleaned_value, error_detail). Shared by create and PATCH so the
    two paths cannot drift — PATCH previously setattr'd request data straight
    onto the model, which let an invalid bot_action through and turned a null
    fallback_url into a 500 on a NOT NULL column.
    """
    from .models import RedirectRoute

    if field == 'bot_action':
        value = (raw or '').strip()
        if value not in RedirectRoute.BotAction.values:
            return None, 'Choose a valid bot handling option.'
        return value, None

    if field == 'slug':
        value = (raw or '').strip()
        if len(value) > 200:
            return None, 'Link path must be 200 characters or fewer.'
        if not _SLUG_RE.match(value):
            return None, 'Link path may only contain letters, numbers, hyphens and underscores.'
        return value, None

    if field in ('destination_url', 'fallback_url'):
        value = (raw or '').strip()
        # fallback_url is optional; destination_url is required by the caller.
        if value:
            if len(value) > 2048:
                return None, 'URL is too long.'
            if not value.startswith(('http://', 'https://')):
                return None, 'URL must start with http:// or https://.'
        return value, None

    if field == 'is_active':
        if isinstance(raw, bool):
            return raw, None
        return None, 'is_active must be true or false.'

    return raw, None


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def redirect_route_list_create(request):
    """List or create redirect routes. Creating a new route for a domain that
    already has one auto-replaces the old one."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    from .models import RedirectRoute
    from datetime import timedelta

    if request.method == 'GET':
        routes = RedirectRoute.objects.filter(
            workspace=workspace,
        ).select_related('domain').order_by('-created_at')
        data = []
        for r in routes:
            data.append({
                'id': str(r.id),
                'domain': {'id': str(r.domain_id), 'domain': r.domain.domain},
                'slug': r.slug,
                'destination_url': r.destination_url,
                'is_active': r.is_active,
                'bot_action': r.bot_action,
                'fallback_url': r.fallback_url,
                'expires_at': r.expires_at,
                'clicks_count': r.clicks_count,
                'abuse_status': r.abuse_status,
                'created_at': r.created_at,
            })
        return Response(data)

    # POST — create route. Every field goes through the same validator PATCH
    # uses, so the two paths cannot accept different things.
    domain_id = request.data.get('domain_id')
    cleaned = {}
    for field, raw in (
        ('destination_url', request.data.get('destination_url')),
        ('slug', request.data.get('slug')),
        ('bot_action', request.data.get('bot_action') or 'honeypot'),
        # fallback_url is NOT NULL on the model — empty means "no bot fallback".
        ('fallback_url', request.data.get('fallback_url')),
    ):
        value, error = _clean_route_field(field, raw)
        if error:
            return Response(
                {'errors': [{'field': field, 'detail': error}]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cleaned[field] = value

    destination_url = cleaned['destination_url']
    slug = cleaned['slug']
    bot_action = cleaned['bot_action']
    fallback_url = cleaned['fallback_url']

    if not domain_id or not destination_url:
        return Response(
            {'errors': [{'field': 'domain_id', 'detail': 'domain_id and destination_url are required.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        domain_obj = DomainRegistry.objects.get(
            id=domain_id, workspace=workspace, is_active=True,
        )
    except DomainRegistry.DoesNotExist:
        return Response(
            {'errors': [{'field': 'domain_id', 'detail': 'Redirect domain not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not domain_obj.verified:
        return Response(
            {'errors': [{'field': 'domain_id', 'detail': 'Domain must be verified before creating a redirect.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Safety check on destination
    destination_safe = None
    try:
        import urllib.request as _req
        import urllib.error as _err
        _r = _req.Request(destination_url, method='HEAD',
                          headers={'User-Agent': 'VeriClick/1.0 SafetyCheck'})
        with _req.urlopen(_r, timeout=10) as _resp:
            destination_safe = _resp.status < 400
    except Exception:
        destination_safe = None

    # Auto-replace: delete existing route for this domain
    RedirectRoute.objects.filter(domain=domain_obj).delete()

    route = RedirectRoute.objects.create(
        workspace=workspace,
        domain=domain_obj,
        slug=slug,
        destination_url=destination_url,
        bot_action=bot_action,
        fallback_url=fallback_url,
        expires_at=timezone.now() + timedelta(days=7),
        destination_safe=destination_safe,
    )

    return Response({
        'id': str(route.id),
        'domain': {'id': str(route.domain_id), 'domain': domain_obj.domain},
        'slug': route.slug,
        'destination_url': route.destination_url,
        'is_active': route.is_active,
        'bot_action': route.bot_action,
        'fallback_url': route.fallback_url,
        'expires_at': route.expires_at,
        'clicks_count': route.clicks_count,
        'abuse_status': route.abuse_status,
        'destination_safe': route.destination_safe,
        'created_at': route.created_at,
    }, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def redirect_route_detail(request, route_id):
    """Get, update, or delete a redirect route."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    from .models import RedirectRoute

    try:
        route = RedirectRoute.objects.select_related('domain').get(
            id=route_id, workspace=workspace,
        )
    except RedirectRoute.DoesNotExist:
        return Response(
            {'errors': [{'field': 'route', 'detail': 'Redirect route not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == 'GET':
        return Response({
            'id': str(route.id),
            'domain': {'id': str(route.domain_id), 'domain': route.domain.domain},
            'slug': route.slug,
            'destination_url': route.destination_url,
            'is_active': route.is_active,
            'bot_action': route.bot_action,
            'fallback_url': route.fallback_url,
            'expires_at': route.expires_at,
            'clicks_count': route.clicks_count,
            'abuse_status': route.abuse_status,
            'destination_safe': route.destination_safe,
            'created_at': route.created_at,
        })

    if request.method == 'DELETE':
        route.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH
    fields_to_update = []
    for field in ('destination_url', 'bot_action', 'fallback_url', 'slug', 'is_active'):
        if field not in request.data:
            continue
        value, error = _clean_route_field(field, request.data[field])
        if error:
            return Response(
                {'errors': [{'field': field, 'detail': error}]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        setattr(route, field, value)
        fields_to_update.append(field)

    if field_error := (
        'A destination URL is required.'
        if 'destination_url' in fields_to_update and not route.destination_url else None
    ):
        return Response(
            {'errors': [{'field': 'destination_url', 'detail': field_error}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if fields_to_update:
        fields_to_update.append('updated_at')
        route.save(update_fields=fields_to_update)

    return Response({
        'id': str(route.id),
        'domain': {'id': str(route.domain_id), 'domain': route.domain.domain},
        'slug': route.slug,
        'destination_url': route.destination_url,
        'is_active': route.is_active,
        'bot_action': route.bot_action,
        'fallback_url': route.fallback_url,
        'expires_at': route.expires_at,
        'clicks_count': route.clicks_count,
        'abuse_status': route.abuse_status,
        'created_at': route.created_at,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def redirect_route_renew(request, route_id):
    """Renew a redirect route for 7 more days."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    from .models import RedirectRoute
    from datetime import timedelta

    try:
        route = RedirectRoute.objects.get(id=route_id, workspace=workspace)
    except RedirectRoute.DoesNotExist:
        return Response(
            {'errors': [{'field': 'route', 'detail': 'Redirect route not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    route.expires_at = timezone.now() + timedelta(days=7)
    route.is_active = True
    route.save(update_fields=['expires_at', 'is_active'])

    return Response({
        'expires_at': route.expires_at,
        'is_active': route.is_active,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def redirect_route_activate(request, route_id):
    """Re-activate an expired/disabled redirect route."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    from .models import RedirectRoute
    from datetime import timedelta

    try:
        route = RedirectRoute.objects.get(id=route_id, workspace=workspace)
    except RedirectRoute.DoesNotExist:
        return Response(
            {'errors': [{'field': 'route', 'detail': 'Redirect route not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Cannot activate an expired route — must renew
    if route.expires_at and route.expires_at < timezone.now():
        return Response(
            {'errors': [{'field': 'route', 'detail': 'This redirect has expired. Use renew to start a new 7-day period.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    route.is_active = True
    route.save(update_fields=['is_active'])

    return Response({'is_active': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def redirect_route_deactivate(request, route_id):
    """Deactivate a redirect route."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    from .models import RedirectRoute

    try:
        route = RedirectRoute.objects.get(id=route_id, workspace=workspace)
    except RedirectRoute.DoesNotExist:
        return Response(
            {'errors': [{'field': 'route', 'detail': 'Redirect route not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    route.is_active = False
    route.save(update_fields=['is_active'])

    return Response({'is_active': False})


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
    # Subscriptions were removed; one-time period purchases are the only mode.
    # Defaulting to the dropped 'subscription' value 400'd every caller that
    # omitted billing_mode.
    billing_mode = (request.data.get('billing_mode') or CheckoutIntent.BillingMode.PERIOD).strip()
    if billing_mode not in CheckoutIntent.BillingMode.values:
        return Response(
            {'errors': [{'field': 'billing_mode', 'detail': 'Unknown billing mode.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Weekly (7 days) or monthly (30 days) of access. Each is a separate Bachs
    # product because Bachs holds the price on the product.
    billing_period = (request.data.get('billing_period') or Plan.BillingPeriod.WEEKLY).strip()
    if billing_period not in Plan.BillingPeriod.values:
        return Response(
            {'errors': [{'field': 'billing_period', 'detail': 'Choose either weekly or monthly billing.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    product_id = (
        plan.bachs_product_for(billing_period)
        if billing_mode == 'period' else plan.bachs_product_id
    )
    if not product_id:
        return Response(
            {'errors': [{'field': 'plan_code', 'detail': f'The {plan.name} plan isn\'t ready to buy on a {billing_period} basis yet. Try the other billing period or contact support.'}]},
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
        billing_period=billing_period,
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
    """DEPRECATED: Legacy tracker.js endpoint. Use shield_verify + shield_telemetry instead.
    Kept for backward compatibility with existing tracker.js installs."""
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

    # Extract domain from page_url
    domain = ''
    page_url_val = request.data.get('page_url', '')
    if page_url_val:
        try:
            from urllib.parse import urlparse
            domain = (urlparse(page_url_val).hostname or '').lower().lstrip('www.')
        except Exception:
            pass

    data = {
        'workspace': workspace.id,
        'page_url': page_url_val,
        'domain': domain,
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
    install_token_raw = request.data.get('install_token') or ''

    workspace = None
    if install_token_raw:
        workspace, _ = InstallToken.verify_token(install_token_raw)
    elif api_key:
        workspace = Workspace.objects.filter(tracker_secret=api_key).first()

    if not workspace:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'Valid api_key or install_token is required'}]},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    page_url = request.data.get('page_url') or ''
    if not page_url:
        return Response(
            {'errors': [{'field': 'page_url', 'detail': 'page_url is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Domain enforcement: extract domain from page_url and verify it's registered.
    from urllib.parse import urlparse
    try:
        parsed = urlparse(page_url)
        domain = parsed.hostname or ''
    except Exception:
        domain = ''

    # Strip only a leading 'www.' prefix for matching.
    check_domain = domain.lower()
    if check_domain.startswith('www.'):
        check_domain = check_domain[4:]

    domain_obj = DomainRegistry.objects.filter(
        workspace=workspace, domain=check_domain, is_active=True,
    ).first() if check_domain else None
    if not domain_obj:
        return Response({
            'verdict': 'allow',
            'is_bot': False,
            'reason': 'unregistered-domain',
            'reason_label': 'Unregistered domain',
            'bot_action': 'log',
        })

    # Loading the script proves control of the registered protection domain.
    if domain_obj.purpose == DomainRegistry.Purpose.PROTECTION:
        update_fields = []
        if not domain_obj.verified:
            domain_obj.verified = True
            domain_obj.verified_at = timezone.now()
            update_fields.extend(['verified', 'verified_at'])
        if not domain_obj.script_installed:
            domain_obj.script_installed = True
            update_fields.append('script_installed')
        if update_fields:
            domain_obj.save(update_fields=update_fields)

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

    # Extract domain from page_url
    domain = ''
    if page_url:
        try:
            from urllib.parse import urlparse
            domain = (urlparse(page_url).hostname or '').lower().lstrip('www.')
        except Exception:
            pass

    tracker_signals = request.data.get('signals') or {}
    trajectory = tracker_signals.get('trajectory') or {}
    click_metrics = tracker_signals.get('click_metrics') or {}

    from .services import score_from_signals, compute_bot_score
    bot_signals = score_from_signals(request, tracker_signals, trajectory, click_metrics)
    bot_result = compute_bot_score(bot_signals)

    TrackerEvent.objects.create(
        workspace=workspace,
        page_url=page_url,
        domain=domain,
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
    install_token_raw = request.query_params.get('install_token') or ''

    workspace = None
    if install_token_raw:
        workspace, _ = InstallToken.verify_token(install_token_raw)
    elif api_key:
        workspace = Workspace.objects.filter(tracker_secret=api_key).first()

    if not workspace:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'Valid api_key or install_token is required'}]},
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
    install_token_raw = request.data.get('install_token') or ''

    workspace = None
    if install_token_raw:
        workspace, _ = InstallToken.verify_token(install_token_raw)
    elif api_key:
        workspace = Workspace.objects.filter(tracker_secret=api_key).first()

    if not workspace:
        return Response(
            {'errors': [{'field': 'api_key', 'detail': 'Valid api_key or install_token is required'}]},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if workspace.plan_status == 'suspended':
        return Response({'status': 'ok'})

    # Domain enforcement: silently ignore telemetry from unregistered domains.
    page_url = request.data.get('page_url', '')
    if page_url:
        from urllib.parse import urlparse
        try:
            parsed = urlparse(page_url)
            domain = (parsed.hostname or '').lower().lstrip('www.')
        except Exception:
            domain = ''
        if domain and not DomainRegistry.objects.filter(
            workspace=workspace, domain=domain, is_active=True,
        ).exists():
            return Response({'status': 'ok'})

    _log_shield_event(request, workspace, page_url, blocked=False, reason='telemetry')
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

    # Optional domain filter
    domain_filter = request.query_params.get('domain', '').strip().lower()

    # Use TrackerEvent (script telemetry) instead of ClickLog (link redirects)
    events_24h = TrackerEvent.objects.filter(
        workspace=workspace, created_at__gte=twenty_four_hours_ago
    )
    if domain_filter:
        events_24h = events_24h.filter(domain=domain_filter)
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
    domain_filter = request.query_params.get('domain', '').strip().lower()

    since = timezone.now() - timedelta(days=days)

    qs = TrackerEvent.objects.filter(workspace=workspace, created_at__gte=since)
    if domain_filter:
        qs = qs.filter(domain=domain_filter)

    qs = (
        qs
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
    domain_filter = request.query_params.get('domain', '').strip().lower()
    since = timezone.now() - timedelta(days=days)

    qs = TrackerEvent.objects.filter(
        workspace=workspace, created_at__gte=since,
    )
    if domain_filter:
        qs = qs.filter(domain=domain_filter)

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

    domain_filter = request.query_params.get('domain', '').strip().lower()
    if domain_filter:
        qs = qs.filter(domain=domain_filter)

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
def dashboard_domains(request):
    """Return the list of domains with traffic in the last 30 days, plus their
    registered status. Used by the frontend domain-filter dropdown."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    since = timezone.now() - timedelta(days=30)
    # Distinct domains that have logged events recently
    active_domains = set(
        TrackerEvent.objects.filter(
            workspace=workspace, created_at__gte=since,
        ).exclude(domain='').values_list('domain', flat=True).distinct()
    )
    # All registered domains
    registered_domains = set(
        DomainRegistry.objects.filter(
            workspace=workspace, is_active=True,
        ).values_list('domain', flat=True)
    )

    # Merge: registered domains always appear; active-only domains appear too
    all_domains = registered_domains | active_domains

    result = []
    for domain in sorted(all_domains):
        result.append({
            'domain': domain,
            'registered': domain in registered_domains,
            'hasTraffic': domain in active_domains,
        })
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_activity(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    qs = TrackerEvent.objects.filter(workspace=workspace)
    domain_filter = request.query_params.get('domain', '').strip().lower()
    if domain_filter:
        qs = qs.filter(domain=domain_filter)

    events = qs.order_by('-created_at')[:50]
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


# ---------------------------------------------------------------------------
# Edge Sync — edge proxy polls this for routes + site configs
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def edge_routes_sync(request):
    """Edge proxy polls this for routes + site configs. Authenticated via
    X-Edge-Api-Key header."""
    from .models import EdgeSyncCredential, RedirectRoute, IPRule, CountryRule

    api_key = request.headers.get('X-Edge-Api-Key', '')
    if not api_key:
        return Response({'error': 'X-Edge-Api-Key header required'}, status=status.HTTP_401_UNAUTHORIZED)

    workspace, cred = EdgeSyncCredential.verify_key(api_key)
    if not workspace:
        return Response({'error': 'Invalid API key'}, status=status.HTTP_401_UNAUTHORIZED)

    # Optional domain filter
    domain_filter = request.query_params.get('domain', '')

    routes_qs = RedirectRoute.objects.filter(
        workspace=workspace,
        is_active=True,
        domain__is_active=True,
    ).select_related('domain')

    if domain_filter:
        routes_qs = routes_qs.filter(domain__domain=domain_filter)

    route_data = []
    for r in routes_qs:
        route_data.append({
            'domain': r.domain.domain,
            'slug': r.slug,
            'destination_url': r.destination_url,
            'is_active': r.is_active,
            'bot_action': r.bot_action,
            'fallback_url': r.fallback_url,
            'expires_at': r.expires_at.isoformat() if r.expires_at else None,
        })

    # Blocked IPs
    blocked_ips = list(
        IPRule.objects.filter(
            workspace=workspace, action='deny', is_active=True,
        ).values_list('ip_or_cidr', flat=True)
    )

    # Country rules
    country_rules = list(
        CountryRule.objects.filter(
            workspace=workspace, is_active=True,
        ).values('country_code', 'action')
    )

    # Site configs
    from .models import ShieldConfig
    site_configs = ShieldConfig.objects.filter(workspace=workspace)
    config_data = []
    for sc in site_configs:
        config_data.append({
            'workspace_id': str(workspace.id),
            'protection_mode': sc.protection_mode,
            'bot_action': sc.bot_action,
            'protected_paths': sc.protected_paths,
            'blocked_paths': sc.blocked_paths,
            'rate_limit_per_hour': sc.rate_limit_per_hour,
        })

    return Response({
        'sync_token': int(timezone.now().timestamp()),
        'routes': route_data,
        'blocked_ips': blocked_ips,
        'country_rules': country_rules,
        'site_configs': config_data,
    })


# ---------------------------------------------------------------------------
# Edge Validate Domain — Caddy on-demand TLS check
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def edge_validate_domain(request):
    """Caddy calls this before issuing a TLS certificate for a domain.
    Returns 200 if the domain is known (has an active redirect route),
    404 otherwise (Caddy won't issue a cert)."""
    from .models import RedirectRoute

    domain = request.query_params.get('domain', '')
    if not domain:
        return Response(status=status.HTTP_404_NOT_FOUND)

    # vericlick.cc itself is always valid
    if domain == 'vericlick.cc':
        return Response(status=status.HTTP_200_OK)

    # Check if any active redirect route exists for this domain
    exists = RedirectRoute.objects.filter(
        is_active=True,
        domain__domain=domain,
        domain__is_active=True,
    ).exists()

    return Response(status=status.HTTP_200_OK if exists else status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Edge Events — batch push from edge proxy
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([AllowAny])
def edge_events_batch(request):
    """Edge proxy batch-pushes click events every 60 seconds."""
    from .models import EdgeSyncCredential, RedirectRoute, RedirectEvent

    api_key = request.headers.get('X-Edge-Api-Key', '')
    if not api_key:
        return Response({'error': 'X-Edge-Api-Key header required'}, status=status.HTTP_401_UNAUTHORIZED)

    workspace, _ = EdgeSyncCredential.verify_key(api_key)
    if not workspace:
        return Response({'error': 'Invalid API key'}, status=status.HTTP_401_UNAUTHORIZED)

    events_data = request.data.get('events', [])
    if not isinstance(events_data, list):
        return Response({'error': 'events must be a list'}, status=status.HTTP_400_BAD_REQUEST)

    created = 0
    for ev in events_data[:500]:  # cap at 500 per batch
        domain = ev.get('domain', '')
        slug = ev.get('slug', '')
        ip = ev.get('ip', '')
        user_agent = ev.get('user_agent', '')
        destination = ev.get('destination', '')
        verdict = ev.get('verdict', 'allowed')
        is_bot = ev.get('is_bot', False)
        country_code = ev.get('country_code', '')
        country = ev.get('country', '')

        if not domain or not ip:
            continue

        # Find the route
        route = RedirectRoute.objects.filter(
            domain__domain=domain,
            workspace=workspace,
        ).first()

        if not route:
            continue

        RedirectEvent.objects.create(
            workspace=workspace,
            redirect_route=route,
            domain=domain,
            slug=slug,
            ip=ip,
            user_agent=user_agent[:1000],
            destination=destination[:2048],
            verdict=verdict,
            is_bot=is_bot,
            country_code=country_code[:2],
            country=country[:64],
        )
        # Increment route click counter
        RedirectRoute.objects.filter(id=route.id).update(
            clicks_count=F('clicks_count') + 1,
        )
        created += 1

    return Response({'created': created})


# ---------------------------------------------------------------------------
# Edge Credential Management (admin)
# ---------------------------------------------------------------------------

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def edge_credential_list_create(request):
    """List or create edge sync credentials for the workspace."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    from .models import EdgeSyncCredential

    if request.method == 'GET':
        creds = EdgeSyncCredential.objects.filter(workspace=workspace)
        return Response([
            {
                'id': str(c.id),
                'label': c.label,
                'keyPrefix': c.key_prefix,
                'isActive': c.is_active,
                'lastSyncAt': c.last_sync_at,
                'createdAt': c.created_at,
            }
            for c in creds
        ])

    # POST
    active_count = EdgeSyncCredential.objects.filter(workspace=workspace, is_active=True).count()
    if active_count >= 2:
        return Response(
            {'errors': [{'field': 'credential', 'detail': 'Maximum 2 active credentials per workspace. Revoke one first.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    label = request.data.get('label', 'default')
    raw_key, instance = EdgeSyncCredential.create_for_workspace(workspace, label=label)

    return Response({
        'id': str(instance.id),
        'key': raw_key,
        'keyPrefix': instance.key_prefix,
        'label': instance.label,
        'createdAt': instance.created_at,
    }, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def edge_credential_revoke(request, credential_id):
    """Revoke an edge sync credential."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    from .models import EdgeSyncCredential

    try:
        cred = EdgeSyncCredential.objects.get(id=credential_id, workspace=workspace)
    except EdgeSyncCredential.DoesNotExist:
        return Response(
            {'errors': [{'field': 'credential', 'detail': 'Credential not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )
    cred.is_active = False
    cred.save(update_fields=['is_active'])
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Test Installation — checks if script loads on user's domain
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_installation(request):
    """Fetch the user's domain and check if the VeriClick script is present."""
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    domain_id = request.data.get('domain_id')
    if not domain_id:
        return Response(
            {'errors': [{'field': 'domain_id', 'detail': 'domain_id is required.'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        domain_obj = DomainRegistry.objects.get(id=domain_id, workspace=workspace)
    except DomainRegistry.DoesNotExist:
        return Response(
            {'errors': [{'field': 'domain_id', 'detail': 'Domain not found.'}]},
            status=status.HTTP_404_NOT_FOUND,
        )

    import urllib.request
    import urllib.error
    try:
        req = urllib.request.Request(
            f'https://{domain_obj.domain}/',
            headers={'User-Agent': 'VeriClick/1.0 Test Installation'},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status != 200:
                domain_obj.script_installed = False
                domain_obj.save(update_fields=['script_installed'])
                return Response({
                    'installed': False,
                    'error': f'HTTP {resp.status} received from {domain_obj.domain}',
                })
            html = resp.read(1024 * 1024).decode('utf-8', errors='ignore')

            # Check for vericlick script tag
            import re
            has_script = bool(re.search(
                r'<script[^>]+src=["\'][^"\']*vericlick[^"\']*["\']',
                html, re.IGNORECASE,
            ))
            # Also check for inline init
            has_init = bool(re.search(
                r'VeriClick\.init|vericlick_init|window\.vericlick',
                html, re.IGNORECASE,
            ))

            installed = has_script or has_init
            domain_obj.script_installed = installed
            if installed and domain_obj.purpose == 'protection' and not domain_obj.verified:
                domain_obj.verified = True
                domain_obj.verified_at = timezone.now()
                domain_obj.save(update_fields=['script_installed', 'verified', 'verified_at'])
            else:
                domain_obj.save(update_fields=['script_installed'])

            return Response({
                'installed': installed,
                'verified': domain_obj.verified,
                'has_script_tag': has_script,
                'has_init_call': has_init,
                'domain': domain_obj.domain,
            })
    except (urllib.error.URLError, OSError, ValueError) as exc:
        domain_obj.script_installed = False
        domain_obj.save(update_fields=['script_installed'])
        return Response({
            'installed': False,
            'error': f'Could not reach {domain_obj.domain}: {exc}',
        })
