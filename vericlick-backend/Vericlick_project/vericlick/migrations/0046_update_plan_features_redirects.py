from django.db import migrations


NEW_FEATURES = {
    'basic': [
        'Smart shortlinks (vericlick.cc/slug) and custom domain redirects',
        'Bot detection on every click',
        'IP allow/deny rules',
        'Domain health + ownership checks',
    ],
    'plus': [
        'Everything in Basic',
        'Priority support',
    ],
    'pro': [
        'Everything in Plus',
        'Dedicated support',
    ],
}


def update_features(apps, schema_editor):
    Plan = apps.get_model('vericlick', 'Plan')
    for code, features in NEW_FEATURES.items():
        Plan.objects.filter(code=code).update(features=features)


def reverse(apps, schema_editor):
    OLD_FEATURES = {
        'basic': [
            'Up to 5 domains',
            'Unlimited tracked links',
            'Bot detection on every click',
            'IP allow/deny rules',
            'Domain health + ownership checks',
        ],
        'plus': [
            'Up to 10 domains',
            'Everything in Basic',
            'Priority support',
        ],
        'pro': [
            'Up to 20 domains',
            'Everything in Plus',
            'Dedicated support',
        ],
    }
    Plan = apps.get_model('vericlick', 'Plan')
    for code, features in OLD_FEATURES.items():
        Plan.objects.filter(code=code).update(features=features)


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0045_set_redirect_limits'),
    ]

    operations = [
        migrations.RunPython(update_features, reverse),
    ]
