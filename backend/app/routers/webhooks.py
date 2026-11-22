import hmac
import os
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status
from pydantic import BaseModel
from supabase import Client, create_client
from app.services.classification import classify_incident

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

from app.schemas.classification import (
    ImpactLevel,
    TicketCategory,
    TicketPriority,
    UrgencyLevel,
)

from app.services.routing import evaluate_routing_rule

router = APIRouter(prefix="/api/v1/webhooks", tags=["Webhooks"])

WEBHOOK_SECRET = os.getenv("TICKET_CREATED_WEBHOOK_SECRET", "sf_whsec_change_me_in_production")
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

    # Normalize Enum or str fields from the validated Pydantic record
    raw_category = (
        payload.record.category.value
        if hasattr(payload.record.category, "value")
        else str(payload.record.category)
    )
    raw_priority = (
        payload.record.priority.value
        if hasattr(payload.record.priority, "value")
        else str(payload.record.priority)
    )
    raw_status = (
        payload.record.status.value
        if hasattr(payload.record.status, "value")
        else str(payload.record.status)
    )
    raw_impact = getattr(payload.record, "impact", None)
    raw_impact = raw_impact.value if hasattr(raw_impact, "value") else raw_impact

    raw_urgency = getattr(payload.record, "urgency", None)
    raw_urgency = raw_urgency.value if hasattr(raw_urgency, "value") else raw_urgency

    supabase = get_supabase_admin()

    # 3. Load active support teams from Supabase
    teams_resp = (
        supabase.table("support_teams")
        .select("id, name, default_category, escalation_email, is_active")
        .eq("is_active", True)
        .execute()
    )
    active_teams = teams_resp.data or []

    # 4. Run incident classification (keyword signals + Impact x Urgency + SLA target)
    classification = classify_incident(
        title=payload.record.title,
        description=payload.record.description,
        category=raw_category,
        requested_priority=raw_priority,
        impact=raw_impact,
        urgency=raw_urgency,
    )

    # 5. Evaluate rule-based routing engine using classified category & priority
    decision = evaluate_routing_rule(
        category=classification.effective_category,
        priority=classification.effective_priority,
        teams=active_teams,
    )

    # Apply explicit keyword team override (e.g., KW-02 payment down -> Cloud & DevOps)
    matched_team_record = next(
        (t for t in active_teams if t["name"] == classification.assigned_team_name),
        None,
    )
    target_team_id = (
        matched_team_record["id"] if matched_team_record else decision.team_id
    )
    target_team_name = (
        matched_team_record["name"]
        if matched_team_record
        else decision.target_team_name
    )
    target_escalation_email = (
        matched_team_record["escalation_email"]
        if matched_team_record
        else decision.escalation_email
    )
    combined_rule = (
        f"{decision.matched_rule} | rules={','.join(classification.matched_rules)}"
        if classification.matched_rules
        else decision.matched_rule
    )
    escalation_applied = decision.escalation_applied or classification.escalated

    if target_team_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No support teams configured in database for routing.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    next_status = "Triaged" if raw_status == "New" else raw_status

    raw_sla = getattr(payload.record, "sla_due_at", None)
    if isinstance(raw_sla, datetime):
        effective_sla_due_at = raw_sla.isoformat()
    elif isinstance(raw_sla, str) and raw_sla.strip():
        effective_sla_due_at = raw_sla
    else:
        effective_sla_due_at = classification.sla_due_at.isoformat()

    # 6. Validate state transition & relational team invariant before DB update
    try:
        validate_ticket_transition(
            current_status=raw_status,
            target_status=next_status,
            team_id=str(target_team_id),
        )
    except (IllegalStateTransitionError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    # 7. Update ticket assignment, classified priority/category, SLA & status
    supabase.table("tickets").update(
        {
            "team_id": str(target_team_id),
            "category": classification.effective_category,
            "priority": classification.effective_priority,
            "status": next_status,
            "sla_due_at": effective_sla_due_at,
            "updated_at": now_iso,
        }
    ).eq("id", str(payload.record.id)).execute()

    # 8. Record immutable AUTO_ROUTED audit event
    record_audit_event(
        supabase,
        ticket_id=payload.record.id,
        actor=AutomatedActor.ROUTING_ENGINE,
        event_type=AutomatedEventType.AUTO_ROUTED,
        previous_state="Unassigned",
        new_state=target_team_name,
        metadata={
            "matched_rule": combined_rule,
            "is_fallback": decision.is_fallback,
            "escalation_applied": escalation_applied,
            "requested_priority": raw_priority,
            "effective_priority": classification.effective_priority,
            "effective_category": classification.effective_category,
            "sla_due_at": effective_sla_due_at,
        },
    )

    # 9. Record automated priority escalation if keyword/matrix rules elevated priority
    if classification.effective_priority != raw_priority:
        record_audit_event(
            supabase,
            ticket_id=payload.record.id,
            actor=AutomatedActor.ROUTING_ENGINE,
            event_type=AutomatedEventType.SLA_BREACH_ESCALATED,
            previous_state=raw_priority,
            new_state=classification.effective_priority,
            metadata={
                "trigger": "incident_classification_rules",
                "matched_rules": classification.matched_rules,
            },
        )

    # 10. Record automated status transition (New -> Triaged) if status changed
    if next_status != raw_status:
        record_audit_event(
            supabase,
            ticket_id=payload.record.id,
            actor=AutomatedActor.ROUTING_ENGINE,
            event_type=AutomatedEventType.STATUS_TRANSITIONED,
            previous_state=raw_status,
            new_state=next_status,
            metadata={"trigger": "auto_routing_completion"},
        )

    # 11. Build & queue non-blocking Slack + Email team alert
    notification_payload = build_notification_payload(
        ticket_id=payload.record.id,
        ticket_number=payload.record.ticket_number,
        priority=classification.effective_priority,
        category=classification.effective_category,
        title=payload.record.title,
        description=payload.record.description,
        assigned_team=target_team_name,
        escalation_email=target_escalation_email,
        requester_email=str(payload.record.requester_email),
        matched_rule=combined_rule,
        escalation_applied=escalation_applied,
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
        "assigned_team": target_team_name,
        "effective_priority": classification.effective_priority,
        "effective_category": classification.effective_category,
        "sla_due_at": effective_sla_due_at,
        "matched_rule": combined_rule,
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