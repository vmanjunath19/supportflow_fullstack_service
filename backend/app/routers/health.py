from fastapi import APIRouter, Request
from app.schemas.health import HealthCheckResponse
from app.services.health_service import get_service_health
import os
from datetime import datetime, timezone

router = APIRouter(tags=["Health"])

SERVICE_NAME = "supportflow-automation-service"
SERVICE_VERSION = "0.1.0"


async def health_check() -> HealthCheckResponse:
    return get_service_health(service_name=SERVICE_NAME, version=SERVICE_VERSION)


SLA_POLL_INTERVAL_SECONDS = int(os.getenv("SLA_POLL_INTERVAL_SECONDS", "60"))
RETRY_POLL_INTERVAL_SECONDS = int(os.getenv("RETRY_POLL_INTERVAL_SECONDS", "30"))


@router.get("/health")
async def health_check(request: Request):
    scheduler = getattr(request.app.state, "scheduler", None)
    return {
        "status": "ok",
        "service": request.app.title,
        "version": request.app.version,
        "sla_worker_running": bool(scheduler and scheduler.running),
        "sla_poll_interval_seconds": SLA_POLL_INTERVAL_SECONDS,
        "retry_poll_interval_seconds": RETRY_POLL_INTERVAL_SECONDS,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }