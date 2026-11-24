import time
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.routers import webhooks


def _build_mock_supabase(active_teams: list[dict]) -> MagicMock:
    mock_sb = MagicMock()

    def table_side_effect(table_name: str):
        tbl = MagicMock()
        if table_name == "support_teams":
            tbl.select.return_value.eq.return_value.execute.return_value.data = active_teams
        else:
            tbl.update.return_value.eq.return_value.execute.return_value.data = [{}]
            tbl.insert.return_value.execute.return_value.data = [{}]
        return tbl

    mock_sb.table.side_effect = table_side_effect
    return mock_sb


def test_webhook_defaults_to_medium_and_triage_queue_on_classifier_timeout():
    triage_team_id = str(uuid4())
    active_teams = [
        {
            "id": triage_team_id,
            "name": "Triage Queue",
            "default_category": "Other",
            "escalation_email": "triage@company.com",
            "is_active": True,
        }
    ]
    mock_sb = _build_mock_supabase(active_teams)

    def slow_classifier(**_kwargs):
        time.sleep(0.3)
        raise AssertionError("Should have timed out before returning")

    with (
        patch.object(webhooks, "CLASSIFIER_TIMEOUT_SECONDS", 0.05),
        patch("app.routers.webhooks.classify_incident", side_effect=slow_classifier),
        patch("app.routers.webhooks.get_supabase_admin", return_value=mock_sb),
        patch("app.routers.webhooks.dispatch_routing_notifications"),
        TestClient(app) as client,
    ):
        resp = client.post(
            "/api/v1/webhooks/ticket-created",
            headers={
                "X-Webhook-Secret": webhooks.WEBHOOK_SECRET,
                "X-Webhook-Event-ID": f"evt-{uuid4()}",
            },
            json={
                "event_id": str(uuid4()),
                "event_type": "ticket.created",
                "occurred_at": "2026-11-24T12:14:00Z",
                "record": {
                    "id": str(uuid4()),
                    "ticket_number": 8001,
                    "title": "Critical database outage",
                    "description": "Primary cluster unreachable.",
                    "category": "Database & Cloud",
                    "priority": "Urgent",
                    "status": "New",
                    "requester_email": "ops@company.com",
                    "team_id": None,
                    "created_at": "2026-11-24T12:14:00Z",
                },
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "routed"
    assert body["effective_priority"] == "Medium"
    assert body["assigned_team"] == "Triage Queue"
    assert body["triage_fallback_applied"] is True


def test_webhook_defaults_to_medium_and_triage_queue_on_classifier_exception():
    triage_team_id = str(uuid4())
    active_teams = [
        {
            "id": triage_team_id,
            "name": "Triage Queue",
            "default_category": "Other",
            "escalation_email": "triage@company.com",
            "is_active": True,
        }
    ]
    mock_sb = _build_mock_supabase(active_teams)

    def crashed_classifier(**_kwargs):
        raise RuntimeError("Simulated classifier outage")

    with (
        patch("app.routers.webhooks.classify_incident", side_effect=crashed_classifier),
        patch("app.routers.webhooks.get_supabase_admin", return_value=mock_sb),
        patch("app.routers.webhooks.dispatch_routing_notifications"),
        TestClient(app) as client,
    ):
        resp = client.post(
            "/api/v1/webhooks/ticket-created",
            headers={
                "X-Webhook-Secret": webhooks.WEBHOOK_SECRET,
                "X-Webhook-Event-ID": f"evt-{uuid4()}",
            },
            json={
                "event_id": str(uuid4()),
                "event_type": "ticket.created",
                "occurred_at": "2026-11-24T12:15:00Z",
                "record": {
                    "id": str(uuid4()),
                    "ticket_number": 8002,
                    "title": "Checkout service degraded",
                    "description": "High latency on checkout API.",
                    "category": "Software",
                    "priority": "High",
                    "status": "New",
                    "requester_email": "alice@company.com",
                    "team_id": None,
                    "created_at": "2026-11-24T12:15:00Z",
                },
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "routed"
    assert body["effective_priority"] == "Medium"
    assert body["assigned_team"] == "Triage Queue"
    assert body["triage_fallback_applied"] is True