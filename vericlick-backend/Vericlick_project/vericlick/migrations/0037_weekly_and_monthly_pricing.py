from decimal import Decimal

from django.db import migrations, models


# Monthly prices for the seeded tiers. Weekly prices carry over untouched from
# the old `monthly_price` column, which held the weekly price despite its name.
MONTHLY_PRICES = {
    'basic': Decimal('100.00'),
    'plus': Decimal('150.00'),
    'pro': Decimal('200.00'),
}


def set_monthly_prices(apps, schema_editor):
    Plan = apps.get_model('vericlick', 'Plan')
    for code, price in MONTHLY_PRICES.items():
        Plan.objects.filter(code=code).update(monthly_price=price)


def clear_monthly_prices(apps, schema_editor):
    Plan = apps.get_model('vericlick', 'Plan')
    Plan.objects.update(monthly_price=Decimal('0'))


def backfill_workspace_period(apps, schema_editor):
    """Workspaces bought before this split were granted PLAN_PERIOD_DAYS (30)
    of access, so 'monthly' is what they actually hold. New workspaces default
    to weekly."""
    Workspace = apps.get_model('vericlick', 'Workspace')
    Workspace.objects.filter(plan__isnull=False).update(plan_billing_period='monthly')


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0036_domainregistry_script_installed'),
    ]

    operations = [
        # The old column was named monthly_price but held the weekly price.
        migrations.RenameField(
            model_name='plan',
            old_name='monthly_price',
            new_name='weekly_price',
        ),
        migrations.AlterField(
            model_name='plan',
            name='weekly_price',
            field=models.DecimalField(
                decimal_places=2, max_digits=8,
                help_text='One-time price in USD for 7 days of access.',
            ),
        ),
        migrations.AddField(
            model_name='plan',
            name='monthly_price',
            field=models.DecimalField(
                decimal_places=2, max_digits=8, default=0,
                help_text='One-time price in USD for 30 days of access.',
            ),
        ),
        migrations.AddField(
            model_name='plan',
            name='bachs_monthly_product_id',
            field=models.CharField(
                blank=True, default='', max_length=64,
                help_text=(
                    'The Bachs ONE-TIME product ID (prod_...) sold when a customer buys '
                    'a MONTHLY period of this plan. Bachs holds the price, so weekly and '
                    'monthly need separate products. Leave blank to disable monthly for '
                    'this plan.'
                ),
            ),
        ),
        migrations.AddField(
            model_name='checkoutintent',
            name='billing_period',
            field=models.CharField(
                max_length=16, default='weekly',
                choices=[('weekly', 'Weekly (7 days)'), ('monthly', 'Monthly (30 days)')],
                help_text='Length of access this purchase buys: weekly (7d) or monthly (30d).',
            ),
        ),
        migrations.AddField(
            model_name='workspace',
            name='plan_billing_period',
            field=models.CharField(
                max_length=16, default='weekly',
                choices=[('weekly', 'Weekly (7 days)'), ('monthly', 'Monthly (30 days)')],
                help_text='Cadence of the last purchase — sets how long each period runs.',
            ),
        ),
        migrations.RunPython(set_monthly_prices, clear_monthly_prices),
        migrations.RunPython(backfill_workspace_period, noop),
    ]
