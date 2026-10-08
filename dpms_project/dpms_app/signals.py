"""
Django signals — automatic BatchProcess sync.

Jokhon PlanStep save hoy (Dyeing step), tokhon BatchProcess auto update hoy.
"""
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from datetime import timedelta
from .models import PlanStep, BatchAllocationDetail, BatchProcess


# Config
QUEUE_GAP_HOURS = 2
DEFAULT_START_HOUR = 8


@receiver(post_save, sender=PlanStep)
def sync_batch_process_on_plan_step_save(sender, instance, created, **kwargs):
    """
    Jokhon Dyeing step save hoy, tokhon BatchProcess auto sync korো.
    """
    # Sudhu Dyeing step er jonno
    if instance.step_name != 'Dyeing':
        return

    if not instance.start_time or not instance.end_time:
        return

    order = instance.order

    # Ei order er sob batch er jonno BatchProcess update korো
    batches = BatchAllocationDetail.objects.filter(order=order).order_by('batch_id')

    if not batches.exists():
        return

    # ============================================
    # Queue logic — same machine er previous batch er pore start
    # ============================================
    # Get machine er last booked time (other orders)
    machine = instance.machine
    if not machine:
        machine = batches.first().machine

    machine_last_end = None
    if machine:
        # Other orders er bookings check korো
        other_bookings = BatchProcess.objects.filter(
            allocation__machine=machine,
        ).exclude(
            allocation__order=order
        ).order_by('-end_time')

        if other_bookings.exists():
            machine_last_end = other_bookings.first().end_time

    # Determine start time
    base_start = instance.start_time
    if machine_last_end and machine_last_end > base_start:
        base_start = machine_last_end + timedelta(hours=QUEUE_GAP_HOURS)

    # Loop through batches
    current_start = base_start

    for batch in batches:
        bp, _ = BatchProcess.objects.get_or_create(allocation=batch)

        # Skip jodi already set kora hoy
        if bp.start_time and bp.end_time:
            current_start = bp.end_time
            continue

        hours = batch.batch_time_hours or 14.7
        end_time = current_start + timedelta(hours=hours)

        bp.start_time = current_start
        bp.end_time = end_time
        bp.save()

        current_start = end_time


@receiver(post_delete, sender=BatchAllocationDetail)
def cleanup_batch_process(sender, instance, **kwargs):
    """BatchAllocationDetail delete hole BatchProcess o delete hoy."""
    try:
        instance.process_tracker.delete()
    except BatchProcess.DoesNotExist:
        pass