"""
Disable all active tracking links that live on the VeriClick product domain
(shared /r/ links without a custom domain) and email their owners.

Usage:
    python manage.py migrate_product_domain_links          # dry-run by default
    python manage.py migrate_product_domain_links --apply   # actually disable + email
"""
import logging
from collections import defaultdict

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Q

from vericlick.models import TrackingLink, Workspace
from vericlick.emails import send_domain_migration_email

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Disable links on the product domain and email affected owners.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually disable links and send emails (default is dry-run).',
        )

    def handle(self, *args, **options):
        apply = options['apply']
        product_domain = getattr(settings, 'PRODUCT_DOMAIN', '')
        if not product_domain:
            self.stderr.write(self.style.WARNING(
                'PRODUCT_DOMAIN is not set — nothing to migrate.'
            ))
            return

        # Find links with no domain or with a domain matching the product domain
        links = TrackingLink.objects.filter(
            removed_at__isnull=True,
            status=TrackingLink.Status.ACTIVE,
        ).filter(
            Q(domain__isnull=True) | Q(domain__domain__iexact=product_domain)
        ).select_related('workspace', 'workspace__owner', 'domain')

        if not links.exists():
            self.stdout.write(self.style.SUCCESS(
                'No active links found on the product domain. Nothing to migrate.'
            ))
            return

        # Group by workspace to send one email per user
        workspace_links = defaultdict(list)
        for link in links:
            workspace_links[link.workspace_id].append(link)

        self.stdout.write(
            f'Found {links.count()} link(s) across {len(workspace_links)} workspace(s) '
            f'on {product_domain}.'
        )

        if not apply:
            self.stdout.write(self.style.WARNING(
                'Dry-run mode. Re-run with --apply to disable links and send emails.'
            ))
            return

        emails_sent = 0
        for workspace_id, ws_links in workspace_links.items():
            workspace = ws_links[0].workspace
            user = workspace.owner
            count = len(ws_links)

            # Disable all links
            for link in ws_links:
                link.status = TrackingLink.Status.DISABLED
                link.save(update_fields=['status'])
                self.stdout.write(f'  Disabled: {link.slug} -> {link.destination_url}')

            # Send migration email
            try:
                send_domain_migration_email(user, workspace, count)
                emails_sent += 1
                self.stdout.write(f'  Emailed: {user.email}')
            except Exception:
                logger.exception('Failed to send migration email to %s', user.email)
                self.stderr.write(self.style.ERROR(f'  Failed to email {user.email}'))

        self.stdout.write(self.style.SUCCESS(
            f'Done. {links.count()} link(s) disabled, {emails_sent} email(s) sent.'
        ))
