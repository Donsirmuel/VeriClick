# Creates the single SiteConfig row. During beta, beta_free_mode=True means
# everything is free; an operator can flip it (and signups_open) in the Jazzmin
# admin at /admin/vericlick/siteconfig/.

from django.db import migrations


def seed_siteconfig(apps, schema_editor):
    SiteConfig = apps.get_model('vericlick', 'SiteConfig')
    SiteConfig.objects.get_or_create(
        key='default',
        defaults={'beta_free_mode': True, 'signups_open': True},
    )


def unseed_siteconfig(apps, schema_editor):
    SiteConfig = apps.get_model('vericlick', 'SiteConfig')
    SiteConfig.objects.filter(key='default').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0010_siteconfig'),
    ]

    operations = [
        migrations.RunPython(seed_siteconfig, unseed_siteconfig),
    ]