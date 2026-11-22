from fastapi.testclient import TestClient
from app.main import app

def test_classify_endpoint_returns_200_with_priority_team_and_rationale():
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/classify",
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
        assert "Cloud & DevOps" in body["rationale"]
        assert "KW-02-PAYMENT" in body["rationale"]
        assert body["sla"]["response_target_minutes"] == 15
        assert body["sla"]["resolution_target_hours"] == 1


def test_classify_endpoint_returns_422_with_field_details_on_malformed_payload():
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/classify",
            json={
                "title": "  ",
                "description": "ok",
                "category": "InvalidCategory",
                "requested_priority": "SuperUrgent",
                "unexpected_extra_field": "forbid_me",
            },
        )
        assert resp.status_code == 422
        error_locs = {tuple(err["loc"]) for err in resp.json()["detail"]}
        assert ("body", "title") in error_locs
        assert ("body", "description") in error_locs
        assert ("body", "category") in error_locs
        assert ("body", "requested_priority") in error_locs
        assert ("body", "unexpected_extra_field") in error_locs