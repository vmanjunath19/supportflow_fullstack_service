import json
import logging
from uuid import UUID

from fastapi.testclient import TestClient

from app.core.logging import StructuredJSONFormatter, mask_sensitive_data
from app.main import app


def test_mask_sensitive_data_redacts_secrets_and_bearer_tokens():
    sample = {
        "x-webhook-secret": "sf_whsec_super_secret_123",
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.xyz",
        "nested": {"supabase_service_role_key": "sbp_secret_key", "team": "Cloud & DevOps"},
        "note": "Failed auth with token=my_raw_token_999",
    }
    redacted = mask_sensitive_data(sample)
    serialized = json.dumps(redacted)

    assert "sf_whsec_super_secret_123" not in serialized
    assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in serialized
    assert "sbp_secret_key" not in serialized
    assert "my_raw_token_999" not in serialized
    assert redacted["x-webhook-secret"] == "[REDACTED]"
    assert redacted["Authorization"] == "[REDACTED]"
    assert redacted["nested"]["team"] == "Cloud & DevOps"


def test_request_generates_and_echoes_correlation_id_and_logs_json_decision(caplog):
    caplog.set_level(logging.INFO, logger="supportflow.http")
    formatter = StructuredJSONFormatter()

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/classify",
            headers={
                "X-Correlation-ID": "cid-test-98765",
                "X-Webhook-Secret": "super_secret_must_never_leak",
                "Authorization": "Bearer top_secret_jwt_value",
            },
            json={
                "title": "Payment down in EU region",
                "description": "Checkout returning 503 errors.",
                "category": "Software",
                "requested_priority": "Low",
            },
        )
        assert resp.status_code == 200
        assert resp.headers["X-Correlation-ID"] == "cid-test-98765"

    http_records = [r for r in caplog.records if r.name == "supportflow.http"]
    assert len(http_records) >= 1

    rendered_json = formatter.format(http_records[-1])
    assert "super_secret_must_never_leak" not in rendered_json
    assert "top_secret_jwt_value" not in rendered_json

    parsed = json.loads(rendered_json)
    assert parsed["correlation_id"] == "cid-test-98765"
    assert parsed["method"] == "POST"
    assert parsed["path"] == "/api/v1/classify"
    assert parsed["status_code"] == 200
    assert isinstance(parsed["duration_ms"], float)
    assert parsed["decision"]["effective_priority"] == "Urgent"
    assert parsed["decision"]["assigned_team"] == "Cloud & DevOps"


def test_request_without_correlation_header_auto_generates_valid_uuid():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        generated_cid = resp.headers.get("X-Correlation-ID")
        assert generated_cid is not None
        UUID(generated_cid)  # Validates UUID4 format