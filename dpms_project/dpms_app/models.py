from django.db import models


class Order(models.Model):
    STATUS_CHOICES = [
        ('Inactive', 'Inactive'),
        ('Pending', 'Pending'),
        ('In Progress', 'In Progress'),
        ('Completed', 'Completed'),
        ('Delayed', 'Delayed'),
        ('Emergency', 'Emergency'),
    ]

    APPROVAL_CHOICES = [
        ('yes', 'Yes'),
        ('no', 'No'),
    ]

    PRIORITY_CHOICES = [
        ('Normal', 'Normal'),
        ('Emergency', 'Emergency'),
        ('High', 'High'),
        ('Low', 'Low'),
    ]

    # Basic Info
    order_id = models.CharField(max_length=20, unique=True, blank=True)
    customer_name = models.CharField(max_length=200)
    order_date = models.DateField()
    delivery_date = models.DateField(blank=True, null=True)
    ref_no_buyers = models.CharField(max_length=200, blank=True, null=True)
    work_order_remark = models.CharField(max_length=300, blank=True, null=True)
    comments = models.TextField(blank=True, null=True)

    # Yarn info
    yarn_count = models.CharField(max_length=100)
    yarn_code = models.CharField(max_length=100)
    color = models.CharField(max_length=100)
    approval = models.CharField(max_length=3, choices=APPROVAL_CHOICES, default='no')

    # Quantities (kg)
    order_qty = models.FloatField(default=0)
    party_yarn = models.FloatField(default=0)
    store_yarn = models.FloatField(default=0)
    add_percent_yn = models.FloatField(default=0)
    dyeing_qty = models.FloatField(default=0)
    reject_qty = models.FloatField(default=0)
    dyed_bal_qty = models.FloatField(default=0)
    finish_qty = models.FloatField(default=0)
    del_qty = models.FloatField(default=0)
    held_up_qty = models.FloatField(default=0)
    delivery_return = models.FloatField(default=0)
    delivery_qty = models.FloatField(default=0)

    # Status
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='Pending')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='Normal')
    is_planned = models.BooleanField(default=False)
    current_step = models.CharField(max_length=100, blank=True, null=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Order'
        verbose_name_plural = 'Orders'

    def __str__(self):
        return f"{self.order_id} - {self.customer_name}"

    def save(self, *args, **kwargs):
        if not self.order_id:
            last = Order.objects.order_by('-id').first()
            next_num = 101 if not last else (last.id + 101)
            self.order_id = f"ORD-{next_num}"

        if self._state.adding and self.approval == 'no':
            self.status = 'Inactive'

        super().save(*args, **kwargs)


# ================================ Machine models ================================ #

class DyeingMachine(models.Model):
    COMPANY_CHOICES = [
        ('EAL', 'EAL'),
        ('Others', 'Others'),
    ]

    company = models.CharField(
        max_length=50,
        choices=COMPANY_CHOICES,
        default='EAL',
        help_text='Company name (e.g., EAL)',
    )
    machine_capacity = models.CharField(
        max_length=100,
        help_text='e.g., 3000X1, 2800X1, 7X6',
    )
    cone = models.FloatField(default=0, help_text='Cone value (kg)')
    knit_sweater_min = models.FloatField(default=0)
    knit_sweater_max = models.FloatField(default=0)
    knit_yarn_min = models.FloatField(default=0)
    knit_yarn_max = models.FloatField(default=0)

    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'id']
        verbose_name = 'Dyeing Machine'
        verbose_name_plural = 'Dyeing Machines'

    def __str__(self):
        return f"{self.company} - {self.machine_capacity}"


# ================================ Planning & Batch Models ================================ #

class ProductionPlan(models.Model):
    PLAN_TYPE_CHOICES = [
        ('auto', 'Auto'),
        ('manual', 'Manual'),
    ]

    plan_id = models.CharField(max_length=50, unique=True, blank=True)
    name = models.CharField(max_length=200)
    plan_type = models.CharField(max_length=20, choices=PLAN_TYPE_CHOICES, default='auto')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Production Plan'
        verbose_name_plural = 'Production Plans'

    def __str__(self):
        return f"{self.plan_id} - {self.name}"

    def save(self, *args, **kwargs):
        if not self.plan_id:
            import time
            self.plan_id = f"PLAN-{int(time.time() * 1000)}"
        super().save(*args, **kwargs)


class PlanStep(models.Model):
    plan = models.ForeignKey(
        ProductionPlan, on_delete=models.CASCADE, related_name='steps',
    )
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name='plan_steps',
    )
    machine = models.ForeignKey(
        DyeingMachine, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='plan_steps',
    )

    step_name = models.CharField(max_length=100)
    step_order = models.PositiveIntegerField(default=0)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    duration_hours = models.FloatField(default=0)

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    class Meta:
        ordering = ['plan', 'order', 'step_order']
        verbose_name = 'Plan Step'
        verbose_name_plural = 'Plan Steps'

    def __str__(self):
        return f"{self.plan.plan_id} - {self.order.order_id} - {self.step_name}"


class BatchAllocation(models.Model):
    order = models.OneToOneField(
        Order, on_delete=models.CASCADE, related_name='batch_allocation',
    )
    machine = models.ForeignKey(
        DyeingMachine, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='allocations',
    )
    allocated_at = models.DateTimeField(auto_now_add=True)
    is_allocated = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Batch Allocation'
        verbose_name_plural = 'Batch Allocations'

    def __str__(self):
        return f"{self.order.order_id} - {self.machine.machine_capacity if self.machine else 'Unallocated'}"


class BatchAllocationDetail(models.Model):
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name='batch_details',
    )

    # ✅ FIX: batch_id is unique PER ORDER, not globally
    batch_id = models.CharField(max_length=20)  # e.g., B-1, B-2

    machine = models.ForeignKey(
        DyeingMachine, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='batch_details',
    )
    allocated_qty = models.FloatField(default=0)
    batch_time_hours = models.FloatField(default=0)
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)

    STATUS_CHOICES = [
        ('planned', 'Planned'),
        ('running', 'Running'),
        ('completed', 'Completed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='planned')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'batch_id']
        # ✅ FIX: uniqueness is enforced at (order, batch_id) level
        unique_together = ['order', 'batch_id']
        verbose_name = 'Batch Allocation Detail'
        verbose_name_plural = 'Batch Allocation Details'

    def __str__(self):
        return f"{self.order.order_id} - {self.batch_id} - {self.allocated_qty}kg"


# ================================ Batch Process Tracker ================================ #

class BatchProcess(models.Model):
    BATCH_STEPS = [
        ('Store', 'Store'),
        ('Soft winding', 'Soft winding'),
        ('Dyeing', 'Dyeing'),
        ('Hydro', 'Hydro'),
        ('Dryer', 'Dryer'),
        ('Quality check', 'Quality check'),
        ('Finishing', 'Finishing'),
        ('Packing', 'Packing'),
        ('Store (Final)', 'Store (Final)'),
        ('Delivery', 'Delivery'),
        ('Completed', 'Completed'),
    ]

    allocation = models.OneToOneField(
        BatchAllocationDetail, on_delete=models.CASCADE, related_name='process_tracker',
    )
    current_step = models.CharField(max_length=50, choices=BATCH_STEPS, default='Store')
    completed_steps = models.JSONField(default=list, blank=True)
    step_timestamps = models.JSONField(default=dict, blank=True)
    comment = models.TextField(blank=True, null=True)
    delivery_issue = models.JSONField(default=dict, blank=True, null=True)

    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)

    is_rejection_reallocated = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Batch Process'
        verbose_name_plural = 'Batch Processes'

    def __str__(self):
        return f"{self.allocation.batch_id} - {self.current_step}"


class BatchStepComment(models.Model):
    allocation = models.ForeignKey(
        BatchAllocationDetail, on_delete=models.CASCADE, related_name='step_comments',
    )
    step_name = models.CharField(max_length=100)
    comment = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['allocation', 'step_name']
        ordering = ['step_name']
        verbose_name = 'Batch Step Comment'
        verbose_name_plural = 'Batch Step Comments'

    def __str__(self):
        return f"{self.allocation.batch_id} - {self.step_name}"


class StepComment(models.Model):
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name='step_comments',
    )
    step_name = models.CharField(max_length=100)
    comment = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['order', 'step_name']
        verbose_name = 'Step Comment'
        verbose_name_plural = 'Step Comments'

    def __str__(self):
        return f"{self.order.order_id} - {self.step_name}"


class Rejection(models.Model):
    batch_process = models.ForeignKey(
        BatchProcess, on_delete=models.CASCADE, related_name='rejections',
    )
    step = models.CharField(max_length=100)
    reason = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Rejection'
        verbose_name_plural = 'Rejections'

    def __str__(self):
        return f"{self.batch_process.allocation.batch_id} - {self.step}"

#====================================Parameter and settings models =========================================#
# models.py

# ============================================================
# Parameter Management Models
# ============================================================

class ParameterFolder(models.Model):
    """Parameter folder — user nije create korbe."""
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    description = models.CharField(max_length=300, blank=True, null=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'name']
        verbose_name = 'Parameter Folder'
        verbose_name_plural = 'Parameter Folders'

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            base_slug = slugify(self.name) or 'folder'
            slug = base_slug
            counter = 1
            while ParameterFolder.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)


class Parameter(models.Model):
    """Parameter — folder er moddhe thake."""
    TYPE_CHOICES = [
        ('text', 'Text'),
        ('number', 'Number'),
        ('select', 'Select'),
        ('boolean', 'Boolean'),
    ]

    folder = models.ForeignKey(
        ParameterFolder,
        on_delete=models.CASCADE,
        related_name='parameters',
    )
    name = models.CharField(max_length=100)
    key = models.CharField(max_length=100)
    value = models.CharField(max_length=300, blank=True, null=True)
    param_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='text')
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'name']
        unique_together = ['folder', 'key']
        verbose_name = 'Parameter'
        verbose_name_plural = 'Parameters'

    def __str__(self):
        return f"{self.folder.name} → {self.name}"

#==============================MAnage steps models ===========================#
# ============================================================
# Manage Model — Steps
# ============================================================

class ManageStep(models.Model):
    """
    Manage Step — user nije create korbe.
    Step name + initial time + break time (after this step).
    """
    name = models.CharField(max_length=100)
    initial_time = models.FloatField(
        default=0,
        help_text='Initial time in hours',
    )
    break_time = models.FloatField(
        default=0,
        help_text='Break time (hours) after this step, before next step',
    )
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'id']
        verbose_name = 'Manage Step'
        verbose_name_plural = 'Manage Steps'

    def __str__(self):
        return f"{self.name} ({self.initial_time}h + {self.break_time}h break)"

class OrderStepTracker(models.Model):
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name='step_trackers'
    )
    step = models.ForeignKey(
        ManageStep, on_delete=models.CASCADE, related_name='order_trackers'
    )
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    comment = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['order', 'step']
        ordering = ['step__display_order', 'step__id']
        verbose_name = 'Order Step Tracker'
        verbose_name_plural = 'Order Step Trackers'

    def __str__(self):
        return f"{self.order.order_id} → {self.step.name}"
