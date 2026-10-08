from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db.models import Sum, Count, Q
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.core.paginator import Paginator
from django.core.paginator import Paginator
from django.utils.dateparse import parse_datetime
from django.utils import timezone

from .models import (
    Order, DyeingMachine, ProductionPlan, PlanStep,
    BatchAllocation, BatchAllocationDetail,
    BatchProcess, BatchStepComment, StepComment, Rejection,ParameterFolder,ManageStep,ParameterFolder, Parameter,OrderStepTracker, 
)
from .planner_logic import generate_combinations_for_order
import json
import traceback
from django.views.decorators.csrf import csrf_exempt
from django.utils.text import slugify
from .models import ParameterFolder, Parameter
from django.core.paginator import Paginator

def dashboard(request):
    """Dashboard — database theke data fetch kore section wise dekhay."""
    orders = Order.objects.all()

    # ============ Summary Counts ============
    total_orders      = orders.count()
    inactive_count    = orders.filter(status='Inactive').count()
    pending_count     = orders.filter(status='Pending').count()
    in_progress_count = orders.filter(status='In Progress').count()
    completed_count   = orders.filter(status='Completed').count()
    delayed_count     = orders.filter(status='Delayed').count()
    emergency_count   = orders.filter(status='Emergency').count()
    planned_count     = orders.filter(is_planned=True).count()

    # ============ Total Quantity ============
    total_qty = orders.aggregate(s=Sum('order_qty'))['s'] or 0

    # ============ Order Status Distribution (for pie chart) ============
    status_data = [
        {
            'name': 'Inactive',
            'count': inactive_count,
            'qty': orders.filter(status='Inactive').aggregate(s=Sum('order_qty'))['s'] or 0,
            'color': '#64748b',
        },
        {
            'name': 'Pending',
            'count': pending_count,
            'qty': orders.filter(status='Pending').aggregate(s=Sum('order_qty'))['s'] or 0,
            'color': '#eab308',
        },
        {
            'name': 'In Progress',
            'count': in_progress_count,
            'qty': orders.filter(status='In Progress').aggregate(s=Sum('order_qty'))['s'] or 0,
            'color': '#a855f7',
        },
        {
            'name': 'Completed',
            'count': completed_count,
            'qty': orders.filter(status='Completed').aggregate(s=Sum('order_qty'))['s'] or 0,
            'color': '#10b981',
        },
        {
            'name': 'Delayed',
            'count': delayed_count,
            'qty': orders.filter(status='Delayed').aggregate(s=Sum('order_qty'))['s'] or 0,
            'color': '#ef4444',
        },
        {
            'name': 'Emergency',
            'count': emergency_count,
            'qty': orders.filter(status='Emergency').aggregate(s=Sum('order_qty'))['s'] or 0,
            'color': '#f97316',
        },
    ]

    # ============ Recent Orders (Emergency, Delayed, Pending) ============
    recent_orders = orders.filter(
        Q(status='Emergency') | Q(status='Delayed') | Q(status='Pending')
    ).order_by('-created_at')[:10]

    # ============ Top Customers (for bar chart) ============
    top_customers = (
        orders.values('customer_name')
        .annotate(total_qty=Sum('order_qty'), total_count=Count('id'))
        .order_by('-total_qty')[:6]
    )

    # ============ ✅ NEW: All Orders as JSON (JS filter er jonno) ============
    orders_json = []
    for o in orders:
        orders_json.append({
            'id': o.order_id,
            'customerName': o.customer_name,
            'orderDate': str(o.order_date),
            'yarnCount': o.yarn_count,
            'yarnCode': o.yarn_code,
            'color': o.color,
            'orderQty': o.order_qty,
            'partyYarn': o.party_yarn,
            'storeYarn': o.store_yarn,
            'status': o.status,
            'priority': o.priority,
            'isPlanned': o.is_planned,
            'currentStep': o.current_step or '',
            'batchAllocations': [],
        })

    context = {
        'active_view': 'dashboard',
        'rejection_count': emergency_count,

        # Summary counts
        'total_orders': total_orders,
        'inactive_count': inactive_count,
        'pending_count': pending_count,
        'in_progress_count': in_progress_count,
        'completed_count': completed_count,
        'delayed_count': delayed_count,
        'emergency_count': emergency_count,
        'planned_count': planned_count,
        'total_qty': total_qty,

        # Chart data (JSON)
        'status_data': status_data,
        'top_customers': list(top_customers),

        # Recent orders (Emergency / Delayed / Pending)
        'recent_orders': recent_orders,

        # ✅ All orders (for JS inline filter)
        'orders_json': orders_json,
    }
    return render(request, 'dashboard/index.html', context)


#==============================Order views==============================#
# ============================================================
# Current Order Views
# ============================================================

BATCH_PROGRESS_STEPS = [
    'Store', 'Soft winding', 'Dyeing', 'Hydro', 'Dryer',
    'Quality check', 'Finishing', 'Packing', 'Store (Final)', 'Delivery',
]


def _parse_dt(s):
    """Parse 'YYYY-MM-DDTHH:MM' → timezone-aware datetime."""
    if not s:
        return None
    dt = parse_datetime(s)
    if dt and timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


def _get_order_batch_progress(order, steps):
    allocations = list(
        BatchAllocationDetail.objects.filter(order=order)
        .select_related('machine')
        .order_by('batch_id')
    )
    if not allocations:
        return {
            'batches': [],
            'count': 0,
            'percent': 0,
            'automatic_steps_done': 0,
            'automatic_current_step': '',
        }

    allocation_ids = [allocation.id for allocation in allocations]
    processes = {
        process.allocation_id: process
        for process in BatchProcess.objects.filter(allocation_id__in=allocation_ids)
    }
    comments_by_allocation = {}
    for comment in BatchStepComment.objects.filter(allocation_id__in=allocation_ids):
        comments_by_allocation.setdefault(comment.allocation_id, {})[comment.step_name] = comment.comment
    rejections_by_allocation = {}
    for rejection in Rejection.objects.filter(
        batch_process__allocation_id__in=allocation_ids
    ).select_related('batch_process').order_by('-timestamp'):
        rejections_by_allocation.setdefault(
            rejection.batch_process.allocation_id, []
        ).append({
            'step': rejection.step,
            'reason': rejection.reason,
            'timestamp': rejection.timestamp,
        })

    batches = []
    completed_total = 0
    for allocation in allocations:
        process = processes.get(allocation.id)
        current_step = (
            'Completed'
            if allocation.status == 'completed'
            else process.current_step if process else 'Store'
        )
        completed_steps = set(process.completed_steps or []) if process else set()
        if current_step == 'Completed':
            completed_steps.add('Delivery')
        if allocation.status == 'completed':
            completed_steps.update(BATCH_PROGRESS_STEPS)
        completed_steps.intersection_update(BATCH_PROGRESS_STEPS)
        completed_total += len(completed_steps)

        step_comments = comments_by_allocation.get(allocation.id, {})
        step_timestamps = process.step_timestamps or {} if process else {}
        rejections = rejections_by_allocation.get(allocation.id, [])
        batch_steps = []
        for step_name in BATCH_PROGRESS_STEPS:
            is_completed = step_name in completed_steps
            completed_at = step_timestamps.get(step_name)
            if isinstance(completed_at, str):
                completed_at = parse_datetime(completed_at)
            batch_steps.append({
                'name': step_name,
                'is_completed': is_completed,
                'is_current': not is_completed and current_step == step_name,
                'completed_at': completed_at,
                'comment': step_comments.get(step_name, ''),
                'rejections': [
                    rejection for rejection in rejections
                    if rejection['step'] == step_name
                ],
            })

        batches.append({
            'id': allocation.batch_id,
            'quantity': allocation.allocated_qty,
            'machine': allocation.machine.machine_capacity if allocation.machine else 'Unallocated',
            'current_step': current_step,
            'percent': round(len(completed_steps) * 100 / len(BATCH_PROGRESS_STEPS)),
            'steps': batch_steps,
            'rejections': rejections,
        })

    total_possible = len(allocations) * len(BATCH_PROGRESS_STEPS)
    percent = round(completed_total * 100 / total_possible)
    automatic_steps_done = min(
        len(steps),
        completed_total * len(steps) // total_possible,
    ) if steps else 0
    automatic_current_step = (
        steps[automatic_steps_done].name
        if automatic_steps_done < len(steps)
        else 'Completed'
    ) if steps else ''

    return {
        'batches': batches,
        'count': len(allocations),
        'percent': percent,
        'automatic_steps_done': automatic_steps_done,
        'automatic_current_step': automatic_current_step,
    }


def _all_order_batches_completed(order):
    allocations = list(BatchAllocationDetail.objects.filter(order=order))
    if not allocations:
        return False

    processes = {
        process.allocation_id: process
        for process in BatchProcess.objects.filter(
            allocation_id__in=[allocation.id for allocation in allocations]
        )
    }
    return all(
        allocation.status == 'completed'
        or (
            process := processes.get(allocation.id)
        ) is not None and process.current_step == 'Completed'
        for allocation in allocations
    )


def _sync_order_status_from_batches(order):
    allocations = list(BatchAllocationDetail.objects.filter(order=order))
    if not allocations:
        return

    if _all_order_batches_completed(order):
        next_status = 'Completed'
    else:
        processes = {
            process.allocation_id: process
            for process in BatchProcess.objects.filter(
                allocation_id__in=[allocation.id for allocation in allocations]
            )
        }
        any_started = any(
            allocation.status == 'running'
            or (
                processes.get(allocation.id) is not None
                and processes[allocation.id].current_step != 'Store'
            )
            for allocation in allocations
        )
        if any_started:
            next_status = 'In Progress'
        elif order.status == 'Completed':
            next_status = 'Pending'
        else:
            next_status = order.status

    steps = list(ManageStep.objects.filter(is_active=True).order_by('display_order', 'id'))
    progress = _get_order_batch_progress(order, steps)
    next_step = progress['automatic_current_step'] or order.current_step

    if order.status != next_status or order.current_step != next_step:
        order.status = next_status
        order.current_step = next_step
        order.save(update_fields=['status', 'current_step', 'updated_at'])


def current_order_page(request, order_id=None):
    """Current Order page — master-detail with step trackers."""
    all_orders_qs = Order.objects.order_by('-updated_at', '-created_at')

    paginator = Paginator(all_orders_qs, 10)
    page_number = request.GET.get('page', 1)
    page_obj = paginator.get_page(page_number)

    if order_id:
        order = get_object_or_404(Order, order_id=order_id)
    else:
        order = page_obj.object_list.first() if page_obj.object_list else all_orders_qs.first()

    steps = ManageStep.objects.filter(is_active=True).order_by('display_order', 'id')
    batch_progress = _get_order_batch_progress(order, list(steps)) if order else {
        'batches': [],
        'count': 0,
        'percent': 0,
        'automatic_steps_done': 0,
        'automatic_current_step': '',
    }

    # ✅ Trackers map: {step_id: tracker}
    trackers_map = {}
    if order:
        for t in OrderStepTracker.objects.filter(order=order):
            trackers_map[t.step_id] = t

    # Row objects for template
    step_rows = []
    for s in steps:
        index = len(step_rows)
        step_rows.append({
            'step': s,
            'tracker': trackers_map.get(s.id),
            'auto_done': index < batch_progress['automatic_steps_done'],
            'auto_active': (
                index == batch_progress['automatic_steps_done']
                and batch_progress['count'] > 0
            ),
            'done': (
                bool(trackers_map.get(s.id) and trackers_map[s.id].end_time)
                or index < batch_progress['automatic_steps_done']
            ),
        })

    display_current_step = (
        order.current_step or batch_progress['automatic_current_step']
    ) if order else ''
    context = {
        'active_view': 'current_order',
        'rejection_count': 0,
        'order': order,
        'all_orders': page_obj,
        'page_obj': page_obj,
        'paginator': paginator,
        'steps': steps,
        'step_rows': step_rows,   # ✅ template e ei list iterate hobe
        'batch_progress': batch_progress,
        'display_current_step': display_current_step,
    }
    return render(request, 'order/current_order.html', context)


@require_http_methods(["POST"])
def order_step_update(request, order_id, step_id):
    """Update start/end time and comment for a specific step."""
    try:
        order = get_object_or_404(Order, order_id=order_id)
        step = get_object_or_404(ManageStep, id=step_id)
        data = json.loads(request.body)

        tracker, _ = OrderStepTracker.objects.get_or_create(
            order=order, step=step
        )

        if 'startTime' in data:
            tracker.start_time = _parse_dt(data.get('startTime'))

        if 'endTime' in data:
            tracker.end_time = _parse_dt(data.get('endTime'))

        if 'comment' in data:
            tracker.comment = (data.get('comment') or '').strip()

        # Active step change
        if data.get('isActive'):
            OrderStepTracker.objects.filter(order=order).update(is_active=False)
            tracker.is_active = True
            order.current_step = step.name
            order.save()

        tracker.save()

        return JsonResponse({
            'success': True,
            'tracker': {
                'id': tracker.id,
                'orderId': tracker.order_id,
                'stepId': tracker.step_id,
                'startTime': tracker.start_time.isoformat() if tracker.start_time else None,
                'endTime': tracker.end_time.isoformat() if tracker.end_time else None,
                'comment': tracker.comment or '',
                'isActive': tracker.is_active,
            },
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    
@require_http_methods(["POST"])
def current_order_update_status(request, order_id):
    """Update order status and/or current step."""
    try:
        order = get_object_or_404(Order, order_id=order_id)
        data = json.loads(request.body)

        if data.get('status') == 'Completed':
            if (
                BatchAllocationDetail.objects.filter(order=order).exists()
                and not _all_order_batches_completed(order)
            ):
                return JsonResponse({
                    'success': False,
                    'error': 'Complete delivery for every batch before completing this order.',
                    'status': order.status,
                }, status=400)

        if 'status' in data and data['status']:
            order.status = data['status']
        if 'currentStep' in data:
            order.current_step = data['currentStep']

        order.save()

        return JsonResponse({
            'success': True,
            'status': order.status,
            'currentStep': order.current_step or '',
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)



def orders_page(request):
    """Render orders page with parameter-driven dropdowns + pagination."""
    initial_filter = request.GET.get('filter', None)
    all_orders = Order.objects.all().order_by('-created_at')
    orders = all_orders
    valid_statuses = ('Inactive', 'Pending', 'In Progress', 'Completed', 'Delayed', 'Emergency')
    if initial_filter in valid_statuses:
        orders = orders.filter(status=initial_filter)
    elif initial_filter == 'Planned':
        orders = orders.filter(is_planned=True)
    else:
        initial_filter = None

    # ✅ Parameter folder theke values
    def get_param_values(folder_name):
        folder = ParameterFolder.objects.filter(name__iexact=folder_name).first()
        if not folder:
            return []
        return list(
            folder.parameters.filter(is_active=True)
            .order_by('display_order', 'name')
            .values_list('name', flat=True)
        )

    # ✅ Parameter folders: Customer, Ref No, Yarn Count, Yarn Code, Color
    customer_values   = get_param_values('Customer')
    ref_values        = get_param_values('Ref No')
    yarn_count_values = get_param_values('Yarn Count')
    yarn_code_values  = get_param_values('Yarn Code')
    color_values      = get_param_values('Color')

    # ✅ Pagination — 10 per page
    paginator = Paginator(orders, 10)
    page_number = request.GET.get('page', 1)
    page_obj = paginator.get_page(page_number)

    # Filter dropdown values (existing orders theke)
    unique_customers   = list(all_orders.values_list('customer_name', flat=True).distinct().order_by('customer_name'))
    unique_yarn_counts = list(all_orders.values_list('yarn_count', flat=True).distinct().order_by('yarn_count'))
    unique_yarn_codes  = list(all_orders.values_list('yarn_code', flat=True).distinct().order_by('yarn_code'))
    unique_colors      = list(all_orders.values_list('color', flat=True).distinct().order_by('color'))
    status_chart_data = [
        {
            'name': status,
            'count': all_orders.filter(status=status).count(),
            'color': color,
        }
        for status, color in (
            ('Inactive', '#64748b'),
            ('Pending', '#eab308'),
            ('In Progress', '#a855f7'),
            ('Completed', '#10b981'),
            ('Delayed', '#ef4444'),
            ('Emergency', '#f97316'),
        )
    ]

    context = {
        'orders': page_obj,
        'page_obj': page_obj,
        'paginator': paginator,
        'initial_filter': initial_filter,
        'active_view': 'orders',
        'rejection_count': 0,
        'total_orders': all_orders.count(),
        'inactive_count': all_orders.filter(status='Inactive').count(),
        'pending_count': all_orders.filter(status='Pending').count(),
        'in_progress_count': all_orders.filter(status='In Progress').count(),
        'completed_count': all_orders.filter(status='Completed').count(),
        'delayed_count': all_orders.filter(status='Delayed').count(),
        'emergency_count': all_orders.filter(status='Emergency').count(),
        'planned_count': all_orders.filter(is_planned=True).count(),
        'status_chart_data': status_chart_data,
        # ✅ Parameter-driven values
        'customer_values': customer_values,
        'ref_values': ref_values,
        'yarn_count_values': yarn_count_values,
        'yarn_code_values': yarn_code_values,
        'color_values': color_values,
        # Filter dropdowns
        'unique_customers': unique_customers,
        'unique_yarn_counts': unique_yarn_counts,
        'unique_yarn_codes': unique_yarn_codes,
        'unique_colors': unique_colors,
    }
    return render(request, 'order/orders.html', context)

def order_detail_page(request, order_id):
    """Full order detail page with qty update form."""
    order = get_object_or_404(Order, order_id=order_id)

    context = {
        'active_view': 'orders',
        'rejection_count': 0,
        'order': order,
    }
    return render(request, 'order/order_detail.html', context)


@require_http_methods(["POST"])
def order_update_qty(request, order_id):
    """
    Update qty fields with auto-calc:
      Dyed Bal Qty = (Order Qty - Dyeing Qty) + Reject Qty
      Finish Qty   = Dyeing Qty - Reject Qty
      Held Up Qty  = Finish Qty - Del Qty
      Delivery Qty = Del Qty - Delivery Return
    """
    try:
        order = get_object_or_404(Order, order_id=order_id)
        data = json.loads(request.body)

        def to_float(v):
            try:
                return float(v or 0)
            except (ValueError, TypeError):
                return 0.0

        # User input fields
        order_qty       = to_float(data.get('orderQty', order.order_qty))
        dyeing_qty      = to_float(data.get('dyeingQty'))
        reject_qty      = to_float(data.get('rejectQty'))
        del_qty         = to_float(data.get('delQty'))
        delivery_return = to_float(data.get('deliveryReturn'))

        # ✅ Auto-calculations
        dyed_bal_qty  = (order_qty - dyeing_qty) + reject_qty
        finish_qty    = dyeing_qty - reject_qty
        held_up_qty   = finish_qty - del_qty
        delivery_qty  = del_qty - delivery_return

        # Save
        order.order_qty       = order_qty
        order.dyeing_qty      = dyeing_qty
        order.reject_qty      = reject_qty
        order.del_qty         = del_qty
        order.delivery_return = delivery_return
        order.dyed_bal_qty    = dyed_bal_qty
        order.finish_qty      = finish_qty
        order.held_up_qty     = held_up_qty
        order.delivery_qty    = delivery_qty
        order.save()

        return JsonResponse({
            'success': True,
            'calculated': {
                'dyedBalQty': dyed_bal_qty,
                'finishQty': finish_qty,
                'heldUpQty': held_up_qty,
                'deliveryQty': delivery_qty,
            },
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    
@require_http_methods(["POST"])
def order_create(request):
    """Create a new order via AJAX."""
    try:
        data = json.loads(request.body)
        order = Order.objects.create(
            customer_name=data.get('customerName', ''),
            order_date=data.get('orderDate'),
            delivery_date=data.get('deliveryDate') or None,
            ref_no_buyers=data.get('refNoBuyers', ''),
            work_order_remark=data.get('workOrderRemark', ''),
            comments=data.get('comments', ''),
            yarn_count=data.get('yarnCount', ''),
            yarn_code=data.get('yarnCode', ''),
            color=data.get('color', ''),
            approval=data.get('approval', 'no'),
            order_qty=float(data.get('orderQty') or 0),
            party_yarn=float(data.get('partyYarn') or 0),
            store_yarn=float(data.get('storeYarn') or 0),
            add_percent_yn=float(data.get('addPercentYN') or 0),
            dyeing_qty=float(data.get('dyeingQty') or 0),
            reject_qty=float(data.get('rejectQty') or 0),
            dyed_bal_qty=float(data.get('dyedBalQty') or 0),
            finish_qty=float(data.get('finishQty') or 0),
            del_qty=float(data.get('delQty') or 0),
            held_up_qty=float(data.get('heldUpQty') or 0),
            delivery_return=float(data.get('deliveryReturn') or 0),
            delivery_qty=float(data.get('deliveryQty') or 0),
            status=data.get('status', 'Pending'),
        )
        return JsonResponse({
            'success': True,
            'order': serialize_order(order),
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def order_update(request, order_id):
    """Update an existing order via AJAX."""
    try:
        order = get_object_or_404(Order, order_id=order_id)
        data = json.loads(request.body)

        order.customer_name = data.get('customerName', order.customer_name)
        order.order_date = data.get('orderDate', order.order_date)
        if 'deliveryDate' in data:
            order.delivery_date = data.get('deliveryDate') or None
        order.ref_no_buyers = data.get('refNoBuyers', order.ref_no_buyers)
        order.work_order_remark = data.get('workOrderRemark', order.work_order_remark)
        order.comments = data.get('comments', order.comments)
        order.yarn_count = data.get('yarnCount', order.yarn_count)
        order.yarn_code = data.get('yarnCode', order.yarn_code)
        order.color = data.get('color', order.color)
        order.approval = data.get('approval', order.approval)
        order.order_qty = float(data.get('orderQty') or order.order_qty)
        order.party_yarn = float(data.get('partyYarn') or 0)
        order.store_yarn = float(data.get('storeYarn') or 0)
        order.add_percent_yn = float(data.get('addPercentYN') or 0)
        order.dyeing_qty = float(data.get('dyeingQty') or 0)
        order.reject_qty = float(data.get('rejectQty') or 0)
        order.dyed_bal_qty = float(data.get('dyedBalQty') or 0)
        order.finish_qty = float(data.get('finishQty') or 0)
        order.del_qty = float(data.get('delQty') or 0)
        order.held_up_qty = float(data.get('heldUpQty') or 0)
        order.delivery_return = float(data.get('deliveryReturn') or 0)
        order.delivery_qty = float(data.get('deliveryQty') or 0)
        order.status = data.get('status', order.status)
        order.save()

        return JsonResponse({'success': True, 'order': serialize_order(order)})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def order_delete(request, order_id):
    """Delete an order via AJAX."""
    try:
        order = get_object_or_404(Order, order_id=order_id)
        order.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


def serialize_order(order):
    """Convert Order model to dict for JSON response."""
    return {
        'id': order.order_id,
        'customerName': order.customer_name,
        'orderDate': str(order.order_date),
        'deliveryDate': str(order.delivery_date) if order.delivery_date else '',
        'refNoBuyers': order.ref_no_buyers,
        'workOrderRemark': order.work_order_remark,
        'comments': order.comments,
        'yarnCount': order.yarn_count,
        'yarnCode': order.yarn_code,
        'color': order.color,
        'approval': order.approval,
        'orderQty': order.order_qty,
        'partyYarn': order.party_yarn,
        'storeYarn': order.store_yarn,
        'addPercentYN': order.add_percent_yn,
        'dyeingQty': order.dyeing_qty,
        'rejectQty': order.reject_qty,
        'dyedBalQty': order.dyed_bal_qty,
        'finishQty': order.finish_qty,
        'delQty': order.del_qty,
        'heldUpQty': order.held_up_qty,
        'deliveryReturn': order.delivery_return,
        'deliveryQty': order.delivery_qty,
        'status': order.status,
        'priority': order.priority,
        'isPlanned': order.is_planned,
        'currentStep': order.current_step,
    }

#=============================Machine Views=================================#

@require_http_methods(["POST"])
def machine_create(request):
    """Create a new dyeing machine via AJAX."""
    try:
        data = json.loads(request.body)

        def safe_float(val, default=0):
            try:
                return float(val) if val not in (None, '', 'undefined', 'null') else default
            except (ValueError, TypeError):
                return default

        machine = DyeingMachine.objects.create(
            company=data.get('company', 'EAL'),
            machine_capacity=data.get('machineCapacity', ''),
            cone=safe_float(data.get('cone')),
            knit_sweater_min=safe_float(data.get('knitSweaterMin')),
            knit_sweater_max=safe_float(data.get('knitSweaterMax')),
            knit_yarn_min=safe_float(data.get('knitYarnMin')),
            knit_yarn_max=safe_float(data.get('knitYarnMax')),
            display_order=int(data.get('displayOrder') or 0),
        )
        return JsonResponse({
            'success': True,
            'machine': serialize_machine(machine),
        }, status=201)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

@require_http_methods(["POST"])
def machine_update(request, machine_id):
    """Update an existing dyeing machine via AJAX."""
    try:
        machine = get_object_or_404(DyeingMachine, id=machine_id)
        data = json.loads(request.body)

        def safe_float(val, default=0):
            try:
                return float(val) if val not in (None, '', 'undefined', 'null') else default
            except (ValueError, TypeError):
                return default

        if 'company' in data:
            machine.company = data['company']
        if 'machineCapacity' in data:
            machine.machine_capacity = data['machineCapacity']
        if 'cone' in data:
            machine.cone = safe_float(data['cone'])
        if 'knitSweaterMin' in data:
            machine.knit_sweater_min = safe_float(data['knitSweaterMin'])
        if 'knitSweaterMax' in data:
            machine.knit_sweater_max = safe_float(data['knitSweaterMax'])
        if 'knitYarnMin' in data:
            machine.knit_yarn_min = safe_float(data['knitYarnMin'])
        if 'knitYarnMax' in data:
            machine.knit_yarn_max = safe_float(data['knitYarnMax'])
        if 'displayOrder' in data:
            machine.display_order = int(data['displayOrder'] or 0)

        machine.save()

        return JsonResponse({
            'success': True,
            'machine': serialize_machine(machine),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def machine_delete(request, machine_id):
    """Delete a dyeing machine via AJAX."""
    try:
        machine = get_object_or_404(DyeingMachine, id=machine_id)
        machine.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


def serialize_machine(m):
    """Convert DyeingMachine to dict."""
    return {
        'id': m.id,
        'company': m.company,
        'machineCapacity': m.machine_capacity,
        'cone': m.cone,
        'knitSweaterMin': m.knit_sweater_min,
        'knitSweaterMax': m.knit_sweater_max,
        'knitYarnMin': m.knit_yarn_min,
        'knitYarnMax': m.knit_yarn_max,
        'displayOrder': m.display_order,
    }

def machines_page(request):
    """Dyeing Machine Details — company list Parameter theke ashe."""
    company = request.GET.get('company', '').strip()

    # ✅ Parameter folder "Company" theke company list
    company_folder = ParameterFolder.objects.filter(
        name__iexact='Company'
    ).first()
    if not company_folder:
        company_folder = ParameterFolder.objects.filter(
            slug__iexact='company'
        ).first()

    company_params = []
    if company_folder:
        company_params = company_folder.parameters.filter(
            is_active=True
        ).order_by('display_order', 'name')

    # ✅ Company-র default = first parameter name, na thakle 'EAL'
    if not company:
        if company_params.exists():
            company = company_params.first().name
        else:
            company = 'EAL'

    machines = DyeingMachine.objects.filter(company=company).order_by('display_order', 'id')
    companies = DyeingMachine.objects.values_list('company', flat=True).distinct()

    context = {
        'active_view': 'machines',
        'rejection_count': 0,
        'machines': machines,
        'company': company,
        'companies': companies,
        'total_machines': machines.count(),

        # ✅ Parameter theke asha company list
        'company_params': company_params,
        'company_folder': company_folder,
    }
    return render(request, 'machines/machines.html', context)

#=============================Planning & Batch Views==================================#
from datetime import datetime, timedelta
from .models import (
    Order, DyeingMachine, ProductionPlan,
    PlanStep, BatchAllocation,
)

# ============================================================
# Planner Constants
# ============================================================
PROCESS_STEPS = [
    'Order Receive', 'Verification', 'Grey Yarn Collection', 'Yarn Testing',
    'Unpacking', 'Pre-treatment', 'Dyeing Loading', 'Dyeing', 'Washing',
    'Drying', 'Finishing', 'Rewinding', 'Packing', 'Storage', 'Delivery'
]

STEP_BASE_DURATIONS = {
    'Order Receive': 2, 'Verification': 4, 'Grey Yarn Collection': 8,
    'Yarn Testing': 6, 'Unpacking': 4, 'Pre-treatment': 12,
    'Dyeing Loading': 6, 'Dyeing': 24, 'Washing': 8,
    'Drying': 16, 'Finishing': 12, 'Rewinding': 10,
    'Packing': 6, 'Storage': 4, 'Delivery': 8
}


def calculate_duration(step, qty):
    """Calculate duration based on step + qty."""
    base = STEP_BASE_DURATIONS.get(step, 4)
    return int(base * (1 + qty / 1000))


def find_best_machine(qty):
    """Find best-fit machine by capacity."""
    machines = DyeingMachine.objects.all().order_by('cone')
    if not machines.exists():
        return None
    for m in machines:
        if m.cone >= qty:
            return m
    return machines.last()


# ============================================================
# Planner Views
# ============================================================

def planner_page(request):
    """Render the Production Planner page."""
    orders = Order.objects.all().order_by('-created_at')
    machines = DyeingMachine.objects.all().order_by('display_order', 'id')

    # Ensure batch allocation records for pending orders
    pending_orders = orders.filter(status='Pending')
    for order in pending_orders:
        BatchAllocation.objects.get_or_create(order=order)

    # Get allocations
    allocations = BatchAllocation.objects.select_related('order', 'machine')

    # Counts
    total_pending = pending_orders.count()
    unallocated_pending = allocations.filter(
        order__status='Pending', is_allocated=False
    ).count()
    allocated_pending = allocations.filter(
        order__status='Pending', is_allocated=True
    ).count()

    # Saved plans
    saved_plans = ProductionPlan.objects.all().order_by('-created_at')

    # Orders JSON for JS
    orders_json = []
    for o in orders:
        allocation = getattr(o, 'batch_allocation', None)
        orders_json.append({
            'id': o.order_id,
            'customer': o.customer_name,
            'qty': o.order_qty,
            'yarn': o.yarn_count,
            'color': o.color,
            'date': str(o.order_date),
            'status': o.status,
            'allocated': bool(allocation and allocation.is_allocated),
            'machineId': allocation.machine.id if allocation and allocation.machine else None,
            'machineLabel': allocation.machine.machine_capacity if allocation and allocation.machine else None,
        })

    # Machines JSON
    machines_json = []
    for m in machines:
        machines_json.append({
            'id': m.id,
            'capacity': m.cone,
            'company': m.company,
            'label': m.machine_capacity,
        })

    context = {
        'active_view': 'plan',
        'rejection_count': pending_orders.filter(status='Emergency').count(),
        'orders': orders,
        'machines': machines,
        'saved_plans': saved_plans,
        'total_pending': total_pending,
        'unallocated_pending': unallocated_pending,
        'allocated_pending': allocated_pending,
        'total_orders': orders.count(),
        'orders_json': orders_json,
        'machines_json': machines_json,
    }
    return render(request, 'planner/planner.html', context)


@require_http_methods(["POST"])
def allocate_machine(request, order_id):
    """Allocate a machine to an order."""
    try:
        order = get_object_or_404(Order, order_id=order_id)
        data = json.loads(request.body)

        machine_id = data.get('machineId')
        if machine_id:
            machine = get_object_or_404(DyeingMachine, id=machine_id)
        else:
            machine = find_best_machine(order.order_qty)

        if not machine:
            return JsonResponse(
                {'success': False, 'error': 'No machines available'},
                status=400,
            )

        allocation, _ = BatchAllocation.objects.get_or_create(order=order)
        allocation.machine = machine
        allocation.is_allocated = True
        allocation.save()

        return JsonResponse({
            'success': True,
            'orderId': order.order_id,
            'machine': {
                'id': machine.id,
                'label': machine.machine_capacity,
                'capacity': machine.cone,
            },
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def generate_plan(request):

    try:
        from django.utils.dateparse import parse_datetime
        from datetime import timedelta

        data = json.loads(request.body)
        plan_type = data.get('planType', 'auto')
        plan_name = data.get('name', 'Untitled Plan')
        steps = data.get('steps', [])

        # ============================================
        # 1. Create ProductionPlan
        # ============================================
        plan = ProductionPlan.objects.create(
            name=plan_name,
            plan_type=plan_type,
        )

        # ============================================
        # 2. Save each PlanStep
        # ============================================
        for idx, s in enumerate(steps):
            order = get_object_or_404(Order, order_id=s['orderId'])

            machine = None
            if s.get('machineId'):
                try:
                    machine = DyeingMachine.objects.get(id=s['machineId'])
                except DyeingMachine.DoesNotExist:
                    pass

            PlanStep.objects.create(
                plan=plan,
                order=order,
                machine=machine,
                step_name=s['step'],
                step_order=idx,
                start_time=s['startDate'],
                end_time=s['endDate'],
                duration_hours=s.get('duration', 0),
                status='pending',
            )

        # ============================================
        # 3. Mark orders as planned
        # ============================================
        order_ids = list(set([s['orderId'] for s in steps]))
        Order.objects.filter(order_id__in=order_ids).update(is_planned=True)

        # ============================================
        # 4. ✅ Auto-create BatchAllocationDetail + BatchProcess
        # ============================================
        for order_id in order_ids:
            order = Order.objects.get(order_id=order_id)

            # Find Dyeing step
            dyeing_step = plan.steps.filter(order=order, step_name='Dyeing').first()
            if not dyeing_step or not dyeing_step.start_time:
                continue

            # Get machine
            machine = dyeing_step.machine
            if not machine:
                machine = DyeingMachine.objects.first()
            if not machine:
                continue

            # Determine machine max capacity
            yarn_type = (order.yarn_count or '').lower()
            knit_max = machine.knit_yarn_max or 0
            sweater_max = machine.knit_sweater_max or 0

            if 'sweater' in yarn_type:
                machine_max = sweater_max if sweater_max > 0 else 100
            elif 'knit' in yarn_type:
                machine_max = knit_max if knit_max > 0 else 100
            else:
                machine_max = max(knit_max, sweater_max) or 100

            qty = order.dyeing_qty or order.order_qty
            if qty <= 0:
                continue

            # Delete old batch allocations
            BatchAllocationDetail.objects.filter(order=order).delete()

            # Create batches
            num_batches = max(1, int((qty + machine_max - 1) // machine_max))
            qty_per_batch = qty / num_batches

            # Check machine queue
            existing_bookings = BatchProcess.objects.filter(
                allocation__machine=machine,
            ).exclude(
                allocation__order=order
            ).order_by('-end_time')

            machine_last_end = None
            if existing_bookings.exists():
                machine_last_end = existing_bookings.first().end_time

            current_start = dyeing_step.start_time
            if machine_last_end and machine_last_end > current_start:
                current_start = machine_last_end + timedelta(hours=2)

            # Create batch allocations
            for i in range(num_batches):
                batch_id = f'B-{i+1}'

                if i < num_batches - 1:
                    alloc = round(qty_per_batch, 1)
                else:
                    prev_total = sum(
                        BatchAllocationDetail.objects.filter(order=order)
                        .values_list('allocated_qty', flat=True)
                    )
                    alloc = round(qty - prev_total, 1)

                hours = round(8 + 12 * (alloc / machine_max), 1)
                end_time = current_start + timedelta(hours=hours)

                alloc_obj = BatchAllocationDetail.objects.create(
                    order=order,
                    batch_id=batch_id,
                    machine=machine,
                    allocated_qty=alloc,
                    batch_time_hours=hours,
                    status='planned',
                )

                bp, _ = BatchProcess.objects.get_or_create(allocation=alloc_obj)
                bp.start_time = current_start
                bp.end_time = end_time
                bp.current_step = 'Store'
                bp.save()

                current_start = end_time

        return JsonResponse({
            'success': True,
            'planId': plan.plan_id,
            'name': plan.name,
        }, status=201)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    
    
@require_http_methods(["POST"])
def delete_plan(request, plan_id):
    """Delete a saved plan."""
    try:
        plan = get_object_or_404(ProductionPlan, plan_id=plan_id)
        plan.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


def plan_detail(request, plan_id):
    """Get plan details as JSON."""
    try:
        plan = get_object_or_404(ProductionPlan, plan_id=plan_id)
        steps = []
        for s in plan.steps.all().order_by('order__order_id', 'step_order'):
            steps.append({
                'orderId': s.order.order_id,
                'step': s.step_name,
                'machineId': s.machine.machine_capacity if s.machine else None,
                'startDate': s.start_time.isoformat(),
                'endDate': s.end_time.isoformat(),
                'duration': s.duration_hours,
                'status': s.status,
            })
        return JsonResponse({
            'success': True,
            'plan': {
                'id': plan.plan_id,
                'name': plan.name,
                'planType': plan.plan_type,
                'createdAt': plan.created_at.isoformat(),
                'steps': steps,
            },
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=404)

def planner_list(request):
    """Return all saved plans as JSON."""
    plans = ProductionPlan.objects.all().order_by('-created_at')
    data = []
    for p in plans:
        # ✅ Sob step theke unique order_id extract korо
        order_ids = list(
            p.steps
            .values_list('order__order_id', flat=True)
            .distinct()
            .order_by('order__order_id')
        )
        data.append({
            'id': p.plan_id,
            'name': p.name,
            'planType': p.plan_type,
            'createdAt': p.created_at.isoformat(),
            'orderIds': order_ids,           # ← unique list
            'orderCount': len(order_ids),    # ← count o pathai
            'stepCount': p.steps.count(),    # ← total steps
        })
    return JsonResponse({'success': True, 'plans': data})

@require_http_methods(["GET", "POST"])
def batch_allocation_api(request, order_id):
    """
    GET: Return order + machines + combinations + existing bookings.
    POST: Save allocations (BatchAllocationDetail) + sync BatchProcess.
    """
    order = get_object_or_404(Order, order_id=order_id)

    # ============================================================
    # GET — Modal open korar somoy data pathay
    # ============================================================
    if request.method == "GET":
        # ============ Machines with booking status ============
        machines_data = []
        for m in DyeingMachine.objects.all().order_by('display_order', 'id'):
            bookings = BatchAllocationDetail.objects.filter(
                machine=m,
                status__in=['planned', 'running'],
            ).exclude(order=order).select_related('order')

            bookings_list = []
            for b in bookings:
                # Get BatchProcess info
                try:
                    bp = b.process_tracker
                    start_iso = bp.start_time.isoformat() if bp.start_time else None
                    end_iso = bp.end_time.isoformat() if bp.end_time else None
                except BatchProcess.DoesNotExist:
                    start_iso = None
                    end_iso = None

                bookings_list.append({
                    'orderId': b.order.order_id,
                    'batchId': b.batch_id,
                    'qty': b.allocated_qty,
                    'hours': b.batch_time_hours,
                    'status': b.status,
                    'startTime': start_iso,
                    'endTime': end_iso,
                })

            machines_data.append({
                'id': m.id,
                'company': m.company,
                'machineCapacityDisplay': m.machine_capacity,
                'knitYarnMax': m.knit_yarn_max,
                'knitYarnMin': m.knit_yarn_min,
                'sweaterYarnMax': m.knit_sweater_max,
                'sweaterYarnMin': m.knit_sweater_min,
                'bookings': bookings_list,
                'bookingsCount': len(bookings_list),
            })

        # ============ Existing allocations ============
        existing = BatchAllocationDetail.objects.filter(order=order).order_by('batch_id')
        existing_allocations = []
        for b in existing:
            try:
                bp = b.process_tracker
                start_iso = bp.start_time.isoformat() if bp.start_time else None
                end_iso = bp.end_time.isoformat() if bp.end_time else None
                current_step = bp.current_step
                completed_steps = bp.completed_steps or []
            except BatchProcess.DoesNotExist:
                start_iso = None
                end_iso = None
                current_step = 'Store'
                completed_steps = []

            existing_allocations.append({
                'batchId': b.batch_id,
                'machineId': b.machine.id if b.machine else None,
                'allocatedQty': b.allocated_qty,
                'batchTimeHours': b.batch_time_hours,
                'status': b.status,
                'startTime': start_iso,
                'endTime': end_iso,
                'currentStep': current_step,
                'completedSteps': completed_steps,
            })

        # ============ ✅ Generate combinations dynamically ============
        combinations = generate_combinations_for_order(order)

        # ============ Convert snake_case to camelCase for JS ============
        combinations_camel = []
        for c in combinations:
            combinations_camel.append({
                'id': c['id'],
                'isBestMatch': c['is_best_match'],
                'score': c['score'],
                'totalBatches': c['total_batches'],
                'machinesUsed': c['machines_used'],
                'totalTime': c['total_time'],
                'criteria': c['criteria'],
                'recommendation': {
                    'summary': c['recommendation']['summary'],
                    'reasoning': c['recommendation']['reasoning'],
                    'pros': c['recommendation']['pros'],
                    'cons': c['recommendation']['cons'],
                },
                'batches': [{
                    'batchId': b['batch_id'],
                    'machineId': b['machine_id'],
                    'machineName': b['machine_name'],
                    'allocatedQty': b['allocated_qty'],
                    'batchTimeHours': b['batch_time_hours'],
                    'startTime': b['start_time'].isoformat() if b.get('start_time') else None,
                    'endTime': b['end_time'].isoformat() if b.get('end_time') else None,
                } for b in c['batches']],
                'machineStartTime': c.get('machine_start_time'),
            })

        return JsonResponse({
            'success': True,
            'order': {
                'id': order.order_id,
                'customerName': order.customer_name,
                'orderQty': order.order_qty,
                'dyeingQty': order.dyeing_qty or order.order_qty,
                'yarnCode': order.yarn_code,
                'yarnCount': order.yarn_count,
                'yarnType': order.yarn_count,
            },
            'machines': machines_data,
            'existingAllocations': existing_allocations,
            'combinations': combinations_camel,
        })

    # ============================================================
    # POST — Save allocations + sync BatchProcess
    # ============================================================
    elif request.method == "POST":
        try:
            from django.utils.dateparse import parse_datetime

            data = json.loads(request.body)
            allocations = data.get('allocations', [])

            # Delete old batch details for this order
            BatchAllocationDetail.objects.filter(order=order).delete()

            # ============ Create new batch details ============
            for a in allocations:
                machine = None
                if a.get('machineId'):
                    try:
                        machine = DyeingMachine.objects.get(id=a['machineId'])
                    except DyeingMachine.DoesNotExist:
                        pass

                # ✅ Parse start/end time
                start_dt = None
                end_dt = None
                if a.get('startTime'):
                    start_dt = parse_datetime(a['startTime'])
                if a.get('endTime'):
                    end_dt = parse_datetime(a['endTime'])

                alloc = BatchAllocationDetail.objects.create(
                    order=order,
                    batch_id=a.get('batchId', 'B-1'),
                    machine=machine,
                    allocated_qty=float(a.get('allocatedQty') or 0),
                    batch_time_hours=float(a.get('batchTimeHours') or 0),
                    status=a.get('status', 'planned'),
                )

                # ✅ Sync BatchProcess with start/end time
                bp, _ = BatchProcess.objects.get_or_create(allocation=alloc)
                if start_dt:
                    bp.start_time = start_dt
                if end_dt:
                    bp.end_time = end_dt
                bp.save()

            # ============ Update main BatchAllocation ============
            main_alloc, _ = BatchAllocation.objects.get_or_create(order=order)
            if allocations:
                first_machine_id = allocations[0].get('machineId')
                if first_machine_id:
                    try:
                        main_alloc.machine = DyeingMachine.objects.get(id=first_machine_id)
                    except DyeingMachine.DoesNotExist:
                        pass
                main_alloc.is_allocated = True
                main_alloc.save()

            # ============ Update order status ============
            order.is_planned = True
            order.save()
            _sync_order_status_from_batches(order)

            return JsonResponse({
                'success': True,
                'count': len(allocations),
                'message': f'{len(allocations)} batch(es) saved',
            })

        except Exception as e:
            import traceback
            traceback.print_exc()
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


# ============================================================
# Batch Process Tracker Views
# ============================================================

PROCESS_TRACKER_STEPS = [
    'Order Receive', 'Verification', 'Grey Yarn Collection', 'Yarn Testing',
    'Unpacking', 'Pre-treatment', 'Dyeing Loading', 'Dyeing', 'Washing',
    'Drying', 'Finishing', 'Rewinding', 'Packing', 'Storage', 'Delivery'
]


def tracker_page(request, batch_id=None):
    """
    Batch Process Tracker page.
    Jodi batch_id thake → oi batch er tracker
    Jodi na thake → first batch er tracker
    """
    if not batch_id:
        first = BatchAllocationDetail.objects.first()
        if not first:
            return render(request, 'tracker/tracker.html', {
                'active_view': 'batches',
                'rejection_count': 0,
                'batch': None,
                'all_steps': PROCESS_TRACKER_STEPS,
                'batch_steps': [],
            })
        batch_id = first.batch_id

    allocation = get_object_or_404(BatchAllocationDetail, batch_id=batch_id)

    # Ensure BatchProcess exists
    batch_process, _ = BatchProcess.objects.get_or_create(allocation=allocation)

    # Get or create step comments
    step_comments = {}
    for c in StepComment.objects.filter(order=allocation.order):
        step_comments[c.step_name] = c.comment

    # Get rejections
    rejections = []
    for r in Rejection.objects.filter(batch_process=batch_process):
        rejections.append({
            'step': r.step,
            'reason': r.reason,
            'timestamp': r.timestamp.isoformat(),
        })

    # All batches for list
    all_batches = []
    all_allocations = list(
        BatchAllocationDetail.objects.select_related('machine', 'order').all()
    )
    all_allocation_ids = [item.id for item in all_allocations]
    all_step_comments = {}
    for comment in BatchStepComment.objects.filter(allocation_id__in=all_allocation_ids):
        all_step_comments.setdefault(comment.allocation_id, {})[comment.step_name] = comment.comment
    all_rejections = {}
    for rejection in Rejection.objects.filter(
        batch_process__allocation_id__in=all_allocation_ids
    ).select_related('batch_process').order_by('-timestamp'):
        all_rejections.setdefault(rejection.batch_process.allocation_id, []).append({
            'step': rejection.step,
            'reason': rejection.reason,
            'timestamp': rejection.timestamp.isoformat(),
        })
    for a in all_allocations:
        bp, _ = BatchProcess.objects.get_or_create(allocation=a)
        all_batches.append({
            'allocation_id': a.id,
            'id': a.batch_id,
            'name': f"Batch {a.batch_id} - {a.order.customer_name}",
            'current_step': bp.current_step,
            'completed_steps': bp.completed_steps or [],
            'step_timestamps': bp.step_timestamps or {},
            'quantity': a.allocated_qty,
            'machine_name': a.machine.machine_capacity if a.machine else 'Unallocated',
            'machine_id': a.machine.id if a.machine else None,
            'order_id': a.order.order_id,
            'rejections': all_rejections.get(a.id, []),
            'comment': bp.comment or '',
            'delivery_issue': bp.delivery_issue or None,
            'step_comments': all_step_comments.get(a.id, {}),
        })

    context = {
        'active_view': 'batches',
        'rejection_count': rejections.__len__(),
        'batch': {
            'allocation_id': allocation.id,
            'id': allocation.batch_id,
            'name': f"Batch {allocation.batch_id} - {allocation.order.customer_name}",
            'current_step': batch_process.current_step,
            'completed_steps': batch_process.completed_steps or [],
            'step_timestamps': batch_process.step_timestamps or {},
            'quantity': allocation.allocated_qty,
            'machine_name': allocation.machine.machine_capacity if allocation.machine else 'Unallocated',
            'machine_id': allocation.machine.id if allocation.machine else None,
            'order_id': allocation.order.order_id,
            'rejections': rejections,
            'comment': batch_process.comment or '',
            'delivery_issue': batch_process.delivery_issue or None,
            'step_comments': all_step_comments.get(allocation.id, {}),
        },
        'all_batches': all_batches,
        'all_steps': PROCESS_TRACKER_STEPS,
        'step_comments': step_comments,
    }
    return render(request, 'tracker/tracker.html', context)


@require_http_methods(["POST"])
def tracker_advance_step(request, batch_id):
    """Advance batch to next step."""
    try:
        allocation = get_object_or_404(BatchAllocationDetail, batch_id=batch_id)
        bp, _ = BatchProcess.objects.get_or_create(allocation=allocation)

        from datetime import datetime
        BATCH_STEPS = ['Store', 'Soft winding', 'Dyeing', 'Hydro', 'Dryer',
                       'Quality check', 'Finishing', 'Packing',
                       'Store (Final)', 'Delivery', 'Completed']

        idx = BATCH_STEPS.index(bp.current_step)
        if idx >= len(BATCH_STEPS) - 1:
            return JsonResponse({'success': False, 'error': 'Already completed'})

        completed = list(bp.completed_steps or [])
        completed.append(bp.current_step)

        timestamps = dict(bp.step_timestamps or {})
        timestamps[bp.current_step] = datetime.now().isoformat()

        bp.completed_steps = completed
        bp.step_timestamps = timestamps
        bp.current_step = BATCH_STEPS[idx + 1]
        bp.save()
        if bp.current_step == 'Completed':
            allocation.status = 'completed'
        elif allocation.status == 'planned':
            allocation.status = 'running'
        allocation.save(update_fields=['status', 'updated_at'])
        _sync_order_status_from_batches(allocation.order)

        return JsonResponse({
            'success': True,
            'current_step': bp.current_step,
            'completed_steps': bp.completed_steps,
            'step_timestamps': bp.step_timestamps,
            'order_status': allocation.order.status,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def tracker_reject_batch(request, batch_id):
    """Reject batch — return to Dyeing."""
    try:
        data = json.loads(request.body)
        reason = data.get('reason', '').strip()
        if not reason:
            return JsonResponse({'success': False, 'error': 'Reason required'}, status=400)

        allocation = get_object_or_404(BatchAllocationDetail, batch_id=batch_id)
        bp, _ = BatchProcess.objects.get_or_create(allocation=allocation)

        # Create rejection record
        rejection = Rejection.objects.create(
            batch_process=bp,
            step=bp.current_step,
            reason=reason,
        )

        # Reset to Dyeing
        BATCH_STEPS = ['Store', 'Soft winding', 'Dyeing', 'Hydro', 'Dryer',
                       'Quality check', 'Finishing', 'Packing',
                       'Store (Final)', 'Delivery', 'Completed']
        dyeing_idx = BATCH_STEPS.index('Dyeing')
        bp.completed_steps = [s for s in (bp.completed_steps or []) if BATCH_STEPS.index(s) < dyeing_idx]
        bp.current_step = 'Dyeing'
        bp.comment = reason
        bp.save()
        allocation.status = 'running'
        allocation.save(update_fields=['status', 'updated_at'])
        _sync_order_status_from_batches(allocation.order)

        return JsonResponse({
            'success': True,
            'current_step': bp.current_step,
            'completed_steps': bp.completed_steps,
            'rejection': {
                'step': rejection.step,
                'reason': rejection.reason,
                'timestamp': rejection.timestamp.isoformat(),
            },
            'order_status': allocation.order.status,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def tracker_delivery_issue(request, batch_id):
    """Report delivery issue — return to Store (Final)."""
    try:
        data = json.loads(request.body)
        description = data.get('description', '').strip()
        if not description:
            return JsonResponse({'success': False, 'error': 'Description required'}, status=400)

        allocation = get_object_or_404(BatchAllocationDetail, batch_id=batch_id)
        bp, _ = BatchProcess.objects.get_or_create(allocation=allocation)

        from datetime import datetime
        bp.delivery_issue = {
            'description': description,
            'timestamp': datetime.now().isoformat(),
        }
        BATCH_STEPS = ['Store', 'Soft winding', 'Dyeing', 'Hydro', 'Dryer',
                       'Quality check', 'Finishing', 'Packing',
                       'Store (Final)', 'Delivery', 'Completed']
        store_idx = BATCH_STEPS.index('Store (Final)')
        bp.completed_steps = [s for s in (bp.completed_steps or []) if BATCH_STEPS.index(s) < store_idx]
        bp.current_step = 'Store (Final)'
        bp.save()
        allocation.status = 'running'
        allocation.save(update_fields=['status', 'updated_at'])
        _sync_order_status_from_batches(allocation.order)

        return JsonResponse({
            'success': True,
            'current_step': bp.current_step,
            'completed_steps': bp.completed_steps,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def tracker_save_comment(request, batch_id):
    """Save batch comment."""
    try:
        data = json.loads(request.body)
        comment = data.get('comment', '')
        allocation = get_object_or_404(BatchAllocationDetail, batch_id=batch_id)
        bp, _ = BatchProcess.objects.get_or_create(allocation=allocation)
        bp.comment = comment
        bp.save()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def tracker_save_batch_step_comment(request, allocation_id):
    """Save a comment against one manufacturing step of one batch."""
    try:
        data = json.loads(request.body)
        step_name = (data.get('step_name') or '').strip()
        comment = data.get('comment', '')
        if step_name not in BATCH_PROGRESS_STEPS:
            return JsonResponse({'success': False, 'error': 'Invalid batch step'}, status=400)

        allocation = get_object_or_404(BatchAllocationDetail, id=allocation_id)
        BatchStepComment.objects.update_or_create(
            allocation=allocation,
            step_name=step_name,
            defaults={'comment': comment},
        )
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def tracker_save_step_comment(request):
    """Save step comment (main 15-step process er jonno)."""
    try:
        data = json.loads(request.body)
        order_id = data.get('order_id')
        step_name = data.get('step_name')
        comment = data.get('comment', '')

        order = get_object_or_404(Order, order_id=order_id)
        StepComment.objects.update_or_create(
            order=order,
            step_name=step_name,
            defaults={'comment': comment},
        )
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

#=============================Batch progress================================================#
def batches_page(request):
    """
    All Batches — Gantt + Machine Schedule view.
    Data ashe: Order + BatchAllocationDetail + BatchProcess
    """
    from datetime import datetime, timedelta

    # ==========================================
    # Get all batches
    # ==========================================
    allocations = BatchAllocationDetail.objects.select_related(
        'order', 'machine'
    ).all()

    # ==========================================
    # Get all machines
    # ==========================================
    machines_qs = DyeingMachine.objects.all().order_by('display_order', 'id')
    machines = []
    for m in machines_qs:
        # Expand instances (e.g. 400X2 → 400XA, 400XB)
        import re
        match = re.search(r'X(\d+)', m.machine_capacity, re.IGNORECASE)
        instance_count = int(match.group(1)) if match else 1
        for i in range(instance_count):
            letter = chr(65 + i)
            instance_name = re.sub(r'X\d+', f'X{letter}', m.machine_capacity, flags=re.IGNORECASE)
            full_name = f"{m.company} {instance_name}"
            machines.append({
                'id': m.id,
                'company': m.company,
                'machine_capacity': m.machine_capacity,
                'instance_name': instance_name,
                'full_name': full_name,
                'cone': m.cone,
            })

    # ==========================================
    # Build batches list
    # ==========================================
    batches = []
    for alloc in allocations:
        # Get or create BatchProcess
        bp, _ = BatchProcess.objects.get_or_create(allocation=alloc)

        # Get rejections
        rejections = []
        for r in Rejection.objects.filter(batch_process=bp):
            rejections.append({
                'step': r.step,
                'reason': r.reason,
                'timestamp': r.timestamp.isoformat(),
            })

        # Machine name
        if alloc.machine:
            machine_name = f"{alloc.machine.company} {alloc.machine.machine_capacity}"
        else:
            machine_name = 'Unallocated'

        batches.append({
            'batch_id': alloc.batch_id,
            'order_id': alloc.order.order_id,
            'customer_name': alloc.order.customer_name,
            'machine_id': alloc.machine.id if alloc.machine else None,
            'machine_name': machine_name,
            'allocated_qty': alloc.allocated_qty,
            'batch_time_hours': alloc.batch_time_hours,
            'status': alloc.status,
            'current_process_step': bp.current_step,
            'completed_process_steps': bp.completed_steps or [],
            'step_timestamps': bp.step_timestamps or {},
            'start_time': bp.start_time.isoformat() if bp.start_time else None,
            'end_time': bp.end_time.isoformat() if bp.end_time else None,
            'rejections': rejections,
            'is_rejection_reallocated': bp.is_rejection_reallocated,
            'comment': bp.comment or '',
        })

    # ==========================================
    # Context
    # ==========================================
    context = {
        'active_view': 'batches',
        'rejection_count': Rejection.objects.count(),
        'machines_json': machines,
        'batches_json': batches,
    }
    return render(request, 'batches/batches.html', context)


@require_http_methods(["POST"])
def batch_reschedule(request, batch_id):
    """Drag-drop reschedule — update start_time."""
    try:
        data = json.loads(request.body)
        new_start = data.get('startTime')
        new_end = data.get('endTime')

        allocation = get_object_or_404(BatchAllocationDetail, batch_id=batch_id)
        bp, _ = BatchProcess.objects.get_or_create(allocation=allocation)

        if new_start:
            from django.utils.dateparse import parse_datetime
            bp.start_time = parse_datetime(new_start)
        if new_end:
            from django.utils.dateparse import parse_datetime
            bp.end_time = parse_datetime(new_end)

        bp.save()
        return JsonResponse({'success': True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

#======================Parameter and Settings=============================#



# ============================================================
# Parameter Management Views
# ============================================================

def parameters_page(request):
    """Main parameter page — folder + parameter list."""
    folders = ParameterFolder.objects.prefetch_related('parameters').all()

    folder_id = request.GET.get('folder')
    if folder_id:
        active_folder = ParameterFolder.objects.filter(id=folder_id).first()
    else:
        active_folder = folders.first()

    parameters = []
    if active_folder:
        parameters = active_folder.parameters.all().order_by('display_order', 'name')

    context = {
        'active_view': 'parameters',
        'rejection_count': 0,
        'folders': folders,
        'active_folder': active_folder,
        'parameters': parameters,
    }
    return render(request, 'parameters/parameters.html', context)


# ---------- FOLDER CRUD ----------

@require_http_methods(["POST"])
def folder_create(request):
    """Create a new folder."""
    try:
        data = json.loads(request.body)
        name = (data.get('name') or '').strip()
        description = (data.get('description') or '').strip()

        try:
            display_order = int(data.get('displayOrder') or 0)
        except (ValueError, TypeError):
            display_order = 0

        if not name:
            return JsonResponse(
                {'success': False, 'error': 'Folder name required'},
                status=400,
            )

        folder = ParameterFolder.objects.create(
            name=name,
            description=description,
            display_order=display_order,
        )
        return JsonResponse({
            'success': True,
            'folder': serialize_folder(folder),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def folder_update(request, folder_id):
    """Update folder."""
    try:
        folder = get_object_or_404(ParameterFolder, id=folder_id)
        data = json.loads(request.body)

        if 'name' in data:
            new_name = (data['name'] or '').strip()
            if new_name:
                folder.name = new_name
                folder.slug = ''  # regenerate

        if 'description' in data:
            folder.description = (data['description'] or '').strip()

        if 'displayOrder' in data:
            try:
                folder.display_order = int(data['displayOrder'] or 0)
            except (ValueError, TypeError):
                folder.display_order = 0

        folder.save()
        return JsonResponse({'success': True, 'folder': serialize_folder(folder)})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def folder_delete(request, folder_id):
    """Delete folder (cascade deletes parameters)."""
    try:
        folder = get_object_or_404(ParameterFolder, id=folder_id)
        folder.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


def folder_detail(request, folder_id):
    """Get folder with its parameters (JSON)."""
    try:
        folder = get_object_or_404(ParameterFolder, id=folder_id)
        params = folder.parameters.all().order_by('display_order', 'name')
        return JsonResponse({
            'success': True,
            'folder': serialize_folder(folder),
            'parameters': [serialize_parameter(p) for p in params],
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=404)


# ---------- PARAMETER CRUD ----------

@require_http_methods(["POST"])
def parameter_create(request):
    """
    Create a new parameter.
    ✅ Shudu Name required.
    ✅ Key na dile name theke auto-generate hobe.
    ✅ Value / Type / Order / Active sob optional.
    """
    try:
        from django.utils.text import slugify

        data = json.loads(request.body)
        folder_id = data.get('folderId')
        name = (data.get('name') or '').strip()
        key = (data.get('key') or '').strip()
        value = (data.get('value') or '').strip()
        param_type = (data.get('paramType') or 'text').strip() or 'text'
        is_active = bool(data.get('isActive', True))

        try:
            display_order = int(data.get('displayOrder') or 0)
        except (ValueError, TypeError):
            display_order = 0

        # ✅ শুধু folderId + name required
        if not folder_id:
            return JsonResponse(
                {'success': False, 'error': 'Folder is required'},
                status=400,
            )

        if not name:
            return JsonResponse(
                {'success': False, 'error': 'Name is required'},
                status=400,
            )

        folder = get_object_or_404(ParameterFolder, id=folder_id)

        # ✅ Key ফাঁকা হলে name theke auto-generate (unique)
        if not key:
            base_key = slugify(name).replace('-', '_') or 'param'
            key = base_key
            counter = 1
            while Parameter.objects.filter(folder=folder, key=key).exists():
                key = f"{base_key}_{counter}"
                counter += 1
        else:
            # ✅ Key দিলে duplicate check
            if Parameter.objects.filter(folder=folder, key=key).exists():
                return JsonResponse(
                    {'success': False,
                     'error': f'Key "{key}" already exists in this folder'},
                    status=400,
                )

        param = Parameter.objects.create(
            folder=folder,
            name=name,
            key=key,
            value=value,
            param_type=param_type,
            is_active=is_active,
            display_order=display_order,
        )
        return JsonResponse({
            'success': True,
            'parameter': serialize_parameter(param),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def parameter_update(request, param_id):
    """
    Update parameter.
    ✅ Name optional (jodi pathano hoy).
    ✅ Key na dile name theke auto-generate hobe.
    """
    try:
        from django.utils.text import slugify

        param = get_object_or_404(Parameter, id=param_id)
        data = json.loads(request.body)

        # ---- Name ----
        if 'name' in data:
            new_name = (data['name'] or '').strip()
            if new_name:
                param.name = new_name

        # ---- Key ----
        if 'key' in data:
            new_key = (data['key'] or '').strip()
            if not new_key:
                # Empty → auto-generate from current name
                base_key = slugify(param.name).replace('-', '_') or 'param'
                new_key = base_key
                counter = 1
                while Parameter.objects.filter(
                    folder=param.folder, key=new_key
                ).exclude(pk=param.pk).exists():
                    new_key = f"{base_key}_{counter}"
                    counter += 1
            else:
                # Duplicate check
                if Parameter.objects.filter(
                    folder=param.folder, key=new_key
                ).exclude(pk=param.pk).exists():
                    return JsonResponse(
                        {'success': False,
                         'error': f'Key "{new_key}" already exists'},
                        status=400,
                    )
            param.key = new_key

        # ---- Other fields (optional) ----
        if 'value' in data:
            param.value = (data['value'] or '').strip()

        if 'paramType' in data:
            pt = (data['paramType'] or '').strip()
            if pt:
                param.param_type = pt

        if 'isActive' in data:
            param.is_active = bool(data['isActive'])

        if 'displayOrder' in data:
            try:
                param.display_order = int(data['displayOrder'] or 0)
            except (ValueError, TypeError):
                param.display_order = 0

        param.save()
        return JsonResponse({
            'success': True,
            'parameter': serialize_parameter(param),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@require_http_methods(["POST"])
def parameter_delete(request, param_id):
    """Delete parameter."""
    try:
        param = get_object_or_404(Parameter, id=param_id)
        param.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ---------- Serializers ----------

def serialize_folder(f):
    return {
        'id': f.id,
        'name': f.name,
        'slug': f.slug,
        'description': f.description or '',
        'displayOrder': f.display_order,
        'parameterCount': f.parameters.count(),
    }


def serialize_parameter(p):
    return {
        'id': p.id,
        'folderId': p.folder_id,
        'name': p.name,
        'key': p.key,
        'value': p.value or '',
        'paramType': p.param_type,
        'isActive': p.is_active,
        'displayOrder': p.display_order,
        'createdAt': p.created_at.isoformat(),
        'updatedAt': p.updated_at.isoformat(),
    }


# ============================================================
# Manage Views — Steps
# ============================================================

def manage_page(request):
    """Manage page — steps only."""
    steps = ManageStep.objects.all().order_by('display_order', 'id')

    context = {
        'active_view': 'manage',
        'rejection_count': 0,
        'steps': steps,
        'steps_count': steps.count(),
    }
    return render(request, 'manage/manage.html', context)


# ---------- STEP CRUD ----------
@require_http_methods(["POST"])
def step_create(request):
    """Create a new step."""
    try:
        data = json.loads(request.body)
        name = (data.get('name') or '').strip()

        try:
            initial_time = float(data.get('initialTime') or 0)
        except (ValueError, TypeError):
            initial_time = 0

        try:
            break_time = float(data.get('breakTime') or 0)
        except (ValueError, TypeError):
            break_time = 0

        try:
            display_order = int(data.get('displayOrder') or 0)
        except (ValueError, TypeError):
            display_order = 0

        is_active = bool(data.get('isActive', True))

        if not name:
            return JsonResponse(
                {'success': False, 'error': 'Step name required'},
                status=400,
            )

        step = ManageStep.objects.create(
            name=name,
            initial_time=initial_time,
            break_time=break_time,
            display_order=display_order,
            is_active=is_active,
        )
        return JsonResponse({
            'success': True,
            'step': serialize_step(step),
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    

@require_http_methods(["POST"])
def step_update(request, step_id):
    """Update step."""
    try:
        step = get_object_or_404(ManageStep, id=step_id)
        data = json.loads(request.body)

        if 'name' in data:
            new_name = (data['name'] or '').strip()
            if new_name:
                step.name = new_name

        if 'initialTime' in data:
            try:
                step.initial_time = float(data['initialTime'] or 0)
            except (ValueError, TypeError):
                step.initial_time = 0

        if 'breakTime' in data:
            try:
                step.break_time = float(data['breakTime'] or 0)
            except (ValueError, TypeError):
                step.break_time = 0

        if 'displayOrder' in data:
            try:
                step.display_order = int(data['displayOrder'] or 0)
            except (ValueError, TypeError):
                step.display_order = 0

        if 'isActive' in data:
            step.is_active = bool(data['isActive'])

        step.save()
        return JsonResponse({'success': True, 'step': serialize_step(step)})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    
@require_http_methods(["POST"])
def step_delete(request, step_id):
    """Delete step."""
    try:
        step = get_object_or_404(ManageStep, id=step_id)
        step.delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ---------- Serializer ----------

def serialize_step(s):
    return {
        'id': s.id,
        'name': s.name,
        'initialTime': s.initial_time,
        'breakTime': s.break_time,
        'displayOrder': s.display_order,
        'isActive': s.is_active,
        'createdAt': s.created_at.isoformat(),
        'updatedAt': s.updated_at.isoformat(),
    }