import time

from django.core.management.base import BaseCommand, CommandError
from vericlick.models import Workspace


class Command(BaseCommand):
    help = (
        'Emit period-expiry / grace / suspension billing events and reminders '
        'for one-time "period" workspaces. Runs once by default; pass --interval '
        'to loop forever as a scheduler (e.g. --interval 3600 for hourly, driven '
        'by cron/systemd or the process manager of your PaaS). The same work also '
        'runs lazily on every owner request, so this is a guarantee, not a '
        'dependency — an owner who never logs in still gets their reminders.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval',
            type=int,
            default=0,
            help='Seconds between runs. 0 (default) runs once and exits; 3600 runs every hour.',
        )
        parser.add_argument(
            '--once',
            action='store_true',
            help='Run a single pass and exit (the default).',
        )

    def handle(self, *args, **options):
        interval = options['interval']
        if options['once']:
            interval = 0
        if interval < 0:
            raise CommandError('--interval must be greater than or equal to 0')

        if interval:
            self.stdout.write(
                f'Billing checker started — running every {interval}s. Press Ctrl+C to stop.'
            )

        while True:
            self._run_scan()
            if not interval:
                break
            time.sleep(interval)

    def _run_scan(self):
        from vericlick.payments import maybe_run_billing_checks

        # Only one-time "period" workspaces participate (subscriptions have no
        # plan_expires_at and are handled by the renewal webhook).
        workspaces = Workspace.objects.filter(
            plan__isnull=False, plan_expires_at__isnull=False
        )
        for workspace in workspaces:
            try:
                maybe_run_billing_checks(workspace, force=True)
            except Exception as e:
                self.stderr.write(f'Error running billing checks for {workspace.pk}: {e}')

        self.stdout.write(f'Checked billing lifecycle for {workspaces.count()} workspace(s)')
