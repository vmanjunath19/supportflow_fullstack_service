import hmac
import os
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/webhooks", tags=["Webhooks"])

WEBHOOK_SECRET = os.getenv(
    "TICKET_CREATED_WEBHOOK_SECRET", "sf_whsec_change_me_in_production"
)

# In-memory idempotency cache (replace with Redis or DB lookup in multi-worker prod)
_processed_event_ids: set[str] = set()


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


@router.post("/ticket-created", status_code=status.HTTP_200_OK)
async def handle_ticket_created_webhook(
    payload: TicketCreatedWebhookPayload,
    x_webhook_secret: str = Header(default=""),
    x_webhook_event_id: str = Header(default=""),
) -> dict[str, Any]:
    # 1. Verify shared secret using constant-time comparison
    if not hmac.compare_digest(x_webhook_secret, WEBHOOK_SECRET):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    # 2. Enforce idempotency on event_id
    dedupe_key = x_webhook_event_id or str(payload.event_id)
    if dedupe_key in _processed_event_ids:
        return {
            "status": "duplicate_ignored",
            "event_id": dedupe_key,
            "ticket_number": payload.record.ticket_number,
        }

    _processed_event_ids.add(dedupe_key)

    # 3. Execute downstream workflow automation (auto-routing / Slack / email triage)
    # IMPORTANT: Only perform UPDATEs on public.tickets or INSERTs into ticket_events—never INSERT into tickets.
    return {
        "status": "processed",
        "event_id": dedupe_key,
        "ticket_id": str(payload.record.id),
        "ticket_number": payload.record.ticket_number,
        "category": payload.record.category,
        "priority": payload.record.priority,
    }