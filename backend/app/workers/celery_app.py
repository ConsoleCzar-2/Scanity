from celery import Celery
from app.core.config import settings

# Initialize Celery application
celery_app = Celery(
    "scanity_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

# Configure Celery serialization, timekeeping, and task tracking
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_default_queue="default",
    worker_prefetch_multiplier=1,  # Ensure fair task distribution among workers
    task_acks_late=True,          # Only ack task after successful completion
)

# Autodiscover tasks from the workers package
celery_app.autodiscover_tasks(["app.workers"])
