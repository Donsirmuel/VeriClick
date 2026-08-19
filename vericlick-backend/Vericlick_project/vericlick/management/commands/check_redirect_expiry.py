"""Check redirect routes for upcoming expirations and send email reminders.

Run daily via cron:
  python manage.py check_redirect_expiry

Sends:
  - Warning email 1 day before expiry
  - Expiry email on the day of expiry
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from vericlick.models import RedirectRoute
from vericlick.emails import send_redirect_expiry_warning_email, send_redirect_expired_email

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Check redirect route expirations and send email reminders'

    def handle(self, *args, **options):
        now = timezone.now()
        tomorrow = now + timedelta(days=1)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)

        # Routes expiring within the next 24 hours (warning)
        warning_routes = RedirectRoute.objects.filter(
            is_active=True,
            expires_at__gt=now,
            expires_at__lte=tomorrow,
        ).select_related('domain', 'workspace__owner')

        warning_count = 0
        for route in warning_routes:
            try:
                user = route.workspace.owner
                if user.email:
                    days_left = max(1, int((route.expires_at - now).total_seconds() / 86400))
                    send_redirect_expiry_warning_email(user, route, days_left=days_left)
                    warning_count += 1
            except Exception:
                logger.exception('Failed to send expiry warning for route %s', route.id)

        # Routes that expired today (expired notification + deactivate)
        expired_routes = RedirectRoute.objects.filter(
            is_active=True,
            expires_at__gte=today_start,
            expires_at__lt=today_end,
        ).select_related('domain', 'workspace__owner')

        expired_count = 0
        for route in expired_routes:
            try:
                user = route.workspace.owner
                if user.email:
                    send_redirect_expired_email(user, route)
                    expired_count += 1
                # Auto-deactivate
                route.is_active = False
                route.save(update_fields=['is_active'])
            except Exception:
                logger.exception('Failed to send expiry email for route %s', route.id)

        self.stdout.write(
            self.style.SUCCESS(
                f'Sent {warning_count} warning(s) and {expired_count} expiry notification(s).'
            )
        )
