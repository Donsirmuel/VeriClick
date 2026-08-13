import ipaddress
import re
from bisect import bisect_right
from datetime import timedelta
from django.db.models import Q
from django.utils import timezone
from .models import IPRule, ClickLog, DomainRegistry, IpAsnRange


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


def check_rate_limit(ip, workspace, max_clicks=60, window_seconds=60):
    cutoff = timezone.now() - timedelta(seconds=window_seconds)
    recent = ClickLog.objects.filter(
        link__workspace=workspace, ip=ip, created_at__gte=cutoff,
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
    flags = ClickLog.objects.filter(
        link__workspace=workspace,
        ip=ip,
        created_at__gte=cutoff,
        decision__in=(ClickLog.Decision.BLOCKED, ClickLog.Decision.CHALLENGED),
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


def _dns_problem(exc):
    # Maps a dnspython exception to a short, user-safe phrase. Never leak raw
    # resolver internals into the UI.
    import dns.exception
    import dns.resolver
    if isinstance(exc, dns.resolver.NXDOMAIN):
        return 'does not exist in DNS'
    if isinstance(exc, dns.resolver.NoAnswer):
        return 'has no records of that type yet'
    if isinstance(exc, dns.exception.Timeout):
        return 'timed out while being checked'
    if isinstance(exc, dns.resolver.NoNameservers):
        return 'has no reachable nameservers'
    return 'could not be resolved right now'


def _resolve_cname(host):
    # Returns the CNAME target for `host`, or '' when there is none / it fails.
    # Only used for the diagnosis report, so failures are swallowed.
    import dns.resolver
    try:
        answers = dns.resolver.resolve(host, 'CNAME', lifetime=4)
        return answers[0].target.to_text().rstrip('.')
    except Exception:
        return ''


def diagnose_domain(domain):
    """Full DNS diagnosis for a DomainRegistry row (or a bare domain string).

    Runs a separate check per DNS layer and explains each one in plain language
    so a "degraded" domain stops being a mystery. Returns a dict:

        {
          generated_at, tracking_host, expected_ips,
          verified, points_to_us, apex_resolves, ready,
          findings: [{key, level: 'ok'|'warn'|'error', title, message, fix}]
        }

    ``ready`` follows the serving path only: ownership proven (TXT) AND the
    tracking host resolving to VeriClick. An apex (root) domain with no A
    record is reported as a warning, not a failure — its links still serve on
    ``t.<domain>``. The caller persists/returns the report."""
    from .models import _resolve_addresses, _target_addresses, tracking_host

    is_obj = isinstance(domain, DomainRegistry)
    domain_name = (domain.domain if is_obj else str(domain)).strip().lower().rstrip('.')
    token = domain.verification_record if is_obj else ''
    tracking = tracking_host(domain_name)
    expected = _target_addresses()
    labels = [p for p in domain_name.split('.') if p]
    apex_domain = len(labels) <= 2

    findings = []

    def add(key, level, title, message, fix=''):
        findings.append({
            'key': key, 'level': level, 'title': title, 'message': message, 'fix': fix,
        })

    # 1. Nameservers — the domain has working DNS at all.
    import dns.resolver
    try:
        answers = dns.resolver.resolve(domain_name, 'NS', lifetime=4)
        ns = sorted(r.target.to_text().rstrip('.') for r in answers)
        add('nameservers', 'ok', 'Nameservers configured',
            f'{domain_name} has working nameservers: {", ".join(ns[:3])}' + ('…' if len(ns) > 3 else '') + '.')
    except Exception as exc:
        add('nameservers', 'error', 'No working nameservers',
            f'{domain_name} {_dns_problem(exc)}.',
            'Confirm the domain is active and its nameservers are set at your registrar (e.g. Namecheap BasicDNS). '
            'Domains bought but not yet set up this way can\'t serve any records.')

    # 2. Apex resolution — the root domain resolves at all.
    apex_ips = _resolve_addresses(domain_name)
    if apex_ips:
        add('apex', 'ok', 'Domain resolves',
            f'{domain_name} resolves to: {", ".join(sorted(apex_ips))}.')
    elif apex_domain:
        add('apex', 'warn', 'Your root domain isn\'t published yet',
            f'{domain_name} has no A/AAAA records, so nothing resolves on the root. '
            'This does NOT stop your links — they run on ' + tracking + ' and work without it.',
            'Optional: add an A record with Host "@" pointing to any reachable server '
            '(e.g. your website\'s hosting IP) so the root address isn\'t blank.')
    else:
        add('apex', 'error', 'Domain does not resolve',
            f'{domain_name} has no A/AAAA records yet.',
            'Add an A or CNAME record for this hostname pointing at your server. '
            'If you just added it, give DNS 5–30 minutes to spread, then re-check.')

    # 3. Ownership (TXT) — only checked when we know the expected record.
    verified = False
    if token:
        verified, detail = verify_domain_ownership(domain)
        if verified:
            add('txt', 'ok', 'Ownership verified',
                'The TXT verification record is live in DNS. You proved you control this domain.')
        else:
            add('txt', 'error', 'Ownership not verified yet',
                detail,
                f'Add a TXT record with Host "@" and value {token}, wait 5–30 minutes for DNS to spread, then re-check.')
    else:
        add('txt', 'warn', 'Ownership not checked',
            'No verification token was supplied, so this report couldn\'t confirm the TXT record.')

    # 4. Tracking host — where links actually live, and whether it reaches us.
    track_ips = _resolve_addresses(tracking)
    points_to_us = bool(track_ips & expected) if expected else bool(track_ips)
    cname_target = _resolve_cname(tracking)
    # The CNAME value users publish is our public tracking hostname (e.g.
    # getvericlick.site), not a bare IP — same as the DNS setup guidance.
    from django.conf import settings as django_settings
    base = getattr(django_settings, 'PUBLIC_TRACKING_BASE_URL', '').strip().rstrip('/')
    cname_value = (base.split('://')[-1].split('/')[0] if base else '') or \
        (getattr(django_settings, 'TRACKING_SERVER_IP', '').strip() or '')
    if points_to_us:
        add('tracking_host', 'ok', 'Pointed at VeriClick',
            f'{tracking} resolves to VeriClick, so branded links are live.')
    elif track_ips:
        add('tracking_host', 'error', 'Resolving to the wrong place',
            f'{tracking} resolves to {", ".join(sorted(track_ips))}, but VeriClick runs on '
            f'{", ".join(sorted(expected)) or "a different address"}.',
            f'Point {tracking} at us with a CNAME record: Name "t", Value "{cname_value}". '
            f'Replace or remove any older record for this name first.' + (f' It is currently a CNAME to {cname_target}.' if cname_target else ''))
    else:
        add('tracking_host', 'error', 'Not pointing at VeriClick yet',
            f'{tracking} doesn\'t resolve yet.',
            f'Add a CNAME record: Name "t", Value "{cname_value}". '
            'If you just added it, DNS usually spreads in 5–30 minutes — then re-check.')

    from django.utils import timezone
    return {
        'generated_at': timezone.now().isoformat(),
        'tracking_host': tracking,
        'expected_ips': sorted(expected),
        'verified': verified if token else False,
        'points_to_us': points_to_us,
        'apex_resolves': bool(apex_ips),
        'ready': bool(verified) and points_to_us,
        'findings': findings,
    }


def refresh_stale_domains(workspace, max_age_minutes=15, limit=10):
    # In-app domain health checking. Re-runs the health check for domains that
    # haven't been checked in `max_age_minutes` (or never), so health statuses
    # stay current without relying on an external cron/systemd scheduler. The
    # workspace's last_domain_scan_at is bumped only when at least one domain
    # was actually re-checked. `run_health_check()` confirms the domain
    # resolves; ownership verification remains a separate DNS TXT step.
    cutoff = timezone.now() - timedelta(minutes=max_age_minutes)
    stale = list(
        DomainRegistry.objects.filter(workspace=workspace, removed_at__isnull=True).filter(
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


_refresh_locks = {}
_refresh_pending = {}


def refresh_stale_domains_async(workspace):
    # Fire-and-forget stale-domain refresh. Health checks resolve real DNS
    # (with multi-second timeouts), so they must never run synchronously inside
    # an HTTP request — that is what made page loads block for seconds. The
    # refresh happens on a daemon thread and the response returns immediately;
    # statuses catch up within seconds.
    #
    # Sweeps are coalesced per workspace: only ONE sweep thread runs at a time.
    # React-query refetches dashboard/domains on mount and window focus, which
    # can fire several requests within seconds; without coalescing each one
    # would spawn its own DNS-refresh thread and swamp the server (and its DB
    # connections). A retry flag makes the active thread sweep again if new
    # requests arrive while it is mid-sweep, so statuses stay fresh.
    import threading
    from django.db import close_old_connections

    workspace_id = workspace.id
    _refresh_pending[workspace_id] = True
    lock = _refresh_locks.setdefault(workspace_id, threading.Lock())

    if not lock.acquire(blocking=False):
        return

    def _run():
        from .models import Workspace

        try:
            while _refresh_pending.get(workspace_id):
                _refresh_pending[workspace_id] = False
                try:
                    ws = Workspace.objects.get(id=workspace_id)
                    refresh_stale_domains(ws)
                except Exception:
                    break
                finally:
                    close_old_connections()
        finally:
            lock.release()

    threading.Thread(target=_run, daemon=True).start()


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


def get_public_tracking_url(link, request=None):
    # Single source of truth for the shareable tracked URL. A link on a custom
    # domain resolves to https://<domain>/r/<slug>/ only when the domain is
    # actually serving tracked traffic for us — which requires BOTH:
    #   1. the domain owner proved control (verified, TXT record), and
    #   2. the domain points at this server (points_to_server — its tracking
    #      host resolves to our IP, not just *some* IP like the customer's old
    #      web host). The apex itself doesn't need to resolve: a root domain
    #      with no A record still serves its links on t.<domain>.
    # Otherwise the app falls back to the current request host or the
    # configured public tracking base so copied links never point at a dead
    # domain.
    domain = link.domain
    if (
        domain
        and domain.domain
        and domain.verified
        and domain.removed_at is None
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

    if workspace.auto_reputation_enabled and is_datacenter_ip(ip):
        # Bots and scanners overwhelmingly come from hosting/datacenter/VPN
        # networks. Divert them unless the workspace turned this off. Each
        # block also feeds the auto-reputation counter below.
        return {
            'is_bot': True,
            'reason': 'Hosting/datacenter IP',
            'decision': 'blocked',
            'matched_rule': '',
        }

    auto_block = check_auto_reputation(workspace, ip)
    if auto_block:
        return auto_block

    return {
        'is_bot': False,
        'reason': '',
        'decision': 'allowed',
        'matched_rule': '',
    }
