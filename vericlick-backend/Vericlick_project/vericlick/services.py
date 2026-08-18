import ipaddress
import re
from bisect import bisect_right
from datetime import timedelta
from django.db.models import Q
from django.utils import timezone
from .models import IPRule, TrackerEvent, IpAsnRange, CountryRule


# How often an IP must trip the traffic checks before it is auto-denied, and
# how long that auto-deny lasts. These are deliberately small: four flags in a
# quarter hour is clearly not a human clicking a link.
AUTO_REP_FLAG_THRESHOLD = 4
AUTO_REP_WINDOW_MINUTES = 15
AUTO_REP_DENY_HOURS = 24


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


def normalize_os_family(family):
    # ua-parser reports OS families in a handful of spellings (Mac OS X, Windows
    # Phone, Ubuntu, ...). Collapse them to the canonical set the Traffic Rules
    # page offers so rules and click logs always compare the same strings.
    if not family:
        return 'Other'
    lower = family.lower()
    if 'windows' in lower:
        return 'Windows'
    if 'mac' in lower and 'ios' not in lower:
        return 'macOS'
    if 'ios' in lower or lower.startswith('ipad') or lower.startswith('iphone') or lower.startswith('ipod'):
        return 'iOS'
    if 'android' in lower:
        return 'Android'
    if 'chrome os' in lower:
        return 'Chrome OS'
    if 'linux' in lower or 'ubuntu' in lower or 'debian' in lower or 'fedora' in lower or 'gentoo' in lower or 'arch' in lower or 'mint' in lower:
        return 'Linux'
    if 'blackberry' in lower or 'rim' in lower or 'playbook' in lower:
        return 'BlackBerry'
    if 'kaios' in lower:
        return 'KaiOS'
    return family or 'Other'


def parse_device(user_agent):
    """Classify a user agent into the normalized buckets used by device rules,
    click logs and dashboard breakdowns. Returns:

        {device_class: 'mobile'|'tablet'|'desktop'|'bot'|'other',
         os_family: canonical OS family, browser: family, is_bot: bool}

    A missing or blank UA counts as a bot, matching the legacy heuristic. The
    user_agents library is pure-Python and safe for the redirect hot path."""
    from user_agents import parse

    raw = user_agent or ''
    if not raw.strip():
        return {'device_class': 'bot', 'os_family': 'Bot', 'browser': 'Unknown', 'is_bot': True}
    try:
        parsed = parse(raw)
    except Exception:
        return {'device_class': 'other', 'os_family': 'Other', 'browser': 'Unknown', 'is_bot': False}

    if parsed.is_bot:
        return {'device_class': 'bot', 'os_family': 'Bot', 'browser': 'Unknown', 'is_bot': True}

    if parsed.is_mobile:
        device_class = 'mobile'
    elif parsed.is_tablet:
        device_class = 'tablet'
    elif parsed.is_pc:
        device_class = 'desktop'
    else:
        device_class = 'other'

    return {
        'device_class': device_class,
        'os_family': normalize_os_family(parsed.os.family or ''),
        'browser': parsed.browser.family or 'Unknown',
        'is_bot': False,
    }


def check_rate_limit(ip, workspace, max_clicks=60, window_seconds=60):
    cutoff = timezone.now() - timedelta(seconds=window_seconds)
    recent = TrackerEvent.objects.filter(
        workspace=workspace, ip=ip, created_at__gte=cutoff,
    ).count()
    return recent >= max_clicks


_datacenter_ranges = None


def reset_datacenter_cache():
    # Tests load fresh ranges per test; prod data is imported once at boot by
    # `manage.py import_asn` before gunicorn starts.
    global _datacenter_ranges
    _datacenter_ranges = None


def load_datacenter_ranges():
    global _datacenter_ranges
    if _datacenter_ranges is None:
        ranges = sorted(
            (int(ipaddress.ip_address(r.start_ip)), int(ipaddress.ip_address(r.end_ip)))
            for r in IpAsnRange.objects.only('start_ip', 'end_ip')
        )
        _datacenter_ranges = ([r[0] for r in ranges], ranges)
    return _datacenter_ranges


def is_datacenter_ip(ip):
    """True when the IP belongs to a hosting/datacenter/cloud/VPN network per
    the loaded IP->ASN dataset. Cheap: one binary search over ~43k ranges."""
    try:
        ip_int = int(ipaddress.ip_address(ip))
    except ValueError:
        return False
    starts, ranges = load_datacenter_ranges()
    if not starts:
        return False
    idx = bisect_right(starts, ip_int) - 1
    if idx < 0:
        return False
    start, end = ranges[idx]
    return start <= ip_int <= end


def check_auto_reputation(workspace, ip):
    """If the IP keeps tripping the traffic checks, put it on the watchlist by
    creating (or refreshing) a 24h auto-deny rule and block this request.
    Returns a decision dict, or None when the IP is not a repeat offender."""
    if not workspace.auto_reputation_enabled:
        return None
    cutoff = timezone.now() - timedelta(minutes=AUTO_REP_WINDOW_MINUTES)
    flags = TrackerEvent.objects.filter(
        workspace=workspace,
        ip=ip,
        created_at__gte=cutoff,
        verdict__in=('blocked', 'challenged'),
    ).count()
    if flags < AUTO_REP_FLAG_THRESHOLD:
        return None

    now = timezone.now()
    existing = IPRule.objects.filter(
        workspace=workspace, ip_or_cidr=ip, action=IPRule.Action.DENY,
        is_active=True, source=IPRule.Source.AUTO,
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).exists()
    if not existing:
        IPRule.objects.create(
            workspace=workspace,
            ip_or_cidr=ip,
            action=IPRule.Action.DENY,
            reason=f'Auto-reputation: {flags} flags in {AUTO_REP_WINDOW_MINUTES} min',
            source=IPRule.Source.AUTO,
            expires_at=now + timedelta(hours=AUTO_REP_DENY_HOURS),
        )

    return {
        'is_bot': True,
        'reason': 'Auto-reputation: repeated suspicious traffic',
        'decision': 'blocked',
        'matched_rule': ip,
    }


def _lookup_country(ip):
    # Backwards-compatible alias. Real GeoIP enrichment is in lookup_location().
    return lookup_location(ip)['country']


def lookup_location(ip):
    # Persisted location enrichment for click logs. Tries an optional GeoLite2
    # database first (pip install geoip2 + set GEOIP2_DB), then falls back to a
    # safe offline classification so records always carry country/region/city.
    # country_code (ISO 3166-1 alpha-2) is only populated when a real lookup
    # succeeds — the offline placeholders (Localhost, Private network, ...) are
    # not countries, so they never match a country rule.
    try:
        from django.conf import settings as django_settings
        from geoip2.database import Reader
        db_path = getattr(django_settings, 'GEOIP2_DB', '')
        if db_path:
            with Reader(db_path) as reader:
                resp = reader.city(ip)
                return {
                    'country': resp.country.names.get('en', resp.country.name or ''),
                    'country_code': resp.country.iso_code or '',
                    'region': (resp.subdivisions.most_specific.name or '') if resp.subdivisions else '',
                    'city': resp.city.name or '',
                }
    except Exception:
        pass

    try:
        ip_obj = ipaddress.ip_address(ip)
    except ValueError:
        return {'country': '', 'country_code': '', 'region': '', 'city': ''}

    if ip_obj.is_loopback:
        return {'country': 'Localhost', 'country_code': '', 'region': '', 'city': ''}
    if ip_obj.is_private or ip_obj.is_link_local:
        return {'country': 'Private network', 'country_code': '', 'region': '', 'city': ''}
    if ip_obj.is_reserved:
        return {'country': 'Reserved', 'country_code': '', 'region': '', 'city': ''}
    return {'country': 'Unknown', 'country_code': '', 'region': '', 'city': ''}


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
        if reason == 'CountryRule: deny':
            return 'Blocked by a country rule you created'
        if reason == 'country':
            return 'Blocked by a country rule you created'
        if reason == 'device':
            return 'Blocked by your device rules'
        if reason == 'os':
            return 'Blocked by your OS rules'
        if reason == 'link-country':
            return 'Blocked by this link\'s country restriction'
        if reason == 'link-device':
            return 'Blocked by this link\'s device restriction'
        if reason == 'Suspicious UA':
            return 'Request looked automated (bot-like browser)'
        if reason == 'Rate limit':
            return 'Blocked — too many requests from this address'
        if reason == 'Hosting/datacenter IP':
            return 'Traffic from a hosting/datacenter/VPN network'
        if reason == 'Auto-reputation: repeated suspicious traffic':
            return 'Repeated suspicious traffic from this address'
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


def classify_request(link, ip, user_agent, workspace):
    # Decision chain, in priority order:
    #   IP allowlist -> IP denylist -> country rules -> device/OS policy ->
    #   per-link country/device restrictions -> bot UA -> rate limit ->
    #   datacenter -> auto-reputation -> default allow.
    # Allowlist is highest priority: an allow rule always wins (e.g. recovered
    # false positives), so allowlisted IPs are never diverted. `link` may be
    # None when classifying a bare pageview (Site Shield), in which case the
    # per-link steps are skipped.
    #
    # The returned dict carries everything the caller needs to persist a rich
    # ClickLog: decision fields plus the enriched location and device buckets,
    # so the hot path only pays for one location lookup.
    now = timezone.now()

    location = lookup_location(ip)
    country_code = (location.get('country_code') or '').upper()
    device = parse_device(user_agent)

    # 1. IP allowlist / denylist.
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
            'location': location,
            'device': device,
        }

    if deny_match:
        return {
            'is_bot': True,
            'reason': f'IPRule: deny ({deny_match.reason})' if deny_match.reason else 'IPRule: deny',
            'decision': 'blocked',
            'matched_rule': str(deny_match.ip_or_cidr),
            'location': location,
            'device': device,
        }

    # 2. Country rules. An allow rule for the request's country wins over any
    # deny rule for it (same precedence as IP rules).
    if country_code:
        country_rules = CountryRule.objects.filter(
            workspace=workspace, is_active=True,
        )
        allow_country = None
        deny_country = None
        for rule in country_rules:
            if rule.country_code.upper() != country_code:
                continue
            if rule.action == 'allow' and allow_country is None:
                allow_country = rule
            if rule.action == 'deny' and deny_country is None:
                deny_country = rule
        if allow_country:
            return {
                'is_bot': False,
                'reason': 'CountryRule: allow',
                'decision': 'allowed',
                'matched_rule': country_code,
                'location': location,
                'device': device,
            }
        if deny_country:
            return {
                'is_bot': True,
                'reason': 'CountryRule: deny',
                'decision': 'blocked',
                'matched_rule': country_code,
                'location': location,
                'device': device,
            }

    # 3. Workspace device/OS policy (empty lists = nothing restricted).
    policy = getattr(workspace, 'device_policy', None)
    if policy is not None:
        allowed_classes = policy.allowed_device_classes or []
        blocked_os = policy.blocked_os_families or []
        if allowed_classes and device['device_class'] not in allowed_classes:
            return {
                'is_bot': True,
                'reason': 'device',
                'decision': 'blocked',
                'matched_rule': device['device_class'],
                'location': location,
                'device': device,
            }
        if blocked_os and device['os_family'] in blocked_os:
            return {
                'is_bot': True,
                'reason': 'os',
                'decision': 'blocked',
                'matched_rule': device['os_family'],
                'location': location,
                'device': device,
            }

    # 4. Bot UA heuristics (the legacy blanket bot detector).
    if device['is_bot'] or is_likely_bot_ua(user_agent):
        return {
            'is_bot': True,
            'reason': 'Suspicious UA',
            'decision': 'blocked',
            'matched_rule': '',
            'location': location,
            'device': device,
        }

    # 6. Rate limiting (workspace-wide, so link=None still applies).
    is_ratelimited = check_rate_limit(ip, workspace)
    if is_ratelimited:
        return {
            'is_bot': True,
            'reason': 'Rate limit',
            'decision': 'challenged',
            'matched_rule': '',
            'location': location,
            'device': device,
        }

    # 7. Datacenter / hosting / VPN networks.
    if workspace.auto_reputation_enabled and is_datacenter_ip(ip):
        # Bots and scanners overwhelmingly come from hosting/datacenter/VPN
        # networks. Divert them unless the workspace turned this off. Each
        # block also feeds the auto-reputation counter below.
        return {
            'is_bot': True,
            'reason': 'Hosting/datacenter IP',
            'decision': 'blocked',
            'matched_rule': '',
            'location': location,
            'device': device,
        }

    # 8. Auto-reputation watchlist.
    auto_block = check_auto_reputation(workspace, ip)
    if auto_block:
        auto_block.update({'location': location, 'device': device})
        return auto_block

    return {
        'is_bot': False,
        'reason': '',
        'decision': 'allowed',
        'matched_rule': '',
        'location': location,
        'device': device,
    }


# ---------------------------------------------------------------------------
# Layer 5: Behavioral scoring (composite trust score)
# ---------------------------------------------------------------------------

# Weights for each signal (must sum to ~1.0). Higher weight = more influence.
_WEIGHTS = {
    'ja4_ua_match': 0.08,
    'ja4_is_browser': 0.05,
    'has_client_hints': 0.04,
    'has_sec_fetch': 0.03,
    'ua_consistent': 0.03,
    'canvas_stability': 0.06,
    'canvas_provided': 0.04,
    'mouse_straightness': 0.10,
    'mouse_speed_var': 0.08,
    'click_offset': 0.06,
    'click_dwell': 0.05,
    'keystroke_var': 0.06,
    'no_teleports': 0.08,
    'has_mouse': 0.05,
    'events_trusted': 0.12,
    'pow_solved': 0.06,
    'pow_timing': 0.05,
}


def compute_bot_score(signals):
    """Compute a composite bot score from multiple signal layers.

    Args:
        signals: dict with boolean/float values for each signal.

    Returns:
        dict with 'score' (0.0-1.0), 'verdict' (human/suspicious/bot),
        'breakdown' (per-signal scores), and 'flags' (suspicious indicators).
    """
    breakdown = {}
    flags = []
    weighted_sum = 0.0
    total_weight = 0.0

    def _add(name, value, flag_name=None):
        nonlocal weighted_sum, total_weight
        w = _WEIGHTS.get(name, 0)
        if w == 0:
            return
        score = max(0.0, min(1.0, float(value)))
        breakdown[name] = round(score, 3)
        if flag_name and score < 0.5:
            flags.append(flag_name)
        weighted_sum += score * w
        total_weight += w

    # TLS signals
    _add('ja4_ua_match', 1.0 if signals.get('ja4_matches_ua', True) else 0.0,
         'JA4_UA_MISMATCH')
    _add('ja4_is_browser', 1.0 if signals.get('tls_is_browser', True) else 0.0,
         'NON_BROWSER_TLS')
    _add('has_client_hints', 1.0 if signals.get('has_client_hints', False) else 0.0,
         'MISSING_CLIENT_HINTS')
    _add('has_sec_fetch', 1.0 if signals.get('has_sec_fetch', False) else 0.0,
         'MISSING_SEC_FETCH')
    _add('ua_consistent', 1.0 if signals.get('ua_consistent', True) else 0.0,
         'UA_INCONSISTENT')

    # Fingerprint signals
    _add('canvas_stability', 1.0 if signals.get('canvas_hash_stable', True) else 0.0,
         'CANVAS_UNSTABLE')
    _add('canvas_provided', 1.0 if signals.get('canvas_provided', False) else 0.0,
         'NO_CANVAS')

    # Behavioral signals (already 0-1 from client-side computation)
    _add('mouse_straightness', signals.get('mouse_straightness', 0.5),
         'LINEAR_MOUSE')
    _add('mouse_speed_var', signals.get('mouse_speed_variance', 0.5),
         'CONSTANT_SPEED')
    _add('click_offset', signals.get('click_center_offset', 0.5),
         'EXACT_CENTER_CLICK')
    _add('click_dwell', signals.get('click_dwell_time', 0.5),
         'INSTANT_CLICK')
    _add('keystroke_var', signals.get('keystroke_variance', 0.5),
         'ROBOTIC_TYPING')

    teleports = signals.get('teleport_count', 0)
    teleport_score = 1.0 if teleports == 0 else max(0.0, 1.0 - teleports * 0.15)
    _add('no_teleports', teleport_score,
         f'TELEPORTS_{teleports}' if teleports > 0 else None)

    _add('has_mouse', 1.0 if signals.get('has_mouse_events', False) else 0.3)

    _add('events_trusted', 1.0 if signals.get('event_trusted', True) else 0.0,
         'UNTRUSTED_EVENTS')

    # PoW signals
    _add('pow_solved', 1.0 if signals.get('pow_solved', False) else 0.0,
         'POW_FAILED')
    pow_time = signals.get('pow_solve_time_ms', 2000)
    pow_timing = 1.0 if pow_time > 1500 else (0.7 if pow_time > 500 else 0.2)
    _add('pow_timing', pow_timing,
         'POW_TOO_FAST' if pow_time < 500 and signals.get('pow_solved') else None)

    # Hard-fail: untrusted events = definite bot
    if not signals.get('event_trusted', True):
        return {'score': 0.0, 'verdict': 'bot', 'breakdown': breakdown, 'flags': flags}

    score = weighted_sum / total_weight if total_weight > 0 else 0.5

    if score >= 0.70:
        verdict = 'human'
    elif score >= 0.35:
        verdict = 'suspicious'
    else:
        verdict = 'bot'

    return {
        'score': round(score, 4),
        'verdict': verdict,
        'breakdown': breakdown,
        'flags': flags,
    }


def score_from_signals(request, tracker_signals, trajectory, click_metrics):
    """Build the signals dict from request metadata + client-side telemetry.

    Called from the tracker event endpoint to compute the behavioral score.
    """
    ja4 = getattr(request, 'ja4_hash', '') or ''
    ua = request.META.get('HTTP_USER_AGENT', '')

    # Cross-layer JA4 vs UA consistency
    ja4_matches_ua = True
    tls_is_browser = True
    if ja4:
        if 'Chrome' in ua and not any(ja4.startswith(p) for p in ['t13d151', 't12d151']):
            ja4_matches_ua = False
        elif 'Firefox' in ua and not ja4.startswith('t13d19'):
            ja4_matches_ua = False
        elif 'Safari' in ua and not any(ja4.startswith(p) for p in ['t13d16', 't12d16']):
            ja4_matches_ua = False
        if any(ja4.startswith(p) for p in ['t10_', 't11_']):
            tls_is_browser = False

    # Trajectory metrics -> human-like scores
    straightness_raw = trajectory.get('straightness', 1.0)
    # Straightness ~1.0 = human (natural curves), <1.05 = too straight = bot
    mouse_straightness = min(1.0, max(0.0, (straightness_raw - 1.0) / 0.5)) if straightness_raw >= 1.0 else 0.1

    speed_var = trajectory.get('speed_var', 0.0)
    # Speed CV > 0.4 = human (Fitts' Law), < 0.15 = constant = bot
    mouse_speed_var = min(1.0, max(0.0, (speed_var - 0.15) / 0.35))

    teleports = trajectory.get('teleports', 0)

    # Click metrics
    click_dwell = 0.5
    if click_metrics:
        timing_var = click_metrics.get('timing_var', 0)
        # High timing variance = human
        click_dwell = min(1.0, max(0.0, timing_var / 0.5))

    return {
        'ja4_matches_ua': ja4_matches_ua,
        'tls_is_browser': tls_is_browser,
        'has_client_hints': bool(request.META.get('HTTP_SEC_CH_UA')),
        'has_sec_fetch': bool(request.META.get('HTTP_SEC_FETCH_MODE')),
        'ua_consistent': True,
        'canvas_hash_stable': True,
        'canvas_provided': bool(tracker_signals.get('canvas_hash')),
        'mouse_straightness': mouse_straightness,
        'mouse_speed_variance': mouse_speed_var,
        'click_center_offset': 0.5,
        'click_dwell_time': click_dwell,
        'keystroke_variance': 0.5,
        'teleport_count': teleports,
        'has_mouse_events': trajectory.get('event_count', 0) > 0,
        'event_trusted': True,
        'pow_solved': False,
        'pow_solve_time_ms': 2000,
    }
