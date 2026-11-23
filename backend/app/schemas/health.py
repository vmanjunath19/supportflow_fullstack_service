from datetime import datetime
from pydantic import BaseModel, Field


class HealthCheckResponse(BaseModel):
    status: str = Field(default="ok", examples=["ok"])
    service: str = Field(default="supportflow-automation-service")
    version: str = Field(default="0.1.0")
    timestamp_utc: datetime