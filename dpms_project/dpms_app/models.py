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
        # Auto-generate order_id for new orders
        if not self.order_id:
            last = Order.objects.order_by('-id').first()
            next_num = 101 if not last else (last.id + 101)
            self.order_id = f"ORD-{next_num}"

        # ✅ Auto-set status to 'Inactive' ONLY when:
        #    1. Creating a NEW order (self._state.adding == True)
        #    2. AND approval is 'no'
        # Ei karone edit korar somoy status force hoye 'Inactive' hobe na
        if self._state.adding and self.approval == 'no':
            self.status = 'Inactive'

        super().save(*args, **kwargs)

#================================Machine models=======================================#
class DyeingMachine(models.Model):
    """
    Dyeing Machine details — EAL (or other company) er machine info।
    Screenshot onujayi sob column.
    """
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
    cone = models.FloatField(
        default=0,
        help_text='Cone value (kg)',
    )
    knit_sweater_min = models.FloatField(
        default=0,
        help_text='Knit Sweater Yarn Min (kg)',
    )
    knit_sweater_max = models.FloatField(
        default=0,
        help_text='Knit Sweater Yarn Max (kg)',
    )
    knit_yarn_min = models.FloatField(
        default=0,
        help_text='Knit Yarn Min (kg)',
    )
    knit_yarn_max = models.FloatField(
        default=0,
        help_text='Knit Yarn Max (kg)',
    )

    # Meta
    display_order = models.PositiveIntegerField(
        default=0,
        help_text='Order e dekhate (choto number age)',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'id']
        verbose_name = 'Dyeing Machine'
        verbose_name_plural = 'Dyeing Machines'

    def __str__(self):
        return f"{self.company} - {self.machine_capacity}"
