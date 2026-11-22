from datetime import datetime, timezone
from app.schemas.health import HealthCheckResponse


def get_service_health(service_name: str, version: str) -> HealthCheckResponse:
    """Constructs the structured health status payload for liveness/readiness probes."""
    return HealthCheckResponse(
        status="ok",
        service=service_name,
        version=version,
        timestamp_utc=datetime.now(timezone.utc),
    )