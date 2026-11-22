from fastapi.testclient import TestClient
from app.main import app


def test_classify_endpoint_returns_structured_response_for_valid_payload():
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/tickets/classify",
            json={
                "title": "Payment down across UK storefront",
                "description": "Checkout returning 503 Service Unavailable.",
                "category": "Software",
                "requested_priority": "Low",
                "impact": "High",
                "urgency": "High",
                "requester_email": "ops@company.com",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["effective_priority"] == "Urgent"
        assert body["assigned_team_name"] == "Cloud & DevOps"
        assert body["escalated"] is True
        assert body["sla"]["response_target_minutes"] == 15
        assert body["sla"]["resolution_target_hours"] == 1


def test_classify_endpoint_returns_422_with_field_details_on_malformed_payload():
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/tickets/classify",
            json={
                "title": "  ",  # Blank after whitespace strip -> min_length violation
                "description": "ok",  # Too short (< 5 chars)
                "category": "InvalidCategory",  # Invalid enum
                "requested_priority": "SuperUrgent",  # Invalid enum
                "unexpected_extra_field": "forbid_me",  # extra="forbid" violation
            },
        )
        assert resp.status_code == 422
        errors = resp.json()["detail"]
        error_locs = {tuple(err["loc"]) for err in errors}

        assert ("body", "title") in error_locs
        assert ("body", "description") in error_locs
        assert ("body", "category") in error_locs
        assert ("body", "requested_priority") in error_locs
        assert ("body", "unexpected_extra_field") in error_locs