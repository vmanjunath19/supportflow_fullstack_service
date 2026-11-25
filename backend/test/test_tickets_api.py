import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_ticket_repository
from app.main import app
from app.repositories import InMemoryTicketRepository


@pytest.fixture
def client() -> TestClient:
    repo = InMemoryTicketRepository()
    app.dependency_overrides[get_ticket_repository] = lambda: repo
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_create_transition_and_reject_illegal_update(client: TestClient) -> None:
    create_res = client.post(
        "/api/tickets",
        json={
            "title": "VPN drops every 10 minutes",
            "description": "Disconnects on macOS client after latest OS patch.",
            "requester_email": "dev@example.com",
            "priority": "High",
            "category": "Network",
        },
    )
    assert create_res.status_code == 201
    ticket_id = create_res.json()["id"]

    # Illegal jump: New -> Resolved (must go through In Progress)
    bad_patch = client.patch(
        f"/api/tickets/{ticket_id}",
        json={"status": "Resolved", "resolution_notes": "Restarted gateway"},
    )
    assert bad_patch.status_code == 400

    # Valid transition: New -> In Progress
    ok_patch = client.patch(
        f"/api/tickets/{ticket_id}",
        json={"status": "In Progress"},
    )
    assert ok_patch.status_code == 200
    assert ok_patch.json()["status"] == "In Progress"

    # Detail endpoint includes SLA + 2 audit events
    detail = client.get(f"/api/tickets/{ticket_id}").json()
    assert len(detail["audit_events"]) == 2
    assert detail["sla"]["is_breached"] is False