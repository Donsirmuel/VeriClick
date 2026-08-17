"""
Daily re-scan of all active link destinations against the blocklist and
Google Safe Browsing. Links pointing at newly-blocked or newly-flagged URLs
are automatically disabled.

Usage:
    python manage.py rescan_destinations          # normal run
    python manage.py rescan_destinations --dry-run # report without disabling
"""
import logging
import urllib.request
import json as json_module

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Q

from vericlick.models import TrackingLink, BlockedDestination

logger = logging.getLogger(__name__)


def _check_safe_browsing(url, api_key):
    """Return (safe, threats) for a single URL against Google Safe Browsing v5."""
    if not api_key:
        return True, []

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
        req = urllib.request.Request(
            gsb_url, data=payload,
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json_module.loads(resp.read())
            matches = result.get('matches', [])
            if matches:
                threats = [m.get('threatType', 'unknown') for m in matches]
                return False, threats
            return True, []
    except Exception:
        logger.exception('Safe Browsing check failed for %s', url)
        return True, []


class Command(BaseCommand):
    help = 'Re-scan active link destinations against blocklist and Safe Browsing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report flagged links without disabling them.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        gsb_key = getattr(settings, 'GOOGLE_SAFE_BROWSING_API_KEY', '').strip()

        active_links = TrackingLink.objects.filter(
            removed_at__isnull=True,
            status=TrackingLink.Status.ACTIVE,
        ).select_related('workspace')

        if not active_links.exists():
            self.stdout.write(self.style.SUCCESS('No active links to scan.'))
            return

        self.stdout.write(f'Scanning {active_links.count()} active link(s)...')

        blocked_urls = set(
            BlockedDestination.objects.values_list('url', flat=True)
        )

        disabled = 0
        checked = 0

        for link in active_links.iterator():
            dest = link.destination_url.rstrip('/').lower()
            checked += 1

            # Check blocklist
            if dest in blocked_urls:
                reason = 'Destination is on the blocklist'
                if dry_run:
                    self.stdout.write(self.style.WARNING(
                        f'  [DRY RUN] Would disable: {link.slug} -> {dest} ({reason})'
                    ))
                else:
                    link.status = TrackingLink.Status.DISABLED
                    link.save(update_fields=['status'])
                    self.stdout.write(self.style.WARNING(
                        f'  Disabled: {link.slug} -> {dest} ({reason})'
                    ))
                disabled += 1
                continue

            # Check Google Safe Browsing
            if gsb_key:
                safe, threats = _check_safe_browsing(link.destination_url, gsb_key)
                if not safe:
                    reason = f'Safe Browsing: {", ".join(threats)}'
                    if dry_run:
                        self.stdout.write(self.style.WARNING(
                            f'  [DRY RUN] Would disable: {link.slug} -> {dest} ({reason})'
                        ))
                    else:
                        link.status = TrackingLink.Status.DISABLED
                        link.save(update_fields=['status'])
                        # Auto-add to blocklist
                        BlockedDestination.objects.get_or_create(
                            url=link.destination_url,
                            defaults={'reason': reason, 'source': 'daily_scan'},
                        )
                        self.stdout.write(self.style.WARNING(
                            f'  Disabled: {link.slug} -> {dest} ({reason})'
                        ))
                    disabled += 1

        action = 'would disable' if dry_run else 'disabled'
        self.stdout.write(self.style.SUCCESS(
            f'Done. Scanned {checked} link(s), {action} {disabled}.'
        ))
