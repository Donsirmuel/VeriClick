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
    # Geo-IP lookup placeholder. Swap in a provider (e.g. pygeoip, GeoIP2)
    # later to populate ClickLog.country and TrackerEvent geo metadata.
    return None


def classify_request(link, ip, user_agent, workspace):
    now = timezone.now()

    # Decision chain: denylist -> allowlist -> bot heuristics -> rate limits -> default.
    # Deny-first is intentional: a deny rule always overrides an allow rule for the
    # same IP so blocked addresses can never slip through a broad allow range.
    rules = IPRule.objects.filter(
        workspace=workspace, is_active=True,
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now),
    )

    deny_match = None
    allow_match = None
    for rule in rules:
        if not ip_matches_cidr(ip, rule.ip_or_cidr):
            continue
        if rule.action == 'deny' and deny_match is None:
            deny_match = rule
        if rule.action == 'allow' and allow_match is None:
            allow_match = rule

    if deny_match:
        return {
            'is_bot': True,
            'reason': f'IPRule: deny ({deny_match.reason})' if deny_match.reason else 'IPRule: deny',
            'decision': 'blocked',
            'matched_rule': str(deny_match.ip_or_cidr),
        }

    if allow_match:
        return {
            'is_bot': False,
            'reason': f'IPRule: allow ({allow_match.reason})' if allow_match.reason else 'IPRule: allow',
            'decision': 'allowed',
            'matched_rule': str(allow_match.ip_or_cidr),
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
