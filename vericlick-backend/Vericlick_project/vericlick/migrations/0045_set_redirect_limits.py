from django.db import migrations


def set_redirect_limits(apps, schema_editor):
    Plan = apps.get_model('vericlick', 'Plan')
    limits = {'basic': 2, 'plus': 5, 'pro': 10}
    for code, limit in limits.items():
        Plan.objects.filter(code=code).update(redirect_limit=limit)


def reverse(apps, schema_editor):
    Plan = apps.get_model('vericlick', 'Plan')
    Plan.objects.all().update(redirect_limit=2)


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0044_redirect_limit'),
    ]

    operations = [
        migrations.RunPython(set_redirect_limits, reverse),
    ]
