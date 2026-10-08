from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dpms_app', '0005_managestep_break_time'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='delivery_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
