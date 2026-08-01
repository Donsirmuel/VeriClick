from django.core.management.base import BaseCommand
from django.utils.timezone import now
from vericlick.models import DomainRegistry, Workspace


class Command(BaseCommand):
    help = 'Run health checks on all registered domains'

    def handle(self, *args, **options):
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
