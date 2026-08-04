import ipaddress
import re
from datetime import timedelta
from django.db.models import Q
from django.utils import timezone
from .models import IPRule, ClickLog


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
    # Returns True only when the exact verification record is found in the
    # domain's DNS TXT records. Any DNS error (NXDOMAIN, timeout, no such
    # library) simply means "not verified yet".
    try:
        import dns.resolver
    except ImportError:
        return False

    expected = domain.verification_record
    try:
        answers = dns.resolver.resolve(domain.domain, 'TXT', lifetime=10)
    except Exception:
        return False

    for rdata in answers:
        # rdata may contain multiple quoted strings; strip quotes so we match
        # the published value regardless of chunking by the DNS provider.
        if expected in rdata.to_text().replace('"', ''):
            return True
    return False


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
    # domain resolves to https://<domain>/<slug> (DNS must point at VeriClick);
    # otherwise it falls back to the API host's /r/<slug> redirect route.
    if link.domain and link.domain.domain:
        return f'https://{link.domain.domain}/{link.slug}'
    if request is not None:
        return request.build_absolute_uri(f'/r/{link.slug}')
    return f'/r/{link.slug}'


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
