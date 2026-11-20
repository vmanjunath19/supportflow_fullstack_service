from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import pytest

from app.services.notifications import (
    build_notification_payload,
    dispatch_routing_notifications,
)
from app.services.retry_queue import (
    compute_exponential_backoff_seconds,
    process_retry_queue,
)


def test_exponential_backoff_progression():
    assert compute_exponential_backoff_seconds(1, base_seconds=30) == 30
    assert compute_exponential_backoff_seconds(2, base_seconds=30) == 60
    assert compute_exponential_backoff_seconds(3, base_seconds=30) == 120
    assert compute_exponential_backoff_seconds(4, base_seconds=30) == 240
    assert compute_exponential_backoff_seconds(10, base_seconds=30, max_backoff_seconds=600) == 600


@pytest.mark.asyncio
async def test_simulated_network_outage_records_error_in_dead_letter_table(monkeypatch):
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T000/B000/OUTAGE")
    monkeypatch.delenv("SMTP_HOST", raising=False)

    # Simulate network outage when posting to Slack
    async def failing_slack(*args, **kwargs):
        raise httpx.ConnectError("Simulated DNS/network outage to hooks.slack.com")

    monkeypatch.setattr("app.services.notifications.send_slack_notification", failing_slack)

    inserted_rows: dict[str, list[dict]] = {"webhook_dead_letters": [], "ticket_events": []}

    def fake_table(table_name: str):
        tbl = MagicMock()

        def fake_insert(row):
            inserted_rows.setdefault(table_name, []).append(row)
            exec_mock = MagicMock()
            exec_mock.execute.return_value.data = [{**row, "id": str(uuid4())}]
            return exec_mock

        tbl.insert.side_effect = fake_insert
        return tbl

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = fake_table

    tid = uuid4()
    payload = build_notification_payload(
        ticket_id=tid,
        ticket_number=3001,
        priority="Urgent",
        category="Network",
        title="Core router BGP flap",
        description="Simulated outage retry verification",
        assigned_team="Network Operations",
        escalation_email="netops-oncall@supportflow.local",
        requester_email="ops@company.com",
        matched_rule="db_default_category:network",
    )

    result = await dispatch_routing_notifications(payload, supabase_client=mock_supabase)

    assert result["channels"]["slack"]["status"] == "queued_retry"
    assert len(inserted_rows["webhook_dead_letters"]) == 1

    dlq_entry = inserted_rows["webhook_dead_letters"][0]
    assert dlq_entry["ticket_id"] == str(tid)
    assert dlq_entry["channel"] == "slack"
    assert dlq_entry["status"] == "pending_retry"
    assert dlq_entry["attempt_count"] == 1
    assert "Simulated DNS/network outage" in dlq_entry["error_message"]

    event_types = [e["event_type"] for e in inserted_rows["ticket_events"]]
    assert "DISPATCH_QUEUED_FOR_RETRY" in event_types
    assert "NOTIFICATION_DISPATCHED" in event_types


@pytest.mark.asyncio
async def test_retry_worker_recovers_on_subsequent_attempt_and_dead_letters_exhausted():
    now = datetime(2026, 11, 20, 15, 0, tzinfo=timezone.utc)
    dlq_recover_id = str(uuid4())
    dlq_exhaust_id = str(uuid4())
    tid_1 = str(uuid4())
    tid_2 = str(uuid4())

    due_rows = [
        {
            "id": dlq_recover_id,
            "ticket_id": tid_1,
            "channel": "slack",
            "endpoint_url": "https://hooks.slack.com/ok",
            "payload": {"text": "Recovered alert"},
            "attempt_count": 1,
            "max_attempts": 5,
            "status": "pending_retry",
            "next_retry_at": (now - timedelta(seconds=5)).isoformat(),
        },
        {
            "id": dlq_exhaust_id,
            "ticket_id": tid_2,
            "channel": "slack",
            "endpoint_url": "https://hooks.slack.com/down",
            "payload": {"text": "Exhausted alert"},
            "attempt_count": 4,
            "max_attempts": 5,
            "status": "pending_retry",
            "next_retry_at": (now - timedelta(seconds=5)).isoformat(),
        },
    ]

    updates_by_id: dict[str, dict] = {}

    def fake_table(table_name: str):
        tbl = MagicMock()
        if table_name == "webhook_dead_letters":
            # Select chain
            tbl.select.return_value.eq.return_value.lte.return_value.order.return_value.limit.return_value.execute.return_value.data = due_rows

            # Update chain
            def fake_update(vals):
                upd_chain = MagicMock()

                def fake_eq(col, row_id):
                    updates_by_id[row_id] = vals
                    exec_mock = MagicMock()
                    exec_mock.execute.return_value.data = [vals]
                    return exec_mock

                upd_chain.eq.side_effect = fake_eq
                return upd_chain

            tbl.update.side_effect = fake_update
        else:
            tbl.insert.return_value.execute.return_value.data = [{"id": str(uuid4())}]
        return tbl

    mock_supabase = MagicMock()
    mock_supabase.table.side_effect = fake_table

    async def scripted_executor(channel: str, endpoint_url: str | None, payload: dict):
        if endpoint_url and endpoint_url.endswith("/down"):
            raise RuntimeError("503 Service Unavailable")

    summary = await process_retry_queue(
        mock_supabase,
        executor=scripted_executor,
        now=now,
    )

    assert summary["processed_count"] == 2
    assert summary["resolved_count"] == 1
    assert summary["dead_lettered_count"] == 1
    assert updates_by_id[dlq_recover_id]["status"] == "resolved"
    assert updates_by_id[dlq_exhaust_id]["status"] == "dead_lettered"