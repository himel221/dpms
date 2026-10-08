from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('dpms_app', '0007_ordersteptracker'),
    ]

    operations = [
        migrations.CreateModel(
            name='BatchStepComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('step_name', models.CharField(max_length=100)),
                ('comment', models.TextField(blank=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('allocation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='step_comments', to='dpms_app.batchallocationdetail')),
            ],
            options={
                'verbose_name': 'Batch Step Comment',
                'verbose_name_plural': 'Batch Step Comments',
                'ordering': ['step_name'],
                'unique_together': {('allocation', 'step_name')},
            },
        ),
    ]
