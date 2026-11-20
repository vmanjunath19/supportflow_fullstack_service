import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

logger = logging.getLogger("supportflow.audit")


class AutomatedActor(str, Enum):
    ROUTING_ENGINE = "system:rule_routing_engine"
    SLA_WORKER = "system:sla_escalation_worker"
    NOTIFICATION_WORKER = "system:notification_worker"


class AutomatedEventType(str, Enum):
    AUTO_ROUTED = "AUTO_ROUTED"
    STATUS_TRANSITIONED = "STATUS_TRANSITIONED"
    SLA_WARNING_NEAR_BREACH = "SLA_WARNING_NEAR_BREACH"
    SLA_BREACHED_ESCALATED = "SLA_BREACHED_ESCALATED"
    NOTIFICATION_DISPATCHED = "NOTIFICATION_DISPATCHED"


@dataclass(frozen=True)
class AuditEventRecord:
    ticket_id: str
    actor: str
    event_type: str
    previous_state: Optional[str]
    new_state: Optional[str]
    metadata: dict[str, Any]
    created_at: str

    def to_insert_dict(self) -> dict[str, Any]:
        return {
            "ticket_id": self.ticket_id,
            "actor": self.actor,
            "event_type": self.event_type,
            "previous_state": self.previous_state,
            "new_state": self.new_state,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }


def build_audit_event(
    *,
    ticket_id: UUID | str,
    actor: AutomatedActor | str,
    event_type: AutomatedEventType | str,
    previous_state: Optional[str] = None,
    new_state: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    occurred_at: Optional[datetime] = None,
) -> AuditEventRecord:
    """Constructs a validated, UTC-timestamped immutable audit event record."""
    actor_str = actor.value if isinstance(actor, AutomatedActor) else str(actor).strip()
    event_str = event_type.value if isinstance(event_type, AutomatedEventType) else str(event_type).strip()

    if not actor_str:
        raise ValueError("Audit event requires a non-empty actor.")
    if not event_str:
        raise ValueError("Audit event requires a non-empty event_type.")

    ts = occurred_at or datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)

    enriched_metadata = {
        **(metadata or {}),
        "immutable": True,
        "recorded_at_utc": ts.isoformat(),
    }

    return AuditEventRecord(
        ticket_id=str(ticket_id),
        actor=actor_str,
        event_type=event_str,
        previous_state=previous_state,
        new_state=new_state,
        metadata=enriched_metadata,
        created_at=ts.isoformat(),
    )


def record_audit_event(
    supabase: Any,
    *,
    ticket_id: UUID | str,
    actor: AutomatedActor | str,
    event_type: AutomatedEventType | str,
    previous_state: Optional[str] = None,
    new_state: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    occurred_at: Optional[datetime] = None,
) -> dict[str, Any]:
    """
    Appends an immutable audit record into `public.ticket_events`.
    Never updates or deletes existing audit history.
    """
    record = build_audit_event(
        ticket_id=ticket_id,
        actor=actor,
        event_type=event_type,
        previous_state=previous_state,
        new_state=new_state,
        metadata=metadata,
        occurred_at=occurred_at,
    )
    payload = record.to_insert_dict()

    if supabase is None:
        logger.debug("Supabase client not provided; returning dry-run audit payload: %s", payload)
        return payload

    resp = supabase.table("ticket_events").insert(payload).execute()
    inserted = (resp.data or [payload])[0]
    logger.info(
        "Audit logged | ticket=%s | event=%s | actor=%s | %s -> %s",
        record.ticket_id,
        record.event_type,
        record.actor,
        record.previous_state,
        record.new_state,
    )
    return inserted