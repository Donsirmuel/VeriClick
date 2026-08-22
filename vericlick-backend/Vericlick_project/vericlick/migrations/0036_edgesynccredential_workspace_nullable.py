import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0035_redirectroute_slug_max_length_200'),
    ]

    operations = [
        migrations.AlterField(
            model_name='edgesynccredential',
            name='workspace',
            field=models.ForeignKey(
                blank=True,
                help_text='Workspace that created this credential (informational only — not used for data scoping).',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='edge_credentials',
                to='vericlick.workspace',
            ),
        ),
    ]
