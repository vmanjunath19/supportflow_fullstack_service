from datetime import datetime, timezone

from fastapi import APIRouter, status

from app.schemas.classification import (
    SLATargetBreakdown,
    TicketClassificationRequest,
    TicketClassificationResponse,
)
from app.services.classification import SLA_TARGETS, classify_incident

router = APIRouter(tags=["Classification"])


@router.post(
    "/classify",
    response_model=TicketClassificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Classify incident severity, team assignment, and SLA targets",
)
async def classify_ticket_endpoint(
    payload: TicketClassificationRequest,
) -> TicketClassificationResponse:
    now = datetime.now(timezone.utc)
    result = classify_incident(
        title=payload.title,
        description=payload.description,
        category=payload.category.value,
        requested_priority=payload.requested_priority.value,
        impact=payload.impact.value if payload.impact else None,
        urgency=payload.urgency.value if payload.urgency else None,
        now=now,
    )

    sla_cfg = SLA_TARGETS[result.effective_priority]
    response_minutes = int(sla_cfg["response"].total_seconds() // 60)
    resolution_hours = int(sla_cfg["resolution"].total_seconds() // 3600)

    return TicketClassificationResponse(
        ticket_id=payload.ticket_id,
        requested_category=payload.category,
        effective_category=result.effective_category,
        requested_priority=payload.requested_priority,
        effective_priority=result.effective_priority,
        assigned_team_name=result.assigned_team_name,
        escalated=result.escalated,
        matched_rules=result.matched_rules,
        sla=SLATargetBreakdown(
            response_target_minutes=response_minutes,
            resolution_target_hours=resolution_hours,
            response_due_at=result.sla_response_due_at,
            resolution_due_at=result.sla_due_at,
        ),
    )