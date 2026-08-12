import gzip
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from vericlick.models import IpAsnRange
from vericlick.services import reset_datacenter_cache

# Bundled, filtered IP->ASN datasets (only hosting/datacenter/VPN networks).
# Source: iptoasn.com (free, hourly-updated). Generated once with a keyword
# filter; see data/README for how to regenerate with fresh data.
DATA_FILES = [
    'ip2asn-v4-dc.tsv.gz',
    'ip2asn-v6-dc.tsv.gz',
]

CHUNK = 5000


class Command(BaseCommand):
    help = (
        'Load the bundled IP->ASN datacenter ranges into IpAsnRange. '
        'Runs automatically at container boot when the table is empty; pass '
        '--refresh to reload fresh data on an already-seeded table.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--refresh',
            action='store_true',
            help='Truncate and re-import even when ranges already exist.',
        )

    def handle(self, *args, **options):
        if not options['refresh'] and IpAsnRange.objects.exists():
            self.stdout.write(self.style.SUCCESS('IpAsnRange already seeded (use --refresh to reload).'))
            return

        data_dir = Path(__file__).resolve().parents[2] / 'data'
        rows = []
        for name in DATA_FILES:
            path = data_dir / name
            if not path.exists():
                raise CommandError(f'Missing dataset file: {path}')
            with gzip.open(path, 'rt', encoding='utf-8', errors='replace') as f:
                for line in f:
                    parts = line.rstrip('\n').split('\t')
                    if len(parts) < 5:
                        continue
                    start, end, asn, country, org = parts[:5]
                    rows.append(IpAsnRange(
                        start_ip=start, end_ip=end,
                        asn=asn, country=country, org=org,
                    ))

        IpAsnRange.objects.all().delete()
        for i in range(0, len(rows), CHUNK):
            IpAsnRange.objects.bulk_create(rows[i:i + CHUNK])
        reset_datacenter_cache()
        self.stdout.write(self.style.SUCCESS(f'Imported {len(rows)} datacenter IP ranges.'))
