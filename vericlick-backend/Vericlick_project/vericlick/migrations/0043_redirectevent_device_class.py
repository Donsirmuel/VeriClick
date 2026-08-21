"""Give redirect clicks a device class, and backfill the ones already logged.

The dashboard's device breakdown aggregates in SQL, so it can only count a
column — it cannot parse a user-agent string at query time. Redirect clicks had
no such column, which is why the widget only ever reflected script traffic.

Existing rows keep their user agent, so they can be classified in place rather
than being written off as unknown.
"""

from django.db import migrations, models


def _classify_existing(apps, schema_editor):
    from vericlick.services import parse_device

    RedirectEvent = apps.get_model('vericlick', 'RedirectEvent')
    batch = []
    for event in RedirectEvent.objects.filter(device_class='').only('id', 'user_agent').iterator(
        chunk_size=1000,
    ):
        event.device_class = parse_device(event.user_agent)['device_class']
        batch.append(event)
        if len(batch) >= 1000:
            RedirectEvent.objects.bulk_update(batch, ['device_class'])
            batch = []
    if batch:
        RedirectEvent.objects.bulk_update(batch, ['device_class'])


def _noop(apps, schema_editor):
    # Reversing only drops the column, which the AddField reversal handles.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0042_settings_key_rotation_and_notifications'),
    ]

    operations = [
        migrations.AddField(
            model_name='redirectevent',
            name='device_class',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.RunPython(_classify_existing, _noop),
    ]
