# DomainRegistry: migrate from auto-increment bigint PK to UUID PK.
# PostgreSQL cannot cast bigint directly to uuid, so we:
# 1. Add a temp UUID column
# 2. Populate it
# 3. Drop the old bigint id
# 4. Rename temp to id
# 5. Set as primary key

import uuid
from django.db import migrations, models


def populate_uuid(apps, schema_editor):
    DomainRegistry = apps.get_model('vericlick', 'DomainRegistry')
    for row in DomainRegistry.objects.all():
        row.temp_uuid = uuid.uuid4()
        row.save(update_fields=['temp_uuid'])


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0027_add_domainregistry'),
    ]

    operations = [
        # 1. Add temp UUID column
        migrations.AddField(
            model_name='domainregistry',
            name='temp_uuid',
            field=models.UUIDField(default=uuid.uuid4, editable=False, null=True),
        ),
        # 2. Populate for any existing rows
        migrations.RunPython(populate_uuid, migrations.RunPython.noop),
        # 3. Remove null constraint
        migrations.AlterField(
            model_name='domainregistry',
            name='temp_uuid',
            field=models.UUIDField(default=uuid.uuid4, editable=False),
        ),
        # 4. Remove old bigint PK
        migrations.RemoveField(
            model_name='domainregistry',
            name='id',
        ),
        # 5. Rename temp_uuid -> id and make it the primary key
        migrations.RenameField(
            model_name='domainregistry',
            old_name='temp_uuid',
            new_name='id',
        ),
        migrations.AlterField(
            model_name='domainregistry',
            name='id',
            field=models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
        ),
    ]
