from decimal import Decimal

from django.db import migrations


# Weekly (7 days) and monthly (30 days) prices in USD.
PRICES = {
    'basic': {'weekly': Decimal('25.00'), 'monthly': Decimal('80.00')},
    'plus': {'weekly': Decimal('40.00'), 'monthly': Decimal('150.00')},
    'pro': {'weekly': Decimal('70.00'), 'monthly': Decimal('200.00')},
}


def set_prices(apps, schema_editor):
    Plan = apps.get_model('vericlick', 'Plan')
    for code, prices in PRICES.items():
        Plan.objects.filter(code=code).update(
            weekly_price=prices['weekly'],
            monthly_price=prices['monthly'],
        )


def noop(apps, schema_editor):
    # Prices are operational data; rolling back leaves them as-is rather than
    # guessing at whatever they were before.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0037_weekly_and_monthly_pricing'),
    ]

    operations = [
        migrations.RunPython(set_prices, noop),
    ]
