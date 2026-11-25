from datetime import datetime
from enum import Enum
from typing import Any
from typing import Annotated
from uuid import UUID
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from typing import Any


class TicketStatus(str, Enum):
    NEW = "New"
    TRIAGED = "Triaged"
    IN_PROGRESS = "In Progress"
    BLOCKED = "Blocked"
    RESOLVED = "Resolved"
    CLOSED = "Closed"
    
class TicketCategory(str, Enum):
    SOFTWARE = "Software"
    HARDWARE = "Hardware"
    NETWORK = "Network"
    ACCESS_IAM = "Access & IAM"
    DATABASE_CLOUD = "Database & Cloud"
    OTHER = "Other"

class TicketPriority(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    URGENT = "Urgent"
    
class Ticket(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: UUID
    ticket_number: int
    title: str
    description: str
    category: TicketCategory
    priority: TicketPriority
    status: TicketStatus
    requester_email: EmailStr
    team_id: UUID | None = None
    sla_policy_id: UUID | None = None
    resolution_notes: str | None = None
    sla_due_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None

class TicketAuditEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: UUID
    ticket_id: UUID
    event_type: str
    actor: str | None = None
    previous_state: str | dict[str, Any] | None = None
    new_state: str | dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    idempotency_key: str | None = None
    created_at: datetime

class TicketSlaDetails(BaseModel):
    sla_due_at: datetime | None = None
    is_breached: bool = False
    remaining_seconds: int | None = Field(
        default=None,
        description="Seconds until SLA breach (negative if breached, null if no SLA due date or ticket is closed/resolved)",
        
    )

class TicketDetailResponse(BaseModel):
    ticket: Ticket
    sla: TicketSlaDetails
    audit_events: list[TicketAuditEvent] = Field(default_factory=list)


class ImpactLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class UrgencyLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


# Reusable trimmed string constraint
NonBlankTitle = Annotated[str, Field(min_length=3, max_length=200, description="Concise summary of the incident")]
NonBlankDescription = Annotated[str, Field(min_length=5, max_length=5000, description="Detailed problem description")]


class TicketCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: NonBlankTitle
    description: NonBlankDescription
    category: TicketCategory = TicketCategory.OTHER
    priority: TicketPriority = TicketPriority.MEDIUM
    requester_email: EmailStr
    impact: ImpactLevel | None = None
    urgency: UrgencyLevel | None = None
    team_id: UUID | None = None

    @field_validator("title", "description")
    @classmethod
    def reject_blank_whitespace(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Field cannot be blank or whitespace only")
        return value.strip()


class TicketUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: TicketStatus | None = None
    team_id: UUID | None = None
    resolution_notes: str | None = Field(default=None, max_length=5000)
    actor: str | None = Field(default="agent@supportflow.local", max_length=150)

    @field_validator("resolution_notes")
    @classmethod
    def reject_blank_notes(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("resolution_notes cannot be blank or whitespace only")
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def validate_update_payload(self) -> "TicketUpdate":
        updatable = {"status", "team_id", "resolution_notes"}
        if not (self.model_fields_set & updatable):
            raise ValueError("At least one of status, team_id, or resolution_notes must be provided")
        if (
            self.status in {TicketStatus.TRIAGED, TicketStatus.IN_PROGRESS}
            and "team_id" in self.model_fields_set
            and self.team_id is None
        ):
            raise ValueError("team_id cannot be null when transitioning to Triaged or In Progress")
        return self


class TicketFilter(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    category: TicketCategory | None = None
    team_id: UUID | None = None
    requester_email: EmailStr | None = None
    created_from: datetime | None = Field(
        default=None,
        description="Inclusive ISO-8601 lower bound on ticket created_at",
    )
    created_to: datetime | None = Field(
        default=None,
        description="Inclusive ISO-8601 upper bound on ticket created_at",
    )
    search: str | None = Field(default=None, min_length=2, max_length=100)
    sort_order: Literal["asc", "desc"] = "desc"
    limit: int = Field(default=25, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_date_range(self) -> "TicketFilter":
        if self.created_from and self.created_to and self.created_from > self.created_to:
            raise ValueError("created_from must be earlier than or equal to created_to")
        return self

class PaginationMeta(BaseModel):
    total: int
    limit: int
    offset: int
    count: int
    has_more: bool

class PaginatedTicketsResponse(BaseModel):
    items: list[Ticket]
    pagination: PaginationMeta