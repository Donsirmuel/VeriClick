from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0035_redirectroute_slug_max_length_200'),
    ]

    operations = [
        migrations.AddField(
            model_name='domainregistry',
            name='script_installed',
            field=models.BooleanField(default=False),
        ),
    ]