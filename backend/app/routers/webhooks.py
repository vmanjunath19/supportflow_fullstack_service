import hmac
import os
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status
from pydantic import BaseModel
from supabase import Client, create_client

from app.services.notifications import (
    build_notification_payload,
    dispatch_routing_notifications,
)
from app.services.audit import (
    AutomatedActor,
    AutomatedEventType,
    record_audit_event,
)

from app.services.state_machine import (
    IllegalStateTransitionError,
    validate_ticket_transition,
)

from app.services.routing import evaluate_routing_rule

router = APIRouter(prefix="/api/v1/webhooks", tags=["Webhooks"])

WEBHOOK_SECRET = os.getenv(
    "TICKET_CREATED_WEBHOOK_SECRET", "sf_whsec_change_me_in_production"
)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_processed_event_ids: set[str] = set()


def get_supabase_admin() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend environment."
        )
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


class TicketRecordPayload(BaseModel):
    id: UUID
    ticket_number: int
    title: str
    description: str
    category: str
    priority: str
    status: str
    requester_email: str
    team_id: Optional[UUID] = None
    sla_due_at: Optional[datetime] = None
    created_at: datetime


class TicketCreatedWebhookPayload(BaseModel):
    event_id: UUID
    event_type: str
    occurred_at: datetime
    record: TicketRecordPayload


class TestNotificationRequest(BaseModel):
    ticket_id: Optional[UUID] = None
    ticket_number: int = 1099
    priority: str = "Urgent"
    category: str = "Network"
    summary: str = "Core VPN gateway packet loss in Edinburgh office"
    description: str = "Intermittent packet loss exceeding 18% across primary IPsec tunnel."
    assigned_team: str = "Network Operations"
    escalation_email: str = "netops-oncall@supportflow.local"
    requester_email: str = "alex.mercer@company.com"

class TicketTransitionRequest(BaseModel):
    target_status: str
    actor: str = "agent:workspace_ui"


@router.post("/ticket-created", status_code=status.HTTP_200_OK)
async def handle_ticket_created_webhook(
    payload: TicketCreatedWebhookPayload,
    background_tasks: BackgroundTasks,
    x_webhook_secret: str = Header(default=""),
    x_webhook_event_id: str = Header(default=""),
) -> dict[str, Any]:
    # 1. Constant-time signature verification
    if not hmac.compare_digest(x_webhook_secret, WEBHOOK_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    # 2. Idempotency check
    dedupe_key = x_webhook_event_id or str(payload.event_id)
    if dedupe_key in _processed_event_ids:
        return {
            "status": "duplicate_ignored",
            "event_id": dedupe_key,
            "ticket_number": payload.record.ticket_number,
        }

    # Skip auto-routing if the ticket was already explicitly assigned on creation
    if payload.record.team_id is not None:
        _processed_event_ids.add(dedupe_key)
        return {
            "status": "skipped_already_assigned",
            "event_id": dedupe_key,
            "ticket_id": str(payload.record.id),
        }

    supabase = get_supabase_admin()

    # 3. Load active support teams from Supabase
    teams_resp = (
        supabase.table("support_teams")
        .select("id, name, default_category, escalation_email, is_active")
        .eq("is_active", True)
        .execute()
    )

    # 4. Evaluate rule-based routing engine
    decision = evaluate_routing_rule(
        category=payload.record.category,
        priority=payload.record.priority,
        teams=teams_resp.data or [],
    )

    if decision.team_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No support teams configured in database for routing.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    next_status = "Triaged" if payload.record.status == "New" else payload.record.status

    # 5. Update ticket assignment & status (UPDATE only -> zero INSERT trigger loops)
    supabase.table("tickets").update(
        {
            "team_id": str(decision.team_id),
            "status": next_status,
            "updated_at": now_iso,
        }
    ).eq("id", str(payload.record.id)).execute()

    # 6. Record immutable AUTO_ROUTED audit event
    record_audit_event(
        supabase,
        ticket_id=payload.record.id,
        actor=AutomatedActor.ROUTING_ENGINE,
        event_type=AutomatedEventType.AUTO_ROUTED,
        previous_state="Unassigned",
        new_state=decision.target_team_name,
        metadata={
            "matched_rule": decision.matched_rule,
            "is_fallback": decision.is_fallback,
            "escalation_applied": decision.escalation_applied,
            "priority": payload.record.priority,
            "category": payload.record.category,
        },
    )

    # 7. Record automated status transition (New -> Triaged) if status changed
    if next_status != payload.record.status:
        record_audit_event(
            supabase,
            ticket_id=payload.record.id,
            actor=AutomatedActor.ROUTING_ENGINE,
            event_type=AutomatedEventType.STATUS_TRANSITIONED,
            previous_state=payload.record.status,
            new_state=next_status,
            metadata={"trigger": "auto_routing_completion"},
        )

    # 8. Build & queue non-blocking Slack + Email team alert
    notification_payload = build_notification_payload(
        ticket_id=payload.record.id,
        ticket_number=payload.record.ticket_number,
        priority=payload.record.priority,
        category=payload.record.category,
        title=payload.record.title,
        description=payload.record.description,
        assigned_team=decision.target_team_name,
        escalation_email=decision.escalation_email,
        requester_email=payload.record.requester_email,
        matched_rule=decision.matched_rule,
        escalation_applied=decision.escalation_applied,
    )
    background_tasks.add_task(
        dispatch_routing_notifications,
        notification_payload,
        supabase,
    )

    _processed_event_ids.add(dedupe_key)

    return {
        "status": "routed",
        "event_id": dedupe_key,
        "ticket_id": str(payload.record.id),
        "ticket_number": payload.record.ticket_number,
        "assigned_team": decision.target_team_name,
        "matched_rule": decision.matched_rule,
        "notification_queued": True,
        "workspace_link": notification_payload.workspace_link,
    }


@router.post("/test-notification", status_code=status.HTTP_200_OK)
async def trigger_test_notification(
    req: TestNotificationRequest,
) -> dict[str, Any]:
    """Dispatches a test Slack/Email notification and returns the exact payload for inspection."""
    tid = req.ticket_id or uuid4()
    notification_payload = build_notification_payload(
        ticket_id=tid,
        ticket_number=req.ticket_number,
        priority=req.priority,
        category=req.category,
        title=req.summary,
        description=req.description,
        assigned_team=req.assigned_team,
        escalation_email=req.escalation_email,
        requester_email=req.requester_email,
        matched_rule="manual_test_trigger",
    )
    dispatch_result = await dispatch_routing_notifications(notification_payload)
    return {
        "status": "dispatched",
        "payload": notification_payload.to_dict(),
        "delivery": dispatch_result,
    }

@router.get("/tickets/{ticket_id}/audit-events", status_code=status.HTTP_200_OK)
async def get_ticket_audit_events(ticket_id: UUID) -> dict[str, Any]:
    """Returns the chronological, append-only audit history for a ticket."""
    supabase = get_supabase_admin()
    resp = (
        supabase.table("ticket_events")
        .select("id, ticket_id, actor, event_type, previous_state, new_state, metadata, created_at")
        .eq("ticket_id", str(ticket_id))
        .order("created_at", desc=False)
        .execute()
    )
    events = resp.data or []
    return {
        "ticket_id": str(ticket_id),
        "event_count": len(events),
        "events": events,
    }


@router.post("/tickets/{ticket_id}/transition", status_code=status.HTTP_200_OK)
async def transition_ticket_status(
    ticket_id: UUID,
    req: TicketTransitionRequest,
) -> dict[str, Any]:
    """Validates and executes a state machine transition, recording an immutable audit event."""
    supabase = get_supabase_admin()

    ticket_resp = (
        supabase.table("tickets")
        .select("id, ticket_number, status, team_id")
        .eq("id", str(ticket_id))
        .single()
        .execute()
    )
    ticket = ticket_resp.data
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found.")

    current_status = ticket["status"]
    try:
        validate_ticket_transition(
            current_status=current_status,
            target_status=req.target_status,
            team_id=ticket.get("team_id"),
        )
    except (IllegalStateTransitionError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    if current_status == req.target_status:
        return {
            "status": "unchanged",
            "ticket_id": str(ticket_id),
            "current_status": current_status,
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    supabase.table("tickets").update(
        {"status": req.target_status, "updated_at": now_iso}
    ).eq("id", str(ticket_id)).execute()

    record_audit_event(
        supabase,
        ticket_id=ticket_id,
        actor=req.actor,
        event_type=AutomatedEventType.STATUS_TRANSITIONED,
        previous_state=current_status,
        new_state=req.target_status,
        metadata={"validated_by": "state_machine_guard"},
    )

    return {
        "status": "transitioned",
        "ticket_id": str(ticket_id),
        "previous_status": current_status,
        "new_status": req.target_status,
    }