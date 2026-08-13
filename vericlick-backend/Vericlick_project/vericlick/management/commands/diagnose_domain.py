from django.core.management.base import BaseCommand, CommandError
from vericlick.models import DomainRegistry
from vericlick.services import diagnose_domain


class Command(BaseCommand):
    help = (
        'Run a full DNS diagnosis for a domain and print the report. '
        'Use this in support calls to explain why a domain shows as degraded. '
        'If the domain is already registered it is matched (so the TXT ownership '
        'check runs against its verification token); otherwise pass --token.'
    )

    def add_arguments(self, parser):
        parser.add_argument('domain', help='The domain to diagnose (e.g. example.com).')
        parser.add_argument(
            '--token',
            default='',
            help='VeriClick TXT verification token (vericlick-verify=<token>) to also '
                 'confirm ownership. Auto-detected for registered domains.',
        )

    def handle(self, *args, **options):
        name = (options['domain'] or '').strip().lower().rstrip('.')
        if not name:
            raise CommandError('Enter a domain name.')

        registered = DomainRegistry.objects.filter(domain=name).first()
        token = options['token'] or (registered.verification_record if registered else '')

        self.stdout.write(f'Diagnosing {name}… (DNS lookups can take a few seconds)\n')
        report = diagnose_domain(registered or name)

        level_symbol = {'ok': 'OK  ', 'warn': 'WARN', 'error': 'ERR '}
        for finding in report['findings']:
            symbol = level_symbol.get(finding['level'], '????')
            self.stdout.write(f'[{symbol}] {finding["title"]}')
            self.stdout.write(f'        {finding["message"]}')
            if finding.get('fix'):
                self.stdout.write(f'        Fix: {finding["fix"]}')
            self.stdout.write('')

        if registered:
            self.stdout.write(
                self.style.HTTP_INFO(
                    f'Registered to workspace "{registered.workspace.name}" '
                    f'({registered.workspace_id})'
                )
            )

        if report['ready']:
            self.stdout.write(self.style.SUCCESS(
                f'Result: READY — {report["tracking_host"]} is verified and '
                'pointed at VeriClick.'
            ))
        else:
            issues = [f['key'] for f in report['findings'] if f['level'] in ('error', 'warn')]
            self.stdout.write(self.style.ERROR(
                f'Result: NOT ready. Outstanding layers: {", ".join(issues) or "none"}.'
            ))
            self.stdout.write(self.style.WARNING(
                'Note: an apex domain with no A record is only a warning — its '
                'links still work on the tracking host (t.<domain>).'
            ))
