from django.contrib import admin
from .models import Order


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

#===========================================Machine admin==========================================#
from django.contrib import admin
from .models import Order, DyeingMachine


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