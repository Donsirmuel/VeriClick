from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0014_workspace_trial_started_at'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='siteconfig',
            name='beta_free_mode',
        ),
    ]
