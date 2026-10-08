from django.apps import AppConfig


class DpmsAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'dpms_app'

    def ready(self):
        import dpms_app.signals  # noqa