from uuid import uuid4
import pytest

from app.services.notifications import (
    build_email_message,
    build_notification_payload,
    build_slack_webhook_body,
    dispatch_routing_notifications,
)


def test_notification_payload_contains_required_fields():
    tid = uuid4()
    payload = build_notification_payload(
        ticket_id=tid,
        ticket_number=1042,
        priority="Urgent",
        category="Database & Cloud",
        title="Primary read-replica replication lag spike",
        description="Replication delay crossed 45s on eu-west-2 cluster.",
        assigned_team="Cloud & DevOps",
        escalation_email="devops-oncall@supportflow.local",
        requester_email="maya.lin@company.com",
        matched_rule="db_default_category:database & cloud",
        frontend_base_url="http://localhost:5173",
    )

    assert payload.formatted_ticket_id == "TKT-1042"
    assert payload.priority == "Urgent"
    assert payload.summary == "Primary read-replica replication lag spike"
    assert payload.workspace_link == f"http://localhost:5173/?ticket={tid}"


def test_slack_and_email_formatters_embed_ticket_details_and_link():
    tid = uuid4()
    payload = build_notification_payload(
        ticket_id=tid,
        ticket_number=1043,
        priority="High",
        category="Network",
        title="Branch office Wi-Fi radius auth failure",
        description="802.1X authentication timing out on floor 3.",
        assigned_team="Network Operations",
        escalation_email="netops-oncall@supportflow.local",
        requester_email="sam.okafor@company.com",
        matched_rule="db_default_category:network",
        frontend_base_url="http://localhost:5173",
    )

    slack_body = build_slack_webhook_body(payload)
    assert "TKT-1043" in slack_body["text"]
    assert "High" in slack_body["text"]
    assert "Branch office Wi-Fi radius auth failure" in slack_body["text"]
    action_button = slack_body["blocks"][-1]["elements"][0]
    assert action_button["url"] == f"http://localhost:5173/?ticket={tid}"

    email_msg = build_email_message(payload, sender_email="noreply@supportflow.local")
    assert email_msg["To"] == "netops-oncall@supportflow.local"
    assert "TKT-1043" in email_msg["Subject"]
    assert "High" in email_msg["Subject"]

    plain_body = email_msg.get_body(preferencelist=("plain",)).get_content()
    html_body = email_msg.get_body(preferencelist=("html",)).get_content()
    expected_link = f"http://localhost:5173/?ticket={tid}"

    assert expected_link in plain_body
    assert expected_link in html_body

@pytest.mark.asyncio
async def test_dispatch_worker_dry_run_succeeds_without_external_secrets(monkeypatch):
    monkeypatch.delenv("SLACK_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)

    payload = build_notification_payload(
        ticket_id=uuid4(),
        ticket_number=1044,
        priority="Medium",
        category="Hardware",
        title="Docking station dual-monitor flicker",
        description="USB-C dock drops external DisplayPort output.",
        assigned_team="IT Field Support",
        escalation_email="field-support@supportflow.local",
        requester_email="liam.ross@company.com",
        matched_rule="db_default_category:hardware",
    )

    result = await dispatch_routing_notifications(payload)
    assert result["formatted_ticket_id"] == "TKT-1044"
    assert result["channels"]["slack"]["status"] == "dry_run"
    assert result["channels"]["email"]["status"] == "dry_run"
    assert result["channels"]["email"]["recipient"] == "field-support@supportflow.local"