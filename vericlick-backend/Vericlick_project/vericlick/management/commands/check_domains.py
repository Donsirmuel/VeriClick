import time

from django.core.management.base import BaseCommand, CommandError
from django.utils.timezone import now
from vericlick.models import DomainRegistry, Workspace


class Command(BaseCommand):
    help = (
        'Run health checks on all registered domains. '
        'Runs once by default; pass --interval to loop forever as a scheduler '
        '(e.g. --interval 900 for a scan every 15 minutes, typically driven by '
        'cron/systemd, or the process manager of your PaaS).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval',
            type=int,
            default=0,
            help='Seconds between runs. 0 (default) scans once and exits; 900 scans every 15 minutes.',
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
                f'Domain checker started — scanning every {interval}s. Press Ctrl+C to stop.'
            )

        while True:
            self._run_scan()
            if not interval:
                break
            time.sleep(interval)

    def _run_scan(self):
        domains = DomainRegistry.objects.all()
        checked = 0
        failed = 0

        for domain in domains:
            checked += 1
            try:
                domain.run_health_check()
            except Exception as e:
                failed += 1
                self.stderr.write(f'Error checking {domain.domain}: {e}')

        Workspace.objects.update(last_domain_scan_at=now())

        self.stdout.write(f'Checked {checked} domains, {failed} failures')
