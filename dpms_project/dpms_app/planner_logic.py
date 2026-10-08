"""
Batch Allocation — Combination Algorithm
Server-side logic: score, recommendation, pros/cons sob calculate kore.

✅ Features:
- Multiple batches on same machine (big orders)
- Queue-based scheduling (ek order shesh hole porer order auto start)
- Machine availability with next-available-time
- Dynamic scoring based on machine load
"""
from datetime import timedelta
from django.utils import timezone
from .models import Order, DyeingMachine, BatchAllocationDetail, BatchProcess


# ============================================================
# Scoring Weights (adjustable)
# ============================================================
WEIGHTS = {
    'batch_optimization': 0.30,      # kom batch = bhalo
    'machine_feasibility': 0.30,     # machine capacity match
    'machine_availability': 0.20,    # free machine = bhalo
    'time_efficiency': 0.20,         # kom total time = bhalo
}

# Gap between two orders on same machine (hours)
QUEUE_GAP_HOURS = 2


# ============================================================
# Core Calculation
# ============================================================

def calculate_batch_time(qty, machine_max):
    """
    Batch time estimate (hours).
    Base: 8 hours + extra 12 hours based on utilization.
    """
    if machine_max <= 0:
        return 10
    utilization = min(qty / machine_max, 1.0)
    return round(8 + 12 * utilization, 1)


def get_machine_availability(machine, exclude_order=None):
    """
    Calculate availability score (0-100) based on existing bookings.
    """
    bookings = BatchAllocationDetail.objects.filter(
        machine=machine,
        status__in=['planned', 'running'],
    )
    if exclude_order:
        bookings = bookings.exclude(order=exclude_order)

    if not bookings.exists():
        return 100

    running_count = bookings.filter(status='running').count()
    planned_count = bookings.filter(status='planned').count()

    # Running = heavy penalty, Planned = light penalty
    penalty = running_count * 30 + planned_count * 10
    return max(20, 100 - penalty)


def get_machine_next_available(machine, exclude_order=None):
    """
    Machine er next available time ber koro.
    Existing bookings check kore — jodi kono booking na thake, now + 1 din.
    """
    now = timezone.now()
    # Default: kal shokal 8 AM
    default_start = now.replace(hour=8, minute=0, second=0, microsecond=0)
    if default_start < now:
        default_start += timedelta(days=1)

    bookings_qs = BatchAllocationDetail.objects.filter(
        machine=machine,
    ).select_related('order')

    if exclude_order:
        bookings_qs = bookings_qs.exclude(order=exclude_order)

    # Max end time ber koro
    max_end = now
    for b in bookings_qs:
        try:
            bp = b.process_tracker
            if bp.end_time and bp.end_time > max_end:
                max_end = bp.end_time
        except BatchProcess.DoesNotExist:
            pass

    # Jodi kono booking na thake
    if max_end == now:
        return default_start

    # Latest booking er pore 2 hours gap
    next_available = max_end + timedelta(hours=QUEUE_GAP_HOURS)

    # Jodi next_available gotokal raat hoy, kal shokal 8 AM e shift koro
    if next_available.hour < 8:
        next_available = next_available.replace(hour=8, minute=0, second=0, microsecond=0)

    return next_available


def get_machine_feasibility(qty, machine, yarn_type):
    """
    Feasibility score (0-100) — machine capacity vs qty match.
    """
    if yarn_type == 'Knit':
        min_cap = machine.knit_yarn_min
        max_cap = machine.knit_yarn_max
    else:
        min_cap = machine.knit_sweater_min
        max_cap = machine.knit_sweater_max

    if max_cap <= 0:
        return 0

    if qty < min_cap:
        return 30
    if qty > max_cap:
        return 0

    # Optimal = 60-90% utilization
    utilization = qty / max_cap
    if 0.6 <= utilization <= 0.9:
        return 100
    elif 0.4 <= utilization < 0.6:
        return 85
    elif 0.9 < utilization <= 1.0:
        return 90
    else:
        return 70


def calculate_score(batch_opt, feasibility, availability, time_eff):
    """Weighted score (0-100)."""
    return round(
        batch_opt * WEIGHTS['batch_optimization'] +
        feasibility * WEIGHTS['machine_feasibility'] +
        availability * WEIGHTS['machine_availability'] +
        time_eff * WEIGHTS['time_efficiency'],
        1
    )


# ============================================================
# Helper Functions
# ============================================================

def build_batch(batch_id, machine, alloc_qty, start_time=None):
    """Build a batch dict for JSON."""
    machine_max = machine.knit_yarn_max
    machine_min = machine.knit_yarn_min

    hours = calculate_batch_time(alloc_qty, machine_max)

    end_time = None
    if start_time:
        end_time = start_time + timedelta(hours=hours)

    return {
        'batch_id': batch_id,
        'machine_id': machine.id,
        'machine_name': f"{machine.company} {machine.machine_capacity}",
        'allocated_qty': alloc_qty,
        'batch_time_hours': hours,
        'machine_max': machine_max,
        'machine_min': machine_min,
        'start_time': start_time,
        'end_time': end_time,
    }


def generate_reasoning(combo_id, batches, qty, yarn_type, machine_start=None):
    """Dynamic reasoning text based on actual batch data."""
    num_batches = len(batches)
    num_machines = len(set(b['machine_id'] for b in batches))
    total_time = sum(b['batch_time_hours'] for b in batches)

    machine_names = ', '.join(b['machine_name'] for b in batches)
    start_label = machine_start.strftime('%d %b %Y, %I:%M %p') if machine_start else 'immediately'

    if num_batches == 1:
        utilization = round(batches[0]['allocated_qty'] / batches[0]['machine_max'] * 100)
        reasoning = (
            f"Uses a single machine ({machine_names}) to process the entire order "
            f"in one batch. Machine is {utilization}% utilized and will start {start_label}."
        )
    elif num_machines == 1:
        reasoning = (
            f"Uses a single machine ({machine_names}) with {num_batches} sequential batches "
            f"of ~{round(batches[0]['allocated_qty'])} kg each. "
            f"Starts {start_label}, total time: {round(total_time, 1)}h."
        )
    elif num_batches == 2:
        reasoning = (
            f"Splits the order across 2 machines ({machine_names}) to balance the load. "
            f"Reduces per-batch processing time but requires coordination. Starts {start_label}."
        )
    else:
        reasoning = (
            f"Uses {num_batches} machines ({machine_names}) for maximum parallelism. "
            f"Total time: {round(total_time, 1)}h. Starts {start_label}."
        )

    return reasoning


def generate_pros_cons(batches, qty, yarn_type):
    """Dynamic pros/cons based on batch data."""
    pros = []
    cons = []

    num_batches = len(batches)
    num_machines = len(set(b['machine_id'] for b in batches))

    # Pros
    if num_batches == 1:
        pros.append("Only 1 batch — simplest scheduling")
        pros.append("Fastest total processing time")
        pros.append("No inter-machine transfers")
    elif num_machines == 1:
        pros.append("Single machine — simpler coordination")
        pros.append(f"{num_batches} sequential batches on same machine")
        pros.append("No inter-machine transfers")
    elif num_batches == 2:
        pros.append("Balanced machine utilization")
        pros.append("Parallel processing possible")
    else:
        pros.append("Maximum parallelism potential")
        pros.append(f"{num_machines} machines working simultaneously")

    # Cons
    for batch in batches:
        utilization = batch['allocated_qty'] / batch['machine_max']
        if utilization > 0.9:
            cons.append(f"{batch['machine_name']} at {round(utilization*100)}% capacity")
            break

    if num_batches >= 2 and num_machines >= 2:
        cons.append(f"Requires coordination between {num_machines} machines")
    elif num_batches >= 3 and num_machines == 1:
        cons.append(f"Total {num_batches} sequential batches")

    if not pros:
        pros.append("Standard allocation")

    if not cons:
        cons.append("No significant concerns")

    return pros[:3], cons[:2]


# ============================================================
# Main Function
# ============================================================

def generate_combinations_for_order(order):
    """
    Main function — generate all possible combinations for an order.

    ✅ Multiple batches on same machine supported
    ✅ Machine availability with next-available-time
    ✅ Excludes current order from bookings
    """
    qty = order.dyeing_qty or order.order_qty
    yarn_type = order.yarn_count or 'Knit'
    combos = []

    machines = list(DyeingMachine.objects.all().order_by('display_order', 'id'))
    if not machines:
        return combos

    # ============================================
    # COMBO A: Single best-fit machine (multiple batches if needed)
    # ============================================
    machines_sorted = sorted(
        machines,
        key=lambda m: m.knit_yarn_max if yarn_type == 'Knit' else m.knit_sweater_max,
        reverse=True,
    )

    for best in machines_sorted:
        machine_max = best.knit_yarn_max if yarn_type == 'Knit' else best.knit_sweater_max

        if machine_max <= 0:
            continue

        # ✅ Multiple batches for big orders
        num_batches = max(1, int((qty + machine_max - 1) // machine_max))
        qty_per_batch = qty / num_batches

        # ✅ Machine er next available time
        machine_start = get_machine_next_available(best, exclude_order=order)

        batches = []
        current_start = machine_start
        for i in range(num_batches):
            remaining = qty - sum(b['allocated_qty'] for b in batches)
            if i < num_batches - 1:
                alloc = round(qty_per_batch, 1)
            else:
                alloc = round(remaining, 1)

            batch = build_batch(f'B-{i+1}', best, alloc, current_start)
            batches.append(batch)

            # Next batch starts after current batch ends
            current_start = batch['end_time']

        # Calculate score
        batch_opt = max(40, 100 - (num_batches - 1) * 15)
        feasibility = get_machine_feasibility(min(qty_per_batch, machine_max), best, yarn_type)
        availability = get_machine_availability(best, exclude_order=order)
        total_time = sum(b['batch_time_hours'] for b in batches)
        time_eff = max(0, 100 - total_time * 2)

        score = calculate_score(batch_opt, feasibility, availability, time_eff)

        pros, cons = generate_pros_cons(batches, qty, yarn_type)
        reasoning = generate_reasoning('COMBO-A', batches, qty, yarn_type, machine_start)

        if num_batches == 1:
            summary = 'Single machine, optimal efficiency'
        elif num_batches <= 3:
            summary = f'Single machine, {num_batches} batches'
        else:
            summary = f'Single machine, {num_batches} sequential batches'

        combos.append({
            'id': 'COMBO-A',
            'is_best_match': False,
            'score': score,
            'total_batches': num_batches,
            'machines_used': 1,
            'total_time': round(total_time, 1),
            'criteria': {
                'batch_optimization': batch_opt,
                'machine_feasibility': feasibility,
                'machine_availability': availability,
                'time_efficiency': time_eff,
            },
            'recommendation': {
                'summary': summary,
                'reasoning': reasoning,
                'pros': pros,
                'cons': cons,
            },
            'batches': batches,
            'machine_start_time': machine_start.isoformat(),
        })

        break  # Best machine e kaj shesh

    # ============================================
    # COMBO B: Two machines split
    # ============================================
    if len(machines) >= 2:
        top2 = sorted(
            machines,
            key=lambda m: m.knit_yarn_max if yarn_type == 'Knit' else m.knit_sweater_max,
            reverse=True,
        )[:2]

        m1, m2 = top2
        max1 = m1.knit_yarn_max if yarn_type == 'Knit' else m1.knit_sweater_max
        max2 = m2.knit_yarn_max if yarn_type == 'Knit' else m2.knit_sweater_max

        if (max1 + max2) >= 1:
            qty1 = min(max1, round(qty * 0.5))
            qty2 = round(qty - qty1, 1)

            start1 = get_machine_next_available(m1, exclude_order=order)
            start2 = get_machine_next_available(m2, exclude_order=order)

            batch1 = build_batch('B-1', m1, qty1, start1)
            batch2 = build_batch('B-2', m2, qty2, start2)

            batch_opt = 75
            feasibility = round(
                (get_machine_feasibility(qty1, m1, yarn_type) +
                 get_machine_feasibility(qty2, m2, yarn_type)) / 2
            )
            availability = round(
                (get_machine_availability(m1, exclude_order=order) +
                 get_machine_availability(m2, exclude_order=order)) / 2
            )
            total_time = max(batch1['batch_time_hours'], batch2['batch_time_hours'])
            time_eff = max(0, 100 - total_time * 2)

            score = calculate_score(batch_opt, feasibility, availability, time_eff)

            pros, cons = generate_pros_cons([batch1, batch2], qty, yarn_type)
            reasoning = generate_reasoning('COMBO-B', [batch1, batch2], qty, yarn_type, start1)

            combos.append({
                'id': 'COMBO-B',
                'is_best_match': False,
                'score': score,
                'total_batches': 2,
                'machines_used': 2,
                'total_time': round(total_time, 1),
                'criteria': {
                    'batch_optimization': batch_opt,
                    'machine_feasibility': feasibility,
                    'machine_availability': availability,
                    'time_efficiency': time_eff,
                },
                'recommendation': {
                    'summary': 'Two machines, parallel processing',
                    'reasoning': reasoning,
                    'pros': pros,
                    'cons': cons,
                },
                'batches': [batch1, batch2],
            })

    # ============================================
    # COMBO C: Three machines
    # ============================================
    if len(machines) >= 3:
        top3 = sorted(
            machines,
            key=lambda m: m.knit_yarn_max if yarn_type == 'Knit' else m.knit_sweater_max,
            reverse=True,
        )[:3]

        max_caps = [
            m.knit_yarn_max if yarn_type == 'Knit' else m.knit_sweater_max
            for m in top3
        ]

        if sum(max_caps) >= 1:
            qty_per = qty / 3
            batches = []
            for i, m in enumerate(top3, start=1):
                alloc = min(qty_per, max_caps[i-1])
                start = get_machine_next_available(m, exclude_order=order)
                batches.append(build_batch(f'B-{i}', m, round(alloc, 1), start))

            batch_opt = 45
            feasibility = round(
                sum(get_machine_feasibility(b['allocated_qty'], top3[i], yarn_type)
                    for i, b in enumerate(batches)) / 3
            )
            availability = round(
                sum(get_machine_availability(m, exclude_order=order) for m in top3) / 3
            )
            total_time = max(b['batch_time_hours'] for b in batches)
            time_eff = max(0, 100 - total_time * 2)

            score = calculate_score(batch_opt, feasibility, availability, time_eff)

            pros, cons = generate_pros_cons(batches, qty, yarn_type)
            reasoning = generate_reasoning('COMBO-C', batches, qty, yarn_type, batches[0]['start_time'])

            combos.append({
                'id': 'COMBO-C',
                'is_best_match': False,
                'score': score,
                'total_batches': 3,
                'machines_used': 3,
                'total_time': round(total_time, 1),
                'criteria': {
                    'batch_optimization': batch_opt,
                    'machine_feasibility': feasibility,
                    'machine_availability': availability,
                    'time_efficiency': time_eff,
                },
                'recommendation': {
                    'summary': 'Three machines, maximum parallelism',
                    'reasoning': reasoning,
                    'pros': pros,
                    'cons': cons,
                },
                'batches': batches,
            })

    # ============================================
    # Sort by score (highest first) & mark best
    # ============================================
    combos.sort(key=lambda c: c['score'], reverse=True)
    if combos:
        for c in combos:
            c['is_best_match'] = False
        combos[0]['is_best_match'] = True

    return combos