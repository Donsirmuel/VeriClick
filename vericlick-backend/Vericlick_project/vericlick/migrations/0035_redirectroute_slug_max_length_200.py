from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0034_workspace_onboarding_complete_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='redirectroute',
            name='slug',
            field=models.SlugField(blank=True, default='', help_text='Short path on the redirect domain. Empty = root.', max_length=200),
        ),
    ]
