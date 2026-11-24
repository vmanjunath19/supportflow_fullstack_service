import json
import os
import sys
import urllib.error
import urllib.request


def send_request(
    url: str,
    *,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
) -> tuple[int, dict[str, str], dict | str]:
    req_headers = {"Accept": "application/json", **(headers or {})}
    data = None
    if payload is not None:
        req_headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            body = json.loads(raw) if raw else {}
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, body
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            body = raw
        return exc.code, {k.lower(): v for k, v in exc.headers.items()}, body


def run_remote_smoke_suite(base_url: str, webhook_secret: str | None = None) -> None:
    base = base_url.rstrip("/")
    print(f"\nRunning remote integration smoke tests against: {base}\n")

    # 1. Health & APScheduler readiness (200 OK)
    status, headers, body = send_request(
        f"{base}/health",
        headers={"X-Correlation-ID": "remote-smoke-health-01"},
    )
    assert status == 200, f"[FAIL] GET /health expected 200, got {status}: {body}"
    assert body.get("status") == "ok", f"[FAIL] Unexpected health payload: {body}"
    assert headers.get("x-correlation-id") == "remote-smoke-health-01", "[FAIL] Correlation ID not echoed"
    print("[PASS] 1. GET /health -> 200 OK (scheduler active & correlation ID echoed)")

    # 2. Valid classification request (200 OK)
    status, headers, body = send_request(
        f"{base}/api/v1/classify",
        method="POST",
        headers={"X-Correlation-ID": "remote-smoke-classify-02"},
        payload={
            "title": "Payment down across UK storefront",
            "description": "Checkout returning 503 Service Unavailable for all users ASAP.",
            "category": "Software",
            "requested_priority": "Low",
            "impact": "High",
            "urgency": "High",
        },
    )
    assert status == 200, f"[FAIL] POST /api/v1/classify expected 200, got {status}: {body}"
    assert body["effective_priority"] == "Urgent", f"[FAIL] Expected Urgent, got {body}"
    assert body["assigned_team_name"] == "Cloud & DevOps", f"[FAIL] Expected Cloud & DevOps, got {body}"
    assert body["escalated"] is True
    print("[PASS] 2. POST /api/v1/classify (valid) -> 200 OK (Urgent -> Cloud & DevOps)")

    # 3. Malformed payload & extra forbidden field (422 Unprocessable Entity)
    status, _, body = send_request(
        f"{base}/api/v1/classify",
        method="POST",
        payload={
            "title": "x",  # Below min_length=3
            "description": "   ",  # Blank whitespace
            "category": "InvalidCategory",
            "unexpected_field": "forbid_me",
        },
    )
    assert status == 422, f"[FAIL] Malformed /classify expected 422, got {status}: {body}"
    print("[PASS] 3. POST /api/v1/classify (malformed) -> 422 Unprocessable Entity")

    # 4. Webhook missing/invalid secret (401 Unauthorized)
    status, _, body = send_request(
        f"{base}/api/v1/webhooks/ticket-created",
        method="POST",
        headers={"X-Webhook-Secret": "wrong_secret_token_test"},
        payload={
            "event_id": "9c8b7a6d-1111-4222-8333-444455556666",
            "event_type": "ticket.created",
            "occurred_at": "2026-11-24T11:54:00Z",
            "record": {
                "id": "11111111-2222-3333-4444-555555556666",
                "ticket_number": 9999,
                "title": "Smoke test auth check",
                "description": "Verifying 401 rejection on invalid secret.",
                "category": "Software",
                "priority": "Medium",
                "status": "New",
                "requester_email": "ops@company.com",
                "team_id": None,
                "created_at": "2026-11-24T11:55:00Z",
            },
        },
    )
    assert status == 401, f"[FAIL] Invalid webhook secret expected 401, got {status}: {body}"
    print("[PASS] 4. POST /api/v1/webhooks/ticket-created (invalid secret) -> 401 Unauthorized")


if __name__ == "__main__":
    target_url = sys.argv[1] if len(sys.argv) > 1 else os.getenv("SUPPORTFLOW_CLOUD_URL", "")
    if not target_url:
        print("Usage: python scripts/remote_smoke_test.py https://<your-service>.onrender.com")
        sys.exit(1)
    run_remote_smoke_suite(target_url, os.getenv("WEBHOOK_SECRET"))