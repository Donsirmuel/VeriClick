from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vericlick', '0024_abusereport_blockeddestination_destinationchangelog_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='trackerevent',
            name='canvas_hash',
            field=models.CharField(
                blank=True, default='', max_length=64,
                help_text='Stable device canvas fingerprint hash.',
            ),
        ),
        migrations.AddField(
            model_name='trackerevent',
            name='trajectory',
            field=models.JSONField(
                blank=True, default=dict,
                help_text='Mouse trajectory metrics: straightness, speed_var, curvature_entropy, teleports.',
            ),
        ),
        migrations.AddField(
            model_name='trackerevent',
            name='ja4_hash',
            field=models.CharField(
                blank=True, default='', max_length=128,
                help_text='JA4 TLS fingerprint hash from Caddy proxy.',
            ),
        ),
        migrations.AddField(
            model_name='trackerevent',
            name='bot_score',
            field=models.FloatField(
                default=0.5,
                help_text='Composite bot score: 0.0 (definitely bot) to 1.0 (definitely human).',
            ),
        ),
        migrations.AddField(
            model_name='trackerevent',
            name='bot_verdict',
            field=models.CharField(
                blank=True, default='', max_length=20,
                help_text='Behavioral verdict: "human", "suspicious", or "bot".',
            ),
        ),
    ]
