# Seeds the three paid VeriClick tiers: Basic $25/5 domains, Plus $50/10,
# Pro $100/20. Idempotent so re-applying on an existing database is a no-op.

from django.db import migrations


PLANS = [
    {
        'code': 'basic',
        'name': 'Basic',
        'monthly_price': '25.00',
        'domain_limit': 5,
        'sort_order': 10,
        'features': [
            'Up to 5 domains',
            'Unlimited tracked links',
            'Bot detection on every click',
            'IP allow/deny rules',
            'Domain health + ownership checks',
        ],
    },
    {
        'code': 'plus',
        'name': 'Plus',
        'monthly_price': '50.00',
        'domain_limit': 10,
        'sort_order': 20,
        'features': [
            'Up to 10 domains',
            'Everything in Basic',
            'Priority support',
        ],
    },
    {
        'code': 'pro',
        'name': 'Pro',
        'monthly_price': '100.00',
        'domain_limit': 20,
        'sort_order': 30,
        'features': [
            'Up to 20 domains',
            'Everything in Plus',
            'Dedicated support',
        ],
    },
]


def seed_plans(apps, schema_editor):
    Plan = apps.get_model('vericlick', 'Plan')
    for plan in PLANS:
        Plan.objects.update_or_create(
            code=plan['code'],
            defaults={
                'name': plan['name'],
                'monthly_price': plan['monthly_price'],
                'domain_limit': plan['domain_limit'],
                'sort_order': plan['sort_order'],
                'features': plan['features'],
                'is_active': True,
            },
        )


def unseed_plans(apps, schema_editor):
    Plan = apps.get_model('vericlick', 'Plan')
    Plan.objects.filter(code__in=[plan['code'] for plan in PLANS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0008_plan_discountcode_workspace_plan'),
    ]

    operations = [
        migrations.RunPython(seed_plans, unseed_plans),
    ]
