import ipaddress
import re
from datetime import timedelta
from django.db.models import Q
from django.utils import timezone
from .models import IPRule, ClickLog, DomainRegistry


KNOWN_BOT_UA_PATTERNS = [
    r'bot', r'crawler', r'spider', r'scrape', r'curl', r'wget',
    r'python-requests', r'go-http-client', r'java/',
    r'libwww', r'httpclient', r'httpx', r'ahrefs',
    r'mj12bot', r'semrush', r'proximic', r'zgrab',
    r'nmap', r'sqlmap', r'nikto', r'nessus',
]

KNOWN_DATACENTER_ASNS = [
    '16276', '16509', '14618', '20473', '14061', '62567',
    '36351', '31898', '45102', '55293', '20473', '40676',
    '46652', '53334', '394693', '203898', '264090',
]


def ip_matches_cidr(ip_str, cidr_str):
    try:
        ip = ipaddress.ip_address(ip_str)
        if '/' in cidr_str:
            network = ipaddress.ip_network(cidr_str, strict=False)
        else:
            network = ipaddress.ip_network(cidr_str, strict=False)
        return ip in network
    except ValueError:
        return False


def is_likely_bot_ua(user_agent):
    ua = user_agent.lower().strip()
    if not ua or ua == '':
        return True
    for pattern in KNOWN_BOT_UA_PATTERNS:
        if re.search(pattern, ua):
            return True
    return False


def check_rate_limit(ip, workspace, max_clicks=60, window_seconds=60):
    cutoff = timezone.now() - timedelta(seconds=window_seconds)
    recent = ClickLog.objects.filter(
        link__workspace=workspace, ip=ip, created_at__gte=cutoff,
    ).count()
    return recent >= max_clicks


def _lookup_country(ip):
    # Backwards-compatible alias. Real GeoIP enrichment is in lookup_location().
    return lookup_location(ip)['country']


def lookup_location(ip):
    # Persisted location enrichment for click logs. Tries an optional GeoLite2
    # database first (pip install geoip2 + set GEOIP2_DB), then falls back to a
    # safe offline classification so records always carry country/region/city.
    try:
        from django.conf import settings as django_settings
        from geoip2.database import Reader
        db_path = getattr(django_settings, 'GEOIP2_DB', '')
        if db_path:
            with Reader(db_path) as reader:
                resp = reader.city(ip)
                return {
                    'country': resp.country.names.get('en', resp.country.name or ''),
                    'region': (resp.subdivisions.most_specific.name or '') if resp.subdivisions else '',
                    'city': resp.city.name or '',
                }
    except Exception:
        pass

    try:
        ip_obj = ipaddress.ip_address(ip)
    except ValueError:
        return {'country': '', 'region': '', 'city': ''}

    if ip_obj.is_loopback:
        return {'country': 'Localhost', 'region': '', 'city': ''}
    if ip_obj.is_private or ip_obj.is_link_local:
        return {'country': 'Private network', 'region': '', 'city': ''}
    if ip_obj.is_reserved:
        return {'country': 'Reserved', 'region': '', 'city': ''}
    return {'country': 'Unknown', 'region': '', 'city': ''}


def verify_domain_ownership(domain):
    # Proves control of a domain by looking for the published TXT record.
    # Returns a (verified, detail) tuple: verified is True only when the exact
    # verification record is found in the domain's DNS TXT records. Any DNS
    # error returns a plain-language detail so the UI never exposes a raw
    # developer message like a resolver timeout.
    try:
        import dns.resolver
    except ImportError:
        return False, 'DNS lookup is not available on this server. Please try again later.'

    expected = domain.verification_record
    try:
        answers = dns.resolver.resolve(domain.domain, 'TXT', lifetime=5)
    except dns.exception.Timeout:
        return False, 'DNS lookup timed out. Your DNS provider may be slow — wait a few minutes and try again.'
    except dns.resolver.NXDOMAIN:
        return False, 'This domain does not resolve yet. Confirm it is spelled correctly and its DNS is active.'
    except dns.resolver.NoAnswer:
        return False, 'No TXT records found for this domain yet. Add the record and wait for it to propagate.'
    except Exception:
        return False, 'Could not check this domain right now. Please try again in a moment.'

    for rdata in answers:
        # rdata may contain multiple quoted strings; strip quotes so we match
        # the published value regardless of chunking by the DNS provider.
        if expected in rdata.to_text().replace('"', ''):
            return True, ''
    return False, (
        'The TXT record was not found yet. Add it to your DNS provider, wait '
        'for it to propagate (usually 5–30 minutes), then try again.'
    )


def refresh_stale_domains(workspace, max_age_minutes=15, limit=10):
    # In-app domain health checking. Re-runs the health check for domains that
    # haven't been checked in `max_age_minutes` (or never), so health statuses
    # stay current without relying on an external cron/systemd scheduler. The
    # workspace's last_domain_scan_at is bumped only when at least one domain
    # was actually re-checked. `run_health_check()` confirms the domain
    # resolves; ownership verification remains a separate DNS TXT step.
    cutoff = timezone.now() - timedelta(minutes=max_age_minutes)
    stale = list(
        DomainRegistry.objects.filter(workspace=workspace).filter(
            Q(last_checked__isnull=True) | Q(last_checked__lt=cutoff)
        )[:limit]
    )
    for domain in stale:
        try:
            domain.run_health_check()
        except Exception:
            # A failed check must never break the request that triggered it.
            continue
    if stale:
        workspace.last_domain_scan_at = timezone.now()
        workspace.save(update_fields=['last_domain_scan_at'])
    return stale


def reason_label(decision, reason='', matched_rule=''):
    # Plain-language summary of a click decision, so the dashboard explains
    # bot-vs-human outcomes without reading technical logs. The raw `reason`
    # stays available for detail.
    if decision == 'allowed':
        if reason and 'allow' in reason:
            return 'Allowed by a trusted-IP rule'
        return 'Human traffic — let through'
    if decision == 'challenged':
        return 'Temporarily slowed — too many requests from this address'
    if decision == 'blocked':
        if reason and 'IPRule: deny' in reason:
            return 'Blocked by a deny rule you created'
        if reason == 'Suspicious UA':
            return 'Request looked automated (bot-like browser)'
        if reason == 'Rate limit':
            return 'Blocked — too many requests from this address'
        return 'Blocked by automated detection'
    return 'Flagged for review'


def get_safe_destination(workspace, request=None):
    # Suspicious traffic is diverted here. Prefers the workspace-configured safe
    # destination; otherwise falls back to a neutral VeriClick page.
    if workspace.safe_destination and workspace.safe_destination.strip():
        return workspace.safe_destination.strip()
    if request is not None:
        return request.build_absolute_uri('/suspicious/')
    return '/suspicious/'


def get_public_tracking_url(link, request=None):
    # Single source of truth for the shareable tracked URL. A link on a custom
    # domain resolves to https://<domain>/r/<slug>/ only when the domain is
    # actually serving tracked traffic for us — which requires BOTH:
    #   1. the domain owner proved control (verified, TXT record), and
    #   2. the domain points at this server (points_to_server — its DNS
    #      resolves to our IP, not just *some* IP like the customer's old web
    #      host), and
    #   3. the domain resolves (health_status healthy).
    # Otherwise the app falls back to the current request host or the
    # configured public tracking base so copied links never point at a dead
    # domain.
    domain = link.domain
    if (
        domain
        and domain.domain
        and domain.verified
        and domain.health_status == DomainRegistry.HealthStatus.HEALTHY
        and domain.points_to_server
    ):
        from .models import tracking_host

        # Links on an apex (2-label) domain live on its `t.` subdomain, since
        # root domains can't carry a CNAME.
        host = tracking_host(domain.domain)
        return f'https://{host}/r/{link.slug}/'
    if request is not None:
        return request.build_absolute_uri(f'/r/{link.slug}/')
    from django.conf import settings as django_settings

    base_url = getattr(django_settings, 'PUBLIC_TRACKING_BASE_URL', '').strip().rstrip('/')
    if base_url:
        return f'{base_url}/r/{link.slug}/'
    return f'/r/{link.slug}/'


def classify_request(link, ip, user_agent, workspace):
    now = timezone.now()

    # Decision chain: allowlist -> denylist -> bot heuristics -> rate limits.
    # Allowlist is highest priority: an allow rule always wins (e.g. recovered
    # false positives), so allowlisted IPs are never diverted. Deny rules come
    # next so a blocked address is always intercepted. Then UA heuristics, then
    # rate limiting, then default allow for everyone else.
    rules = IPRule.objects.filter(
        workspace=workspace, is_active=True,
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now),
    )

    allow_match = None
    deny_match = None
    for rule in rules:
        if not ip_matches_cidr(ip, rule.ip_or_cidr):
            continue
        if rule.action == 'allow' and allow_match is None:
            allow_match = rule
        if rule.action == 'deny' and deny_match is None:
            deny_match = rule

    if allow_match:
        return {
            'is_bot': False,
            'reason': f'IPRule: allow ({allow_match.reason})' if allow_match.reason else 'IPRule: allow',
            'decision': 'allowed',
            'matched_rule': str(allow_match.ip_or_cidr),
        }

    if deny_match:
        return {
            'is_bot': True,
            'reason': f'IPRule: deny ({deny_match.reason})' if deny_match.reason else 'IPRule: deny',
            'decision': 'blocked',
            'matched_rule': str(deny_match.ip_or_cidr),
        }

    is_bot_ua = is_likely_bot_ua(user_agent)
    if is_bot_ua:
        return {
            'is_bot': True,
            'reason': 'Suspicious UA',
            'decision': 'blocked',
            'matched_rule': '',
        }

    is_ratelimited = check_rate_limit(ip, workspace)
    if is_ratelimited:
        return {
            'is_bot': True,
            'reason': 'Rate limit',
            'decision': 'challenged',
            'matched_rule': '',
        }

    return {
        'is_bot': False,
        'reason': '',
        'decision': 'allowed',
        'matched_rule': '',
    }
