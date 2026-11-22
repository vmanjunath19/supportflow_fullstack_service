from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class TicketCategory(str, Enum):
    HARDWARE = "Hardware"
    SOFTWARE = "Software"
    NETWORK = "Network"
    ACCESS_IAM = "Access & IAM"
    DATABASE_CLOUD = "Database & Cloud"
    OTHER = "Other"


class TicketPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    URGENT = "Urgent"


class ImpactLevel(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class UrgencyLevel(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class TicketClassificationRequest(BaseModel):
    """
    Strict Pydantic v2 request schema for incident classification & SLA evaluation.
    Rejects unknown extra fields, empty/whitespace-only strings, and invalid enums
    with standard HTTP 422 Unprocessable Entity field validation errors.
    """

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    ticket_id: Optional[UUID] = Field(
        default=None,
        description="Optional UUID of an existing ticket being evaluated.",
    )
    title: str = Field(
        ...,
        min_length=3,
        max_length=255,
        description="Concise summary of the incident.",
        examples=["Production payment gateway returning 503 errors"],
    )
    description: str = Field(
        ...,
        min_length=5,
        max_length=10000,
        description="Detailed symptoms, scope, and error messages.",
        examples=["Checkout requests in EU region failing since 14:05 UTC."],
    )
    category: TicketCategory = Field(
        default=TicketCategory.OTHER,
        description="Initial functional category selected by the requester.",
    )
    requested_priority: TicketPriority = Field(
        default=TicketPriority.MEDIUM,
        description="Baseline priority requested at submission.",
    )
    impact: Optional[ImpactLevel] = Field(
        default=None,
        description="Optional business blast-radius dimension (High, Medium, Low).",
    )
    urgency: Optional[UrgencyLevel] = Field(
        default=None,
        description="Optional time-sensitivity dimension (High, Medium, Low).",
    )
    requester_email: Optional[EmailStr] = Field(
        default=None,
        description="Optional validated email address of the ticket submitter.",
    )

    @field_validator("title", "description")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Field must contain non-whitespace characters.")
        return value


class SLATargetBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    response_target_minutes: int = Field(..., ge=1)
    resolution_target_hours: int = Field(..., ge=1)
    response_due_at: datetime
    resolution_due_at: datetime


class TicketClassificationResponse(BaseModel):
    """
    Structured Pydantic v2 response returned by POST /api/v1/classify.
    """

    model_config = ConfigDict(extra="forbid")

    ticket_id: Optional[UUID] = None
    requested_category: TicketCategory
    effective_category: TicketCategory
    requested_priority: TicketPriority
    effective_priority: TicketPriority
    assigned_team_name: str
    escalated: bool
    rationale: str = Field(
        ...,
        description="Human-readable explanation of matched rules, heuristics, team routing, and SLA target.",
    )
    matched_rules: list[str] = Field(default_factory=list)
    sla: SLATargetBreakdown