from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4
import pytest

from app.services.audit import (
    AutomatedActor,
    AutomatedEventType,
    build_audit_event,
    record_audit_event,
)


def test_build_audit_event_sets_utc_timestamp_and_actor():
    tid = uuid4()
    ts = datetime(2026, 11, 20, 13, 30, tzinfo=timezone.utc)

    event = build_audit_event(
        ticket_id=tid,
        actor=AutomatedActor.ROUTING_ENGINE,
        event_type=AutomatedEventType.AUTO_ROUTED,
        previous_state="Unassigned",
        new_state="Network Operations",
        metadata={"matched_rule": "db_default_category:network"},
        occurred_at=ts,
    )

    assert event.ticket_id == str(tid)
    assert event.actor == "system:rule_routing_engine"
    assert event.event_type == "AUTO_ROUTED"
    assert event.previous_state == "Unassigned"
    assert event.new_state == "Network Operations"
    assert event.created_at == "2026-11-20T13:30:00+00:00"
    assert event.metadata["immutable"] is True


def test_build_audit_event_rejects_empty_actor():
    with pytest.raises(ValueError, match="actor"):
        build_audit_event(
            ticket_id=uuid4(),
            actor="   ",
            event_type=AutomatedEventType.AUTO_ROUTED,
        )


def test_record_audit_event_only_appends_via_insert():
    mock_table = MagicMock()
    mock_table.insert.return_value.execute.return_value.data = [{"id": str(uuid4())}]
    mock_supabase = MagicMock()
    mock_supabase.table.return_value = mock_table

    tid = uuid4()
    record_audit_event(
        mock_supabase,
        ticket_id=tid,
        actor=AutomatedActor.SLA_WORKER,
        event_type=AutomatedEventType.SLA_BREACHED_ESCALATED,
        previous_state="Medium",
        new_state="Urgent",
    )

    mock_supabase.table.assert_called_once_with("ticket_events")
    mock_table.insert.assert_called_once()
    mock_table.update.assert_not_called()
    mock_table.delete.assert_not_called()