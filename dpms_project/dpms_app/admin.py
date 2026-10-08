from django.contrib import admin
from .models import (
    Order,
    DyeingMachine,
    ProductionPlan,
    PlanStep,
    BatchAllocation,
    BatchAllocationDetail,
)


# ============================================================
# Order Admin
# ============================================================

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        'order_id', 'customer_name', 'yarn_count', 'color',
        'order_qty', 'status', 'priority', 'order_date',
    )
    list_filter = ('status', 'approval', 'priority', 'is_planned', 'order_date')
    search_fields = ('order_id', 'customer_name', 'yarn_count', 'yarn_code', 'color')
    list_editable = ('status', 'priority')
    readonly_fields = ('order_id', 'created_at', 'updated_at')
    date_hierarchy = 'order_date'

    fieldsets = (
        ('Basic Info', {
            'fields': ('order_id', 'customer_name', 'order_date',
                       'ref_no_buyers', 'work_order_remark', 'comments')
        }),
        ('Yarn Details', {
            'fields': ('yarn_count', 'yarn_code', 'color', 'approval')
        }),
        ('Quantities (kg)', {
            'fields': (
                'order_qty', 'party_yarn', 'store_yarn', 'add_percent_yn',
                'dyeing_qty', 'reject_qty', 'dyed_bal_qty', 'finish_qty',
                'del_qty', 'held_up_qty', 'delivery_return', 'delivery_qty',
            )
        }),
        ('Status', {
            'fields': ('status', 'priority', 'is_planned', 'current_step')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


# ============================================================
# Machine Admin
# ============================================================

@admin.register(DyeingMachine)
class DyeingMachineAdmin(admin.ModelAdmin):
    list_display = (
        'company',
        'machine_capacity',
        'cone',
        'knit_sweater_min',
        'knit_sweater_max',
        'knit_yarn_min',
        'knit_yarn_max',
        'display_order',
    )
    list_filter = ('company',)
    search_fields = ('machine_capacity',)
    list_editable = ('display_order',)
    ordering = ('display_order', 'id')

    fieldsets = (
        ('Basic Info', {
            'fields': ('company', 'machine_capacity', 'display_order')
        }),
        ('Cone', {
            'fields': ('cone',)
        }),
        ('Knit Sweater Yarn (kg)', {
            'fields': ('knit_sweater_min', 'knit_sweater_max')
        }),
        ('Knit Yarn (kg)', {
            'fields': ('knit_yarn_min', 'knit_yarn_max')
        }),
    )


# ============================================================
# Planning & Batch Admin
# ============================================================

@admin.register(ProductionPlan)
class ProductionPlanAdmin(admin.ModelAdmin):
    list_display = ('plan_id', 'name', 'plan_type', 'created_at')
    list_filter = ('plan_type', 'created_at')
    search_fields = ('plan_id', 'name')
    readonly_fields = ('plan_id', 'created_at', 'updated_at')


@admin.register(PlanStep)
class PlanStepAdmin(admin.ModelAdmin):
    list_display = (
        'plan', 'order', 'step_name', 'machine',
        'start_time', 'end_time', 'duration_hours', 'status',
    )
    list_filter = ('status', 'step_name', 'plan')
    search_fields = ('plan__plan_id', 'order__order_id', 'step_name')


@admin.register(BatchAllocation)
class BatchAllocationAdmin(admin.ModelAdmin):
    list_display = ('order', 'machine', 'is_allocated', 'allocated_at')
    list_filter = ('is_allocated',)
    search_fields = ('order__order_id', 'machine__machine_capacity')


@admin.register(BatchAllocationDetail)
class BatchAllocationDetailAdmin(admin.ModelAdmin):
    list_display = (
        'order', 'batch_id', 'machine',
        'allocated_qty', 'batch_time_hours', 'status',
    )
    list_filter = ('status', 'machine')
    search_fields = ('order__order_id', 'batch_id')
    ordering = ('order', 'batch_id')

from .models import BatchProcess, StepComment, Rejection


@admin.register(BatchProcess)
class BatchProcessAdmin(admin.ModelAdmin):
    list_display = ('allocation', 'current_step', 'updated_at')
    list_filter = ('current_step',)
    search_fields = ('allocation__batch_id',)


@admin.register(StepComment)
class StepCommentAdmin(admin.ModelAdmin):
    list_display = ('order', 'step_name', 'updated_at')
    search_fields = ('order__order_id', 'step_name')


@admin.register(Rejection)
class RejectionAdmin(admin.ModelAdmin):
    list_display = ('batch_process', 'step', 'timestamp')
    list_filter = ('step',)
    search_fields = ('batch_process__allocation__batch_id',)