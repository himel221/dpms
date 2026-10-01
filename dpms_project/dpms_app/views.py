from django.shortcuts import render
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db.models import Q
from .models import Order,DyeingMachine
import json
from django.db.models import Sum, Count, Q




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

def orders_page(request):
    """Render the orders page with optional filter."""
    initial_filter = request.GET.get('filter', None)

    orders = Order.objects.all()

    # Summary counts
    context = {
        'orders': orders,
        'initial_filter': initial_filter,
        'active_view': 'orders',
        'rejection_count': 0,
        'total_orders': orders.count(),
        'inactive_count': orders.filter(status='Inactive').count(),
        'pending_count': orders.filter(status='Pending').count(),
        'in_progress_count': orders.filter(status='In Progress').count(),
        'completed_count': orders.filter(status='Completed').count(),
        'delayed_count': orders.filter(status='Delayed').count(),
        'emergency_count': orders.filter(status='Emergency').count(),
        'planned_count': orders.filter(is_planned=True).count(),
    }
    return render(request, 'order/orders.html', context)


@require_http_methods(["POST"])
def order_create(request):
    """Create a new order via AJAX."""
    try:
        data = json.loads(request.body)
        order = Order.objects.create(
            customer_name=data.get('customerName', ''),
            order_date=data.get('orderDate'),
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
    """Dyeing Machine Details — EAL company er sob machine."""
    company = request.GET.get('company', 'EAL')

    machines = DyeingMachine.objects.filter(company=company).order_by('display_order', 'id')

    # Group by company (for title)
    companies = DyeingMachine.objects.values_list('company', flat=True).distinct()

    context = {
        'active_view': 'machines',
        'rejection_count': 0,
        'machines': machines,
        'company': company,
        'companies': companies,
        'total_machines': machines.count(),
    }
    return render(request, 'machines/machines.html', context)