from django.core.management.base import BaseCommand
from dpms_app.models import BatchAllocationDetail, BatchProcess, PlanStep, Order
from datetime import timedelta
from django.utils import timezone


class Command(BaseCommand):
    help = 'Fix missing BatchProcess start/end times'

    def handle(self, *args, **options):
        DEFAULT_START_HOUR = 8
        QUEUE_GAP_HOURS = 2

        machine_last_end = {}
        count = 0

        for order in Order.objects.all():
            batches = BatchAllocationDetail.objects.filter(order=order).order_by('batch_id')
            if not batches.exists():
                continue

            dyeing_step = PlanStep.objects.filter(order=order, step_name='Dyeing').first()

            if dyeing_step and dyeing_step.start_time:
                base_start = dyeing_step.start_time
            else:
                base_start = timezone.now().replace(
                    hour=DEFAULT_START_HOUR, minute=0, second=0, microsecond=0
                )
                if base_start < timezone.now():
                    base_start += timedelta(days=1)

            for batch in batches:
                bp, _ = BatchProcess.objects.get_or_create(allocation=batch)
                machine_id = batch.machine.id if batch.machine else 0

                if bp.start_time and bp.end_time:
                    # Already set
                    machine_last_end[machine_id] = bp.end_time
                    continue

                if machine_id in machine_last_end:
                    current_start = machine_last_end[machine_id] + timedelta(hours=QUEUE_GAP_HOURS)
                else:
                    current_start = base_start

                hours = batch.batch_time_hours or 14.7
                end_time = current_start + timedelta(hours=hours)

                bp.start_time = current_start
                bp.end_time = end_time
                bp.save()

                machine_last_end[machine_id] = end_time
                count += 1

        self.stdout.write(self.style.SUCCESS(f'✅ Fixed {count} batch(es)'))