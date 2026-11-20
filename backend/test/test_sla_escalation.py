from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.services.sla_escalation import classify_sla_ticket


def test_overdue_ticket_escalates_priority_to_urgent():
    now = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
    ticket = {
        "id": str(uuid4()),
        "ticket_number": 2001,
        "status": "Triaged",
        "priority": "Medium",
        "sla_due_at": (now - timedelta(minutes=12)).isoformat(),
    }

    result = classify_sla_ticket(
        ticket=ticket,
        now=now,
        already_breach_alerted=False,
        already_warned=False,
    )

    assert result.action == "breach_escalated"
    assert result.previous_priority == "Medium"
    assert result.new_priority == "Urgent"
    assert result.minutes_remaining == -12.0


def test_ticket_nearing_sla_breach_triggers_warning_without_priority_change():
    now = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
    ticket = {
        "id": str(uuid4()),
        "ticket_number": 2002,
        "status": "In Progress",
        "priority": "High",
        "sla_due_at": (now + timedelta(minutes=18)).isoformat(),
    }

    result = classify_sla_ticket(
        ticket=ticket,
        now=now,
        already_breach_alerted=False,
        already_warned=False,
        warning_window_minutes=30,
    )

    assert result.action == "near_breach_warned"
    assert result.previous_priority == "High"
    assert result.new_priority == "High"
    assert result.minutes_remaining == 18.0


def test_already_escalated_ticket_is_skipped_on_subsequent_cron_runs():
    now = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
    ticket = {
        "id": str(uuid4()),
        "ticket_number": 2003,
        "status": "Triaged",
        "priority": "Urgent",
        "sla_due_at": (now - timedelta(minutes=45)).isoformat(),
    }

    result = classify_sla_ticket(
        ticket=ticket,
        now=now,
        already_breach_alerted=True,
        already_warned=True,
    )

    assert result.action == "skipped_already_alerted"


def test_resolved_or_closed_tickets_never_escalate():
    now = datetime(2026, 11, 20, 12, 0, tzinfo=timezone.utc)
    ticket = {
        "id": str(uuid4()),
        "ticket_number": 2004,
        "status": "Resolved",
        "priority": "Low",
        "sla_due_at": (now - timedelta(hours=3)).isoformat(),
    }

    result = classify_sla_ticket(
        ticket=ticket,
        now=now,
        already_breach_alerted=False,
        already_warned=False,
    )

    assert result.action == "healthy"