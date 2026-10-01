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
]