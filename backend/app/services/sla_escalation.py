import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.services.notifications import (
    build_notification_payload,
    dispatch_routing_notifications,
)

logger = logging.getLogger("supportflow.sla_worker")

TERMINAL_STATUSES = {"Resolved", "Closed"}
DEFAULT_WARNING_WINDOW_MINUTES = int(os.getenv("SLA_WARNING_WINDOW_MINUTES", "30"))


@dataclass(frozen=True)
class SlaEvaluationResult:
    ticket_id: str
    ticket_number: int
    action: str  # "breach_escalated" | "near_breach_warned" | "skipped_already_alerted" | "healthy"
    previous_priority: str
    new_priority: str
    minutes_remaining: float


def parse_iso_timestamp(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    cleaned = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(cleaned)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def classify_sla_ticket(
    ticket: dict[str, Any],
    now: datetime,
    already_breach_alerted: bool,
    already_warned: bool,
    warning_window_minutes: int = DEFAULT_WARNING_WINDOW_MINUTES,
) -> SlaEvaluationResult:
    """
    Pure, deterministic SLA evaluator:
    - Overdue (sla_due_at <= now): escalates priority to 'Urgent' & flags 'breach_escalated' once.
    - Nearing breach (0 < remaining <= warning_window_minutes): flags 'near_breach_warned' once.
    """
    tid = str(ticket["id"])
    tnum = int(ticket.get("ticket_number", 0))
    status = (ticket.get("status") or "").strip()
    current_priority = (ticket.get("priority") or "Medium").strip()
    raw_due = ticket.get("sla_due_at")

    if not raw_due or status in TERMINAL_STATUSES:
        return SlaEvaluationResult(
            ticket_id=tid,
            ticket_number=tnum,
            action="healthy",
            previous_priority=current_priority,
            new_priority=current_priority,
            minutes_remaining=float("inf"),
        )

    due_at = parse_iso_timestamp(raw_due)
    remaining_minutes = (due_at - now).total_seconds() / 60.0

    # 1. Overdue / Breached SLA
    if remaining_minutes <= 0:
        if already_breach_alerted and current_priority == "Urgent":
            return SlaEvaluationResult(
                ticket_id=tid,
                ticket_number=tnum,
                action="skipped_already_alerted",
                previous_priority=current_priority,
                new_priority="Urgent",
                minutes_remaining=round(remaining_minutes, 2),
            )
        return SlaEvaluationResult(
            ticket_id=tid,
            ticket_number=tnum,
            action="breach_escalated",
            previous_priority=current_priority,
            new_priority="Urgent",
            minutes_remaining=round(remaining_minutes, 2),
        )

    # 2. Nearing SLA Breach (within warning threshold)
    if remaining_minutes <= warning_window_minutes:
        if already_warned:
            return SlaEvaluationResult(
                ticket_id=tid,
                ticket_number=tnum,
                action="skipped_already_alerted",
                previous_priority=current_priority,
                new_priority=current_priority,
                minutes_remaining=round(remaining_minutes, 2),
            )
        return SlaEvaluationResult(
            ticket_id=tid,
            ticket_number=tnum,
            action="near_breach_warned",
            previous_priority=current_priority,
            new_priority=current_priority,
            minutes_remaining=round(remaining_minutes, 2),
        )

    return SlaEvaluationResult(
        ticket_id=tid,
        ticket_number=tnum,
        action="healthy",
        previous_priority=current_priority,
        new_priority=current_priority,
        minutes_remaining=round(remaining_minutes, 2),
    )


async def run_sla_escalation_sweep(
    supabase: Any,
    now: Optional[datetime] = None,
    warning_window_minutes: int = DEFAULT_WARNING_WINDOW_MINUTES,
) -> dict[str, Any]:
    """
    Cron job entrypoint: scans active tickets with `sla_due_at`, escalates overdue
    tickets to Urgent, emits audit alerts, and notifies assigned teams.
    """
    current_time = now or datetime.now(timezone.utc)
    now_iso = current_time.isoformat()

    # 1. Fetch open tickets that have an SLA deadline
    tickets_resp = (
        supabase.table("tickets")
        .select(
            "id, ticket_number, title, description, category, priority, status, "
            "requester_email, team_id, sla_due_at"
        )
        .not_.is_("sla_due_at", "null")
        .not_.in_("status", list(TERMINAL_STATUSES))
        .execute()
    )
    open_tickets: list[dict[str, Any]] = tickets_resp.data or []

    if not open_tickets:
        return {
            "checked_at": now_iso,
            "scanned_count": 0,
            "escalated_count": 0,
            "warned_count": 0,
            "results": [],
        }

    ticket_ids = [str(t["id"]) for t in open_tickets]

    # 2. Load existing SLA alert audit events to prevent duplicate escalation spam
    events_resp = (
        supabase.table("ticket_events")
        .select("ticket_id, event_type")
        .in_("ticket_id", ticket_ids)
        .in_("event_type", ["SLA_BREACHED_ESCALATED", "SLA_WARNING_NEAR_BREACH"])
        .execute()
    )
    breach_alerted_ids = {
        str(e["ticket_id"])
        for e in (events_resp.data or [])
        if e["event_type"] == "SLA_BREACHED_ESCALATED"
    }
    warned_ids = {
        str(e["ticket_id"])
        for e in (events_resp.data or [])
        if e["event_type"] == "SLA_WARNING_NEAR_BREACH"
    }

    # 3. Load support teams lookup for team names & escalation emails
    teams_resp = (
        supabase.table("support_teams")
        .select("id, name, escalation_email")
        .execute()
    )
    teams_by_id = {str(team["id"]): team for team in (teams_resp.data or [])}

    escalated_count = 0
    warned_count = 0
    action_summaries: list[dict[str, Any]] = []

    for ticket in open_tickets:
        tid = str(ticket["id"])
        eval_result = classify_sla_ticket(
            ticket=ticket,
            now=current_time,
            already_breach_alerted=tid in breach_alerted_ids,
            already_warned=tid in warned_ids,
            warning_window_minutes=warning_window_minutes,
        )

        if eval_result.action not in {"breach_escalated", "near_breach_warned"}:
            continue

        team_info = teams_by_id.get(str(ticket.get("team_id") or ""), {})
        team_name = team_info.get("name", "General Triage Desk")
        escalation_email = team_info.get("escalation_email")

        if eval_result.action == "breach_escalated":
            # Escalate priority to Urgent (UPDATE only -> zero INSERT trigger loops)
            supabase.table("tickets").update(
                {
                    "priority": "Urgent",
                    "updated_at": now_iso,
                }
            ).eq("id", tid).execute()

            supabase.table("ticket_events").insert(
                {
                    "ticket_id": tid,
                    "actor": "system:sla_escalation_worker",
                    "event_type": "SLA_BREACHED_ESCALATED",
                    "previous_state": eval_result.previous_priority,
                    "new_state": "Urgent",
                    "metadata": {
                        "sla_due_at": ticket["sla_due_at"],
                        "overdue_by_minutes": abs(eval_result.minutes_remaining),
                        "assigned_team": team_name,
                    },
                }
            ).execute()

            notif_payload = build_notification_payload(
                ticket_id=UUID(tid),
                ticket_number=eval_result.ticket_number,
                priority="Urgent",
                category=ticket.get("category", "Other"),
                title=f"[SLA BREACHED] {ticket.get('title', '')}",
                description=ticket.get("description", ""),
                assigned_team=team_name,
                escalation_email=escalation_email,
                requester_email=ticket.get("requester_email", ""),
                matched_rule="sla_worker:overdue_breach_escalation",
                escalation_applied=True,
            )
            await dispatch_routing_notifications(notif_payload, supabase_client=supabase)
            escalated_count += 1

        elif eval_result.action == "near_breach_warned":
            supabase.table("ticket_events").insert(
                {
                    "ticket_id": tid,
                    "actor": "system:sla_escalation_worker",
                    "event_type": "SLA_WARNING_NEAR_BREACH",
                    "previous_state": eval_result.previous_priority,
                    "new_state": f"Due in {int(eval_result.minutes_remaining)}m",
                    "metadata": {
                        "sla_due_at": ticket["sla_due_at"],
                        "minutes_remaining": eval_result.minutes_remaining,
                        "assigned_team": team_name,
                    },
                }
            ).execute()

            notif_payload = build_notification_payload(
                ticket_id=UUID(tid),
                ticket_number=eval_result.ticket_number,
                priority=eval_result.previous_priority,
                category=ticket.get("category", "Other"),
                title=f"[SLA WARNING - {int(eval_result.minutes_remaining)}m left] {ticket.get('title', '')}",
                description=ticket.get("description", ""),
                assigned_team=team_name,
                escalation_email=escalation_email,
                requester_email=ticket.get("requester_email", ""),
                matched_rule="sla_worker:near_breach_warning",
                escalation_applied=False,
            )
            await dispatch_routing_notifications(notif_payload, supabase_client=supabase)
            warned_count += 1

        action_summaries.append(
            {
                "ticket_id": tid,
                "ticket_number": eval_result.ticket_number,
                "action": eval_result.action,
                "previous_priority": eval_result.previous_priority,
                "new_priority": eval_result.new_priority,
                "minutes_remaining": eval_result.minutes_remaining,
            }
        )

    logger.info(
        "SLA sweep complete: scanned=%d escalated=%d warned=%d",
        len(open_tickets),
        escalated_count,
        warned_count,
    )
    return {
        "checked_at": now_iso,
        "scanned_count": len(open_tickets),
        "escalated_count": escalated_count,
        "warned_count": warned_count,
        "results": action_summaries,
    }