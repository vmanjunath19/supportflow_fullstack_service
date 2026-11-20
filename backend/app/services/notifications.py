import logging
import os
import smtplib
from dataclasses import asdict, dataclass
from email.message import EmailMessage
from typing import Any, Optional
from urllib.parse import urlencode
from uuid import UUID

import httpx

logger = logging.getLogger("supportflow.notifications")


@dataclass(frozen=True)
class TicketNotificationPayload:
    ticket_id: str
    formatted_ticket_id: str
    priority: str
    category: str
    summary: str
    description_excerpt: str
    assigned_team: str
    escalation_email: Optional[str]
    requester_email: str
    workspace_link: str
    matched_rule: str
    escalation_applied: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_workspace_link(ticket_id: UUID | str, base_url: Optional[str] = None) -> str:
    frontend_url = (
        base_url
        or os.getenv("FRONTEND_WORKSPACE_URL", "http://localhost:5173")
    ).rstrip("/")
    query = urlencode({"ticket": str(ticket_id)})
    return f"{frontend_url}/?{query}"


def build_notification_payload(
    *,
    ticket_id: UUID | str,
    ticket_number: int,
    priority: str,
    category: str,
    title: str,
    description: str,
    assigned_team: str,
    escalation_email: Optional[str],
    requester_email: str,
    matched_rule: str,
    escalation_applied: bool = False,
    frontend_base_url: Optional[str] = None,
) -> TicketNotificationPayload:
    formatted_id = f"TKT-{ticket_number}"
    clean_desc = (description or "").strip()
    excerpt = clean_desc[:180] + ("..." if len(clean_desc) > 180 else "")

    return TicketNotificationPayload(
        ticket_id=str(ticket_id),
        formatted_ticket_id=formatted_id,
        priority=priority,
        category=category,
        summary=title.strip(),
        description_excerpt=excerpt,
        assigned_team=assigned_team,
        escalation_email=escalation_email,
        requester_email=requester_email,
        workspace_link=build_workspace_link(ticket_id, frontend_base_url),
        matched_rule=matched_rule,
        escalation_applied=escalation_applied,
    )


def build_slack_webhook_body(payload: TicketNotificationPayload) -> dict[str, Any]:
    """Formats a rich Slack Block Kit message with ticket ID, priority, summary, and workspace CTA."""
    priority_badge = {
        "Urgent": "🔴 Urgent",
        "High": "🟠 High",
        "Medium": "🟡 Medium",
        "Low": "🟢 Low",
    }.get(payload.priority, payload.priority)

    escalation_note = " *(Escalated)*" if payload.escalation_applied else ""

    return {
        "text": f"[{payload.formatted_ticket_id}] ({payload.priority}) {payload.summary} → {payload.assigned_team}",
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🎫 {payload.formatted_ticket_id}: {payload.summary[:120]}",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Assigned Team:*\n{payload.assigned_team}{escalation_note}"},
                    {"type": "mrkdwn", "text": f"*Priority:*\n{priority_badge}"},
                    {"type": "mrkdwn", "text": f"*Category:*\n{payload.category}"},
                    {"type": "mrkdwn", "text": f"*Requester:*\n{payload.requester_email}"},
                ],
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Summary:*\n{payload.description_excerpt or payload.summary}",
                },
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Open in SupportFlow Workspace"},
                        "url": payload.workspace_link,
                        "style": "primary",
                    }
                ],
            },
        ],
    }


def build_email_message(payload: TicketNotificationPayload, sender_email: str) -> EmailMessage:
    """Constructs a multi-part plain-text + HTML email alert for the assigned support team."""
    recipient = payload.escalation_email or os.getenv("DEFAULT_TRIAGE_EMAIL", "triage-desk@supportflow.local")
    msg = EmailMessage()
    msg["Subject"] = f"[{payload.formatted_ticket_id}] [{payload.priority}] {payload.summary} — Assigned to {payload.assigned_team}"
    msg["From"] = sender_email
    msg["To"] = recipient

    plain_body = (
        f"New Ticket Routed to {payload.assigned_team}\n"
        f"{'=' * 48}\n"
        f"Ticket ID : {payload.formatted_ticket_id}\n"
        f"Priority  : {payload.priority}\n"
        f"Category  : {payload.category}\n"
        f"Summary   : {payload.summary}\n"
        f"Requester : {payload.requester_email}\n"
        f"Rule      : {payload.matched_rule}\n\n"
        f"Details:\n{payload.description_excerpt}\n\n"
        f"Open in Workspace:\n{payload.workspace_link}\n"
    )
    msg.set_content(plain_body)

    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; color: #0f172a;">
      <h2 style="margin-bottom: 8px;">[{payload.formatted_ticket_id}] {payload.summary}</h2>
      <p style="margin-top: 0; color: #475569;">Routed to <strong>{payload.assigned_team}</strong></p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #64748b;"><strong>Ticket ID</strong></td><td>{payload.formatted_ticket_id}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;"><strong>Priority</strong></td><td>{payload.priority}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;"><strong>Category</strong></td><td>{payload.category}</td></tr>
        <tr><td style="padding: 6px 0; color: #64748b;"><strong>Requester</strong></td><td>{payload.requester_email}</td></tr>
      </table>
      <p style="background: #f8fafc; padding: 12px; border-radius: 8px; font-size: 14px; color: #334155;">
        {payload.description_excerpt or payload.summary}
      </p>
      <p style="margin-top: 20px;">
        <a href="{payload.workspace_link}"
           style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600;">
          Open Ticket in Workspace
        </a>
      </p>
    </div>
    """
    msg.add_alternative(html_body, subtype="html")
    return msg


async def send_slack_notification(
    payload: TicketNotificationPayload,
    webhook_url: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> dict[str, Any]:
    target_url = (webhook_url or os.getenv("SLACK_WEBHOOK_URL", "")).strip()
    body = build_slack_webhook_body(payload)

    if not target_url:
        logger.info("SLACK_WEBHOOK_URL not configured; dry-run payload: %s", body["text"])
        return {"channel": "slack", "status": "dry_run", "preview": body["text"]}

    if client is not None:
        resp = await client.post(target_url, json=body, timeout=5.0)
        resp.raise_for_status()
    else:
        async with httpx.AsyncClient(timeout=5.0) as async_client:
            resp = await async_client.post(target_url, json=body)
            resp.raise_for_status()

    return {"channel": "slack", "status": "sent"}


def send_email_notification(payload: TicketNotificationPayload) -> dict[str, Any]:
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
    sender_email = os.getenv("SMTP_FROM_EMAIL", "noreply@supportflow.local").strip()

    msg = build_email_message(payload, sender_email=sender_email)

    if not smtp_host:
        logger.info(
            "SMTP_HOST not configured; dry-run email to %s | Subject: %s | Link: %s",
            msg["To"],
            msg["Subject"],
            payload.workspace_link,
        )
        return {
            "channel": "email",
            "status": "dry_run",
            "recipient": msg["To"],
            "subject": msg["Subject"],
            "workspace_link": payload.workspace_link,
        }

    with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
        server.starttls()
        if smtp_user and smtp_password:
            server.login(smtp_user, smtp_password)
        server.send_message(msg)

    return {"channel": "email", "status": "sent", "recipient": msg["To"]}


async def dispatch_routing_notifications(
    payload: TicketNotificationPayload,
    supabase_client: Any = None,
) -> dict[str, Any]:
    """
    Background worker entrypoint: sends Slack + Email notifications and records
    an immutable NOTIFICATION_DISPATCHED audit entry on the ticket.
    """
    results: dict[str, Any] = {
        "ticket_id": payload.ticket_id,
        "formatted_ticket_id": payload.formatted_ticket_id,
        "workspace_link": payload.workspace_link,
        "channels": {},
    }

    try:
        results["channels"]["slack"] = await send_slack_notification(payload)
    except Exception as exc:
        logger.exception("Slack notification failed for %s", payload.formatted_ticket_id)
        results["channels"]["slack"] = {"channel": "slack", "status": "error", "error": str(exc)}

    try:
        results["channels"]["email"] = send_email_notification(payload)
    except Exception as exc:
        logger.exception("Email notification failed for %s", payload.formatted_ticket_id)
        results["channels"]["email"] = {"channel": "email", "status": "error", "error": str(exc)}

    if supabase_client is not None:
        try:
            supabase_client.table("ticket_events").insert(
                {
                    "ticket_id": payload.ticket_id,
                    "actor": "system:notification_worker",
                    "event_type": "NOTIFICATION_DISPATCHED",
                    "previous_state": None,
                    "new_state": payload.assigned_team,
                    "metadata": {
                        "formatted_ticket_id": payload.formatted_ticket_id,
                        "priority": payload.priority,
                        "summary": payload.summary,
                        "workspace_link": payload.workspace_link,
                        "escalation_email": payload.escalation_email,
                        "channels": results["channels"],
                    },
                }
            ).execute()
        except Exception:
            logger.exception("Failed to write NOTIFICATION_DISPATCHED audit log")

    return results