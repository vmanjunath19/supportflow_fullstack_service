from fastapi.testclient import TestClient
from app.main import app
import pytest

@pytest.mark.parametrize(
    ("title", "description", "category", "requested_priority", "expected_priority", "expected_team", "expected_sla_hours"),
    [
        (
            "Order spare ergonomic footrest",
            "Standard desk accessory request for new starter.",
            "Other",
            "Low",
            "Low",
            "General Triage Desk",
            72,
        ),
        (
            "Employee locked out after MFA reset",
            "Needs SSO login token re-issued for portal access.",
            "Access & IAM",
            "Medium",
            "Medium",
            "Identity & Security",
            24,
        ),
        (
            "Reporting API returning 503 errors",
            "Latency spike observed on scheduled report generation.",
            "Database & Cloud",
            "Low",
            "High",
            "Cloud & DevOps",
            4,
        ),
        (
            "Complete outage on EU checkout cluster",
            "Production down across primary availability zone.",
            "Software",
            "Low",
            "Urgent",
            "Cloud & DevOps",
            1,
        ),
    ],
)
def test_classify_endpoint_all_priorities_end_to_end(
    title: str,
    description: str,
    category: str,
    requested_priority: str,
    expected_priority: str,
    expected_team: str,
    expected_sla_hours: int,
):
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/classify",
            json={
                "title": title,
                "description": description,
                "category": category,
                "requested_priority": requested_priority,
            },
        )
        assert resp.status_code == 200, f"Expected 200 OK, got {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["effective_priority"] == expected_priority, (
            f"Expected priority '{expected_priority}', got '{body['effective_priority']}'"
        )
        assert body["assigned_team_name"] == expected_team, (
            f"Expected team '{expected_team}', got '{body['assigned_team_name']}'"
        )
        assert body["sla"]["resolution_target_hours"] == expected_sla_hours, (
            f"Expected {expected_sla_hours}h SLA, got {body['sla']['resolution_target_hours']}h"
        )
        assert expected_team in body["rationale"], f"Team '{expected_team}' missing from rationale: {body['rationale']}"


def test_classify_endpoint_edge_cases_boundary_and_whitespace_stripping():
    with TestClient(app) as client:
        # Exact minimum length boundaries (title=3, description=5) with leading/trailing whitespace
        resp = client.post(
            "/api/v1/classify",
            json={
                "title": "   VPN   ",
                "description": "   12345   ",
                "category": "Network",
                "requested_priority": "Low",
            },
        )
        assert resp.status_code == 200, f"Boundary payload failed: {resp.text}"
        body = resp.json()
        assert body["assigned_team_name"] == "Network Operations"


def test_swagger_docs_and_openapi_expose_classify_endpoint():
    with TestClient(app) as client:
        docs_resp = client.get("/docs")
        assert docs_resp.status_code == 200, "Swagger UI /docs did not return 200 OK"
        assert "Swagger UI" in docs_resp.text, "Swagger UI HTML marker missing from /docs"

        openapi_resp = client.get("/openapi.json")
        assert openapi_resp.status_code == 200, "OpenAPI schema /openapi.json did not return 200 OK"
        paths = openapi_resp.json()["paths"]
        assert "/api/v1/classify" in paths, f"/api/v1/classify missing from OpenAPI paths: {list(paths.keys())}"
        
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