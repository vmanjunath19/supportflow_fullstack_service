import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Callable

logger = logging.getLogger("supportflow.triage")

FALLBACK_PRIORITY = "Medium"
FALLBACK_TEAM_NAME = "Triage Queue"
DEFAULT_CLASSIFIER_TIMEOUT_SECONDS = 3.0


@dataclass(frozen=True)
class ResilientTriageOutcome:
    effective_priority: str
    effective_category: str
    assigned_team_name: str
    escalated: bool
    matched_rules: list[str]
    sla_due_at: datetime
    sla_response_due_at: datetime
    fallback_applied: bool
    fallback_reason: str | None = None


async def evaluate_triage_with_fallback(
    *,
    classifier_fn: Callable[..., Any],
    title: str,
    description: str,
    category: str,
    requested_priority: str,
    impact: str | None = None,
    urgency: str | None = None,
    now: datetime | None = None,
    timeout_seconds: float = DEFAULT_CLASSIFIER_TIMEOUT_SECONDS,
) -> ResilientTriageOutcome:
    """
    Runs incident classification within a strict timeout.
    If the classifier times out or raises an unexpected error, falls back to:
      - Priority: 'Medium'
      - Team:     'Triage Queue'
      - SLA:      2h response / 24h resolution (standard Medium SLA)
    """
    eval_time = now or datetime.now(timezone.utc)

    try:
        raw_result = await asyncio.wait_for(
            asyncio.to_thread(
                classifier_fn,
                title=title,
                description=description,
                category=category,
                requested_priority=requested_priority,
                impact=impact,
                urgency=urgency,
                now=eval_time,
            ),
            timeout=timeout_seconds,
        )
        return ResilientTriageOutcome(
            effective_priority=raw_result.effective_priority,
            effective_category=raw_result.effective_category,
            assigned_team_name=raw_result.assigned_team_name,
            escalated=raw_result.escalated,
            matched_rules=list(raw_result.matched_rules),
            sla_due_at=raw_result.sla_due_at,
            sla_response_due_at=raw_result.sla_response_due_at,
            fallback_applied=False,
            fallback_reason=None,
        )
    except asyncio.TimeoutError:
        reason = f"classifier_timeout_after_{timeout_seconds}s"
        logger.warning(
            "triage_classifier_timeout_fallback",
            extra={
                "fallback_priority": FALLBACK_PRIORITY,
                "fallback_team": FALLBACK_TEAM_NAME,
                "reason": reason,
            },
        )
    except Exception as exc:
        reason = f"classifier_error:{type(exc).__name__}"
        logger.exception(
            "triage_classifier_exception_fallback",
            extra={
                "fallback_priority": FALLBACK_PRIORITY,
                "fallback_team": FALLBACK_TEAM_NAME,
                "reason": reason,
            },
        )

    return ResilientTriageOutcome(
        effective_priority=FALLBACK_PRIORITY,
        effective_category=category or "Other",
        assigned_team_name=FALLBACK_TEAM_NAME,
        escalated=False,
        matched_rules=[f"fallback:{reason}"],
        sla_response_due_at=eval_time + timedelta(hours=2),
        sla_due_at=eval_time + timedelta(hours=24),
        fallback_applied=True,
        fallback_reason=reason,
    )