from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0013_checkoutintent_plan_bachs_product_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='workspace',
            name='trial_started_at',
            field=models.DateTimeField(blank=True, help_text='When the free-trial clock started for this workspace. Only set once a workspace has no paid plan; the workspace then gets 7 days to use its free allowance (1 domain, 1 link) before creation is locked until it upgrades.', null=True),
        ),
    ]
