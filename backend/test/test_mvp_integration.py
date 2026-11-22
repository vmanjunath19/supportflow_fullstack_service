"""
SupportFlow Automated MVP Integration Test Suite
================================================
Covers end-to-end FastAPI webhook ingestion, signature & schema validation,
rule-based team routing, high-impact escalation overrides, fallback triage,
idempotency deduplication, SLA breach escalation sweeps, state-machine
transition guards, and dead-letter queue (DLQ) outage recovery.
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import webhooks as webhooks_router


class InMemorySupabaseStub:
    """
    Stateful in-memory database double mimicking Supabase PostgREST queries
    (.select, .insert, .update, .eq, .in_, .not_, .lte, .order, .limit, .single)
    while enforcing append-only immutability on `ticket_events`.
    """

    def __init__(self) -> None:
        self.tables: dict[str, list[dict[str, Any]]] = {
            "support_teams": [
                {
                    "id": "10000000-0000-0000-0000-000000000001",
                    "name": "IT Field Support",
                    "default_category": "Hardware",
                    "escalation_email": "field-support@supportflow.local",
                    "is_active": True,
                },
                {
                    "id": "10000000-0000-0000-0000-000000000002",
                    "name": "Application Support",
                    "default_category": "Software",
                    "escalation_email": "app-support@supportflow.local",
                    "is_active": True,
                },
                {
                    "id": "10000000-0000-0000-0000-000000000003",
                    "name": "Network Operations",
                    "default_category": "Network",
                    "escalation_email": "netops-oncall@supportflow.local",
                    "is_active": True,
                },
                {
                    "id": "10000000-0000-0000-0000-000000000004",
                    "name": "Identity & Security",
                    "default_category": "Access & IAM",
                    "escalation_email": "secops@supportflow.local",
                    "is_active": True,
                },
                {
                    "id": "10000000-0000-0000-0000-000000000005",
                    "name": "Cloud & DevOps",
                    "default_category": "Database & Cloud",
                    "escalation_email": "devops-oncall@supportflow.local",
                    "is_active": True,
                },
                {
                    "id": "10000000-0000-0000-0000-000000000006",
                    "name": "General Triage Desk",
                    "default_category": "Other",
                    "escalation_email": "triage-desk@supportflow.local",
                    "is_active": True,
                },
            ],
            "tickets": [],
            "ticket_events": [],
            "webhook_dead_letters": [],
        }

    def table(self, name: str) -> "_QueryBuilder":
        if name not in self.tables:
            self.tables[name] = []
        return _QueryBuilder(self, name)


class _QueryResponse:
    def __init__(self, data: Any) -> None:
        self.data = data


class _NegatedFilter:
    def __init__(self, builder: "_QueryBuilder") -> None:
        self._builder = builder

    def is_(self, column: str, value: str) -> "_QueryBuilder":
        if value == "null":
            self._builder._filters.append(lambda row: row.get(column) is not None)
        return self._builder

    def in_(self, column: str, values: list[Any]) -> "_QueryBuilder":
        allowed = set(values)
        self._builder._filters.append(lambda row: row.get(column) not in allowed)
        return self._builder


class _QueryBuilder:
    def __init__(self, db: InMemorySupabaseStub, table_name: str) -> None:
        self._db = db
        self._table = table_name
        self._op = "select"
        self._payload: Any = None
        self._filters: list[Any] = []
        self._order_col: str | None = None
        self._order_desc: bool = False
        self._limit: int | None = None
        self._single: bool = False

    @property
    def not_(self) -> _NegatedFilter:
        return _NegatedFilter(self)

    def select(self, columns: str = "*") -> "_QueryBuilder":
        self._op = "select"
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]) -> "_QueryBuilder":
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict[str, Any]) -> "_QueryBuilder":
        self._op = "update"
        self._payload = payload
        return self

    def delete(self) -> "_QueryBuilder":
        if self._table == "ticket_events":
            raise RuntimeError("ticket_events is an immutable append-only audit log (DELETE is not permitted)")
        self._op = "delete"
        return self

    def eq(self, column: str, value: Any) -> "_QueryBuilder":
        self._filters.append(lambda row: str(row.get(column)) == str(value))
        return self

    def in_(self, column: str, values: list[Any]) -> "_QueryBuilder":
        str_vals = {str(v) for v in values}
        self._filters.append(lambda row: str(row.get(column)) in str_vals)
        return self

    def lte(self, column: str, value: Any) -> "_QueryBuilder":
        self._filters.append(lambda row: row.get(column) is not None and str(row.get(column)) <= str(value))
        return self

    def order(self, column: str, desc: bool = False) -> "_QueryBuilder":
        self._order_col = column
        self._order_desc = desc
        return self

    def limit(self, count: int) -> "_QueryBuilder":
        self._limit = count
        return self

    def single(self) -> "_QueryBuilder":
        self._single = True
        return self

    def execute(self) -> _QueryResponse:
        rows = self._db.tables[self._table]

        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for item in items:
                record = dict(item)
                record.setdefault("id", str(uuid4()))
                record.setdefault("created_at", datetime.now(timezone.utc).isoformat())
                rows.append(record)
                inserted.append(dict(record))
            return _QueryResponse(inserted)

        if self._op == "update":
            if self._table == "ticket_events":
                raise RuntimeError("ticket_events is an immutable append-only audit log (UPDATE is not permitted)")
            updated = []
            for row in rows:
                if all(f(row) for f in self._filters):
                    row.update(self._payload)
                    updated.append(dict(row))
            return _QueryResponse(updated)

        matched = [dict(r) for r in rows if all(f(r) for f in self._filters)]
        if self._order_col:
            matched.sort(key=lambda r: str(r.get(self._order_col) or ""), reverse=self._order_desc)
        if self._limit is not None:
            matched = matched[: self._limit]
        if self._single:
            return _QueryResponse(matched[0] if matched else None)
        return _QueryResponse(matched)


@pytest.fixture()
def integration_env(monkeypatch):
    """
    Wires a fresh InMemorySupabaseStub into FastAPI routers and clears webhook
    idempotency caches and external secret env vars for deterministic runs.
    """
    fake_db = InMemorySupabaseStub()
    webhooks_router._processed_event_ids.clear()

    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.setattr("app.routers.webhooks.get_supabase_admin", lambda: fake_db)
    monkeypatch.setattr("app.main.get_supabase_admin", lambda: fake_db)

    with TestClient(app) as client:
        yield client, fake_db


def _build_webhook_envelope(
    *,
    ticket_id: UUID | None = None,
    ticket_number: int = 4001,
    title: str = "Branch VPN tunnel flapping",
    description: str = "Packet loss exceeding 20% across primary IPsec gateway.",
    category: str = "Network",
    priority: str = "High",
    status: str = "New",
    requester_email: str = "alex.mercer@company.com",
    team_id: str | None = None,
    sla_due_at: str | None = None,
) -> tuple[dict[str, Any], dict[str, str]]:
    tid = ticket_id or uuid4()
    event_id = uuid4()
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "event_id": str(event_id),
        "event_type": "ticket.created",
        "occurred_at": now_iso,
        "record": {
            "id": str(tid),
            "ticket_number": ticket_number,
            "title": title,
            "description": description,
            "category": category,
            "priority": priority,
            "status": status,
            "requester_email": requester_email,
            "team_id": team_id,
            "sla_due_at": sla_due_at,
            "created_at": now_iso,
        },
    }
    headers = {
        "X-Webhook-Secret": webhooks_router.WEBHOOK_SECRET,
        "X-Webhook-Event-Id": str(event_id),
    }
    return payload, headers


# ---------------------------------------------------------------------------
# Integration Test Case 1: Service Health & Background Scheduler Readiness
# ---------------------------------------------------------------------------
def test_01_health_endpoint_confirms_active_scheduler(integration_env):
    client, _ = integration_env
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["sla_worker_running"] is True


# ---------------------------------------------------------------------------
# Integration Test Case 2: End-to-End Ticket Creation, Auto-Routing & Audit Trail
# ---------------------------------------------------------------------------
def test_02_ticket_creation_routes_to_team_and_persists_immutable_audit_trail(integration_env):
    client, db = integration_env
    tid = uuid4()
    payload, headers = _build_webhook_envelope(
        ticket_id=tid,
        ticket_number=4002,
        category="Network",
        priority="High",
    )
    db.tables["tickets"].append(dict(payload["record"]))

    resp = client.post("/api/v1/webhooks/ticket-created", json=payload, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "routed"
    assert body["assigned_team"] == "Network Operations"
    assert body["notification_queued"] is True
    assert body["workspace_link"] == f"http://localhost:5173/?ticket={tid}"

    # Verify DB ticket record transitioned to Triaged with Network Operations assigned
    stored_ticket = db.tables["tickets"][0]
    assert stored_ticket["status"] == "Triaged"
    assert stored_ticket["team_id"] == "10000000-0000-0000-0000-000000000003"

    # Verify chronological audit trail via API endpoint
    audit_resp = client.get(f"/api/v1/webhooks/tickets/{tid}/audit-events")
    assert audit_resp.status_code == 200
    event_types = [e["event_type"] for e in audit_resp.json()["events"]]
    assert "AUTO_ROUTED" in event_types
    assert "STATUS_TRANSITIONED" in event_types
    assert "NOTIFICATION_DISPATCHED" in event_types


# ---------------------------------------------------------------------------
# Integration Test Case 3: High-Impact Software Escalation Override
# ---------------------------------------------------------------------------
def test_03_high_impact_software_ticket_escalates_to_cloud_devops(integration_env):
    client, db = integration_env
    tid = uuid4()
    payload, headers = _build_webhook_envelope(
        ticket_id=tid,
        ticket_number=4003,
        title="Production billing API 500 errors",
        category="Software",
        priority="Urgent",
    )
    db.tables["tickets"].append(dict(payload["record"]))

    resp = client.post("/api/v1/webhooks/ticket-created", json=payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["assigned_team"] == "Cloud & DevOps"
    assert "escalat" in data["matched_rule"].lower()


# ---------------------------------------------------------------------------
# Integration Test Case 4: Unclassified / 'Other' Category Fallback Routing
# ---------------------------------------------------------------------------
def test_04_other_category_routes_to_general_triage_fallback(integration_env):
    client, db = integration_env
    tid = uuid4()
    payload, headers = _build_webhook_envelope(
        ticket_id=tid,
        ticket_number=4004,
        title="New hire ergonomic desk request",
        category="Other",
        priority="Low",
    )
    db.tables["tickets"].append(dict(payload["record"]))

    resp = client.post("/api/v1/webhooks/ticket-created", json=payload, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["assigned_team"] == "General Triage Desk"


# ---------------------------------------------------------------------------
# Integration Test Case 5: Invalid Webhook Signature Rejection (HTTP 401)
# ---------------------------------------------------------------------------
def test_05_invalid_webhook_secret_rejected_with_401(integration_env):
    client, db = integration_env
    payload, headers = _build_webhook_envelope(ticket_number=4005)
    headers["X-Webhook-Secret"] = "forged_invalid_secret"

    resp = client.post("/api/v1/webhooks/ticket-created", json=payload, headers=headers)
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid webhook signature"
    assert len(db.tables["ticket_events"]) == 0


# ---------------------------------------------------------------------------
# Integration Test Case 6: Invalid / Malformed Payload Validation (HTTP 422)
# ---------------------------------------------------------------------------
def test_06_malformed_ticket_payload_rejected_with_422(integration_env):
    client, _ = integration_env
    malformed_payload = {
        "event_id": str(uuid4()),
        "event_type": "ticket.created",
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "record": {
            "id": "not-a-valid-uuid",
            "ticket_number": "not-an-integer",
            # Missing required title, description, category, priority, status, requester_email
        },
    }
    headers = {"X-Webhook-Secret": webhooks_router.WEBHOOK_SECRET}

    resp = client.post("/api/v1/webhooks/ticket-created", json=malformed_payload, headers=headers)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Integration Test Case 7: Idempotent Duplicate Webhook Delivery Deduplication
# ---------------------------------------------------------------------------
def test_07_duplicate_webhook_event_id_is_safely_ignored(integration_env):
    client, db = integration_env
    tid = uuid4()
    payload, headers = _build_webhook_envelope(ticket_id=tid, ticket_number=4007)
    db.tables["tickets"].append(dict(payload["record"]))

    first = client.post("/api/v1/webhooks/ticket-created", json=payload, headers=headers)
    assert first.status_code == 200
    assert first.json()["status"] == "routed"

    second = client.post("/api/v1/webhooks/ticket-created", json=payload, headers=headers)
    assert second.status_code == 200
    assert second.json()["status"] == "duplicate_ignored"

    auto_routed_events = [
        e for e in db.tables["ticket_events"] if e["event_type"] == "AUTO_ROUTED"
    ]
    assert len(auto_routed_events) == 1


# ---------------------------------------------------------------------------
# Integration Test Case 8: Scheduled SLA Breach Escalation & Warning Sweep
# ---------------------------------------------------------------------------
def test_08_sla_sweep_escalates_overdue_ticket_to_urgent_and_warns_near_breach(integration_env):
    client, db = integration_env
    now = datetime.now(timezone.utc)
    overdue_id = str(uuid4())
    warning_id = str(uuid4())

    db.tables["tickets"].extend(
        [
            {
                "id": overdue_id,
                "ticket_number": 4008,
                "title": "Database connection pool exhausted",
                "description": "API pods failing health checks.",
                "category": "Database & Cloud",
                "priority": "Medium",
                "status": "Triaged",
                "requester_email": "sre@company.com",
                "team_id": "10000000-0000-0000-0000-000000000005",
                "sla_due_at": (now - timedelta(minutes=15)).isoformat(),
            },
            {
                "id": warning_id,
                "ticket_number": 4009,
                "title": "SSO SAML certificate renewal warning",
                "description": "Expires within 20 minutes.",
                "category": "Access & IAM",
                "priority": "High",
                "status": "In Progress",
                "requester_email": "iam@company.com",
                "team_id": "10000000-0000-0000-0000-000000000004",
                "sla_due_at": (now + timedelta(minutes=15)).isoformat(),
            },
        ]
    )

    resp = client.post("/api/v1/workers/sla-sweep")
    assert resp.status_code == 200
    summary = resp.json()
    assert summary["escalated_count"] == 1
    assert summary["warned_count"] == 1

    overdue_ticket = next(t for t in db.tables["tickets"] if t["id"] == overdue_id)
    assert overdue_ticket["priority"] == "Urgent"

    # Second sweep immediately afterward must deduplicate and not re-escalate
    second_resp = client.post("/api/v1/workers/sla-sweep")
    assert second_resp.json()["escalated_count"] == 0
    assert second_resp.json()["warned_count"] == 0


# ---------------------------------------------------------------------------
# Integration Test Case 9: Strict State Machine Transitions & Illegal Rejection
# ---------------------------------------------------------------------------
def test_09_state_machine_enforces_valid_flow_and_rejects_closed_to_new(integration_env):
    client, db = integration_env
    tid = str(uuid4())
    db.tables["tickets"].append(
        {
            "id": tid,
            "ticket_number": 4010,
            "title": "Laptop VPN client upgrade",
            "category": "Software",
            "priority": "Low",
            "status": "Triaged",
            "team_id": "10000000-0000-0000-0000-000000000002",
        }
    )

    # Valid progression: Triaged -> In Progress -> Resolved -> Closed
    for next_state in ["In Progress", "Resolved", "Closed"]:
        res = client.post(
            f"/api/v1/webhooks/tickets/{tid}/transition",
            json={"target_status": next_state, "actor": "agent:tester"},
        )
        assert res.status_code == 200
        assert res.json()["new_status"] == next_state

    # Illegal transition: Closed -> New must be rejected with HTTP 422
    illegal = client.post(
        f"/api/v1/webhooks/tickets/{tid}/transition",
        json={"target_status": "New", "actor": "agent:tester"},
    )
    assert illegal.status_code == 422
    assert "Closed" in illegal.json()["detail"]
    assert "New" in illegal.json()["detail"]


# ---------------------------------------------------------------------------
# Integration Test Case 10: Simulated Network Outage -> DLQ Capture -> Recovery
# ---------------------------------------------------------------------------
def test_10_network_outage_queues_dead_letter_and_recovers_on_retry(integration_env, monkeypatch):
    client, db = integration_env
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T000/B000/FAIL")

    async def simulated_outage(*args, **kwargs):
        raise httpx.ConnectError("Simulated connection refused during outage")

    monkeypatch.setattr("app.services.notifications.send_slack_notification", simulated_outage)

    tid = uuid4()
    payload, headers = _build_webhook_envelope(
        ticket_id=tid,
        ticket_number=4011,
        category="Hardware",
        priority="Medium",
    )
    db.tables["tickets"].append(dict(payload["record"]))

    # 1. Webhook routes ticket and captures Slack outage in webhook_dead_letters
    resp = client.post("/api/v1/webhooks/ticket-created", json=payload, headers=headers)
    assert resp.status_code == 200

    dlq_resp = client.get("/api/v1/workers/dead-letters")
    assert dlq_resp.status_code == 200
    items = dlq_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["status"] == "pending_retry"
    assert items[0]["channel"] == "slack"

    # 2. Fast-forward next_retry_at into the past and restore Slack endpoint health
    db.tables["webhook_dead_letters"][0]["next_retry_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=5)
    ).isoformat()

    async def healthy_executor(channel: str, endpoint_url: str | None, body: dict):
        return None  # Simulates 200 OK recovery

    monkeypatch.setattr("app.services.retry_queue._default_channel_executor", healthy_executor)

    retry_resp = client.post("/api/v1/workers/retry-sweep")
    assert retry_resp.status_code == 200
    assert retry_resp.json()["resolved_count"] == 1
    assert db.tables["webhook_dead_letters"][0]["status"] == "resolved"