from datetime import datetime, timezone

from fastapi import APIRouter, status

from app.schemas.classification import (
    SLATargetBreakdown,
    TicketClassificationRequest,
    TicketClassificationResponse,
)
from app.services.classification import (
    ClassificationResult,
    SLA_TARGETS,
    classify_incident,
)

router = APIRouter(tags=["Classification"])

def _build_classification_rationale(
    *,
    requested_priority: str,
    result: ClassificationResult,
    response_minutes: int,
    resolution_hours: int,
    ) -> str:
    """Constructs a clear, auditable summary explaining the triage engine's decision."""
    priority_note = (
        f"Escalated priority from '{requested_priority}' to '{result.effective_priority}'"
        if result.escalated
        else f"Maintained priority at '{result.effective_priority}'"
    )
    rules_note = (
        ", ".join(result.matched_rules)
        if result.matched_rules
        else "default category mapping"
    )
    return (
        f"{priority_note} and assigned to '{result.assigned_team_name}' "
        f"(category: '{result.effective_category}') based on [{rules_note}]. "
        f"Applied {response_minutes}m response / {resolution_hours}h resolution SLA."
    )


@router.post(
    "/classify",
    response_model=TicketClassificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Classify ticket priority, team assignment, SLA targets, and triage rationale",
    description=(
        "Evaluates an incoming support ticket against the Impact × Urgency matrix, "
        "domain keyword rules, and NLP urgency/blast-radius heuristics to return "
        "the computed priority, target support team, SLA deadlines, and rationale."
    ),
)
async def classify_ticket(
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

    rationale = _build_classification_rationale(
        requested_priority=payload.requested_priority.value,
        result=result,
        response_minutes=response_minutes,
        resolution_hours=resolution_hours,
    )

    return TicketClassificationResponse(
        ticket_id=payload.ticket_id,
        requested_category=payload.category,
        effective_category=result.effective_category,
        requested_priority=payload.requested_priority,
        effective_priority=result.effective_priority,
        assigned_team_name=result.assigned_team_name,
        escalated=result.escalated,
        rationale=rationale,
        matched_rules=result.matched_rules,
        sla=SLATargetBreakdown(
            response_target_minutes=response_minutes,
            resolution_target_hours=resolution_hours,
            response_due_at=result.sla_response_due_at,
            resolution_due_at=result.sla_due_at,
        ),
    )