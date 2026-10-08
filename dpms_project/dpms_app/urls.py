from django.urls import path
from . import views

app_name = 'dpms_app'

urlpatterns = [
    # Pages
    path('', views.dashboard, name='dashboard'),
    path('orders/', views.orders_page, name='orders'),

    #Machines
    
    path('machines/', views.machines_page, name='machines_page'),
    path('api/machines/create/', views.machine_create, name='machine_create'),
    path('api/machines/<int:machine_id>/update/', views.machine_update, name='machine_update'),
    path('api/machines/<int:machine_id>/delete/', views.machine_delete, name='machine_delete'),
    #path('planner/', views.planner, name='planner'),
    #path('schedule/', views.schedule, name='schedule'),
    #path('batches/', views.batches, name='batches'),
    #path('alerts/', views.alerts, name='alerts'),

    # Order AJAX endpoints
    
    path('api/orders/create/', views.order_create, name='order_create'),
    path('api/orders/<str:order_id>/update/', views.order_update, name='order_update'),
    path('api/orders/<str:order_id>/delete/', views.order_delete, name='order_delete'),
    path('orders/<str:order_id>/', views.order_detail_page, name='order_detail'),
    path('orders/<str:order_id>/update-qty/', views.order_update_qty, name='order_update_qty'),\
    path('current-order/', views.current_order_page, name='current_order'),
    path('current-order/<str:order_id>/', views.current_order_page, name='current_order_detail'),
    path('current-order/<str:order_id>/update-status/', views.current_order_update_status, name='current_order_update_status'),
    path('current-order/<str:order_id>/step/<int:step_id>/update/',views.order_step_update,name='order_step_update'),

    # Planner
    path('planner/', views.planner_page, name='planner'),
    path('api/planner/allocate/<str:order_id>/', views.allocate_machine, name='allocate_machine'),
    path('api/planner/generate/', views.generate_plan, name='generate_plan'),
    path('api/planner/list/', views.planner_list, name='planner_list'),           #
    path('api/planner/<str:plan_id>/delete/', views.delete_plan, name='delete_plan'),
    path('api/planner/<str:plan_id>/', views.plan_detail, name='plan_detail'),    
    path('api/batch-allocation/<str:order_id>/', views.batch_allocation_api, name='batch_allocation_api'),

    
    # ============================================================
    # Batch Process Tracker API
    # ============================================================
    path('batches/', views.batches_page, name='batches'),
    path('tracker/', views.tracker_page, name='tracker'),
    path('tracker/<str:batch_id>/', views.tracker_page, name='tracker_batch'),
    path('api/tracker/<str:batch_id>/advance/',views.tracker_advance_step, name='tracker_advance'),
    path('api/tracker/<str:batch_id>/reject/',views.tracker_reject_batch, name='tracker_reject'),
    path('api/tracker/<str:batch_id>/delivery-issue/',views.tracker_delivery_issue, name='tracker_delivery_issue'),
    path('api/tracker/<str:batch_id>/comment/',views.tracker_save_comment, name='tracker_save_comment'),
    path('api/tracker/allocation/<int:allocation_id>/step-comment/',views.tracker_save_batch_step_comment, name='tracker_save_batch_step_comment'),
    path('api/tracker/step-comment/',views.tracker_save_step_comment, name='tracker_save_step_comment'),
    path('api/batches/<str:batch_id>/reschedule/',views.batch_reschedule, name='batch_reschedule'),

    #========================================================Parameters and Settings===========================================#
    path('parameters/', views.parameters_page, name='parameters'),
    path('parameters/folder/create/', views.folder_create, name='folder_create'),
    path('parameters/folder/<int:folder_id>/update/', views.folder_update, name='folder_update'),
    path('parameters/folder/<int:folder_id>/delete/', views.folder_delete, name='folder_delete'),
    path('parameters/param/create/', views.parameter_create, name='parameter_create'),
    path('parameters/param/<int:param_id>/update/', views.parameter_update, name='parameter_update'),
    path('parameters/param/<int:param_id>/delete/', views.parameter_delete, name='parameter_delete'),
    path('manage/', views.manage_page, name='manage'),

    # Manage — Steps
    path('manage/', views.manage_page, name='manage'),
    path('manage/step/create/', views.step_create, name='step_create'),
    path('manage/step/<int:step_id>/update/', views.step_update, name='step_update'),
    path('manage/step/<int:step_id>/delete/', views.step_delete, name='step_delete'),
]