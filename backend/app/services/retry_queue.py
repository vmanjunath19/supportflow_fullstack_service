import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional
from uuid import UUID

import httpx

from app.services.audit import (
    AutomatedActor,
    AutomatedEventType,
    record_audit_event,
)

logger = logging.getLogger("supportflow.retry_queue")

DEFAULT_BASE_BACKOFF_SECONDS = int(os.getenv("RETRY_BASE_BACKOFF_SECONDS", "30"))
DEFAULT_MAX_BACKOFF_SECONDS = int(os.getenv("RETRY_MAX_BACKOFF_SECONDS", "3600"))
DEFAULT_MAX_ATTEMPTS = int(os.getenv("RETRY_MAX_ATTEMPTS", "5"))


def compute_exponential_backoff_seconds(
    attempt_count: int,
    base_seconds: int = DEFAULT_BASE_BACKOFF_SECONDS,
    max_backoff_seconds: int = DEFAULT_MAX_BACKOFF_SECONDS,
) -> int:
    """
    Computes exponential backoff delay in seconds:
      attempt 1 -> 30s
      attempt 2 -> 60s
      attempt 3 -> 120s
      attempt 4 -> 240s
      attempt 5 -> 480s (capped at max_backoff_seconds)
    """
    exponent = max(0, attempt_count - 1)
    delay = base_seconds * (2 ** exponent)
    return min(delay, max_backoff_seconds)


def enqueue_failed_dispatch(
    supabase: Any,
    *,
    ticket_id: Optional[UUID | str],
    channel: str,
    payload: dict[str, Any],
    error_message: str,
    endpoint_url: Optional[str] = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    base_backoff_seconds: int = DEFAULT_BASE_BACKOFF_SECONDS,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    """
    Records a failed external dispatch in `public.webhook_dead_letters` with
    exponential backoff scheduling and logs an immutable audit event.
    """
    current_time = now or datetime.now(timezone.utc)
    backoff_seconds = compute_exponential_backoff_seconds(
        attempt_count=1,
        base_seconds=base_backoff_seconds,
    )
    next_retry = current_time + timedelta(seconds=backoff_seconds)

    dlq_row = {
        "ticket_id": str(ticket_id) if ticket_id else None,
        "channel": channel,
        "endpoint_url": endpoint_url,
        "payload": payload,
        "error_message": str(error_message)[:1000],
        "status": "pending_retry",
        "attempt_count": 1,
        "max_attempts": max_attempts,
        "next_retry_at": next_retry.isoformat(),
        "last_attempted_at": current_time.isoformat(),
    }

    if supabase is None:
        return dlq_row

    resp = supabase.table("webhook_dead_letters").insert(dlq_row).execute()
    inserted = (resp.data or [dlq_row])[0]

    if ticket_id:
        record_audit_event(
            supabase,
            ticket_id=ticket_id,
            actor=AutomatedActor.RETRY_WORKER,
            event_type=AutomatedEventType.DISPATCH_QUEUED_FOR_RETRY,
            previous_state="failed",
            new_state="pending_retry",
            metadata={
                "channel": channel,
                "attempt_count": 1,
                "max_attempts": max_attempts,
                "next_retry_at": next_retry.isoformat(),
                "error": str(error_message)[:300],
            },
            occurred_at=current_time,
        )

    logger.warning(
        "Queued failed %s dispatch for ticket=%s (next_retry_at=%s): %s",
        channel,
        ticket_id,
        next_retry.isoformat(),
        error_message,
    )
    return inserted


async def _default_channel_executor(
    channel: str,
    endpoint_url: Optional[str],
    payload: dict[str, Any],
) -> None:
    """Re-executes a queued external call by channel type."""
    if channel in {"slack", "outbound_webhook"}:
        target = (endpoint_url or os.getenv("SLACK_WEBHOOK_URL", "")).strip()
        if not target:
            raise RuntimeError(f"No endpoint URL configured for retry channel '{channel}'")
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(target, json=payload)
            resp.raise_for_status()
        return

    if channel == "email":
        from app.services.notifications import (
            TicketNotificationPayload,
            send_email_notification,
        )

        notif_obj = TicketNotificationPayload(**payload)
        send_email_notification(notif_obj)
        return

    raise ValueError(f"Unsupported retry channel: {channel}")


async def process_retry_queue(
    supabase: Any,
    *,
    executor: Optional[Callable[[str, Optional[str], dict[str, Any]], Awaitable[None]]] = None,
    now: Optional[datetime] = None,
    base_backoff_seconds: int = DEFAULT_BASE_BACKOFF_SECONDS,
    batch_limit: int = 25,
) -> dict[str, Any]:
    """
    Polls `webhook_dead_letters` for due `pending_retry` items, retries them with
    exponential backoff, marks successes `resolved`, and moves exhausted entries
    to `dead_lettered`.
    """
    current_time = now or datetime.now(timezone.utc)
    now_iso = current_time.isoformat()
    run_executor = executor or _default_channel_executor

    due_resp = (
        supabase.table("webhook_dead_letters")
        .select("*")
        .eq("status", "pending_retry")
        .lte("next_retry_at", now_iso)
        .order("next_retry_at", desc=False)
        .limit(batch_limit)
        .execute()
    )
    due_items: list[dict[str, Any]] = due_resp.data or []

    resolved_count = 0
    requeued_count = 0
    dead_lettered_count = 0
    details: list[dict[str, Any]] = []

    for item in due_items:
        dlq_id = str(item["id"])
        ticket_id = item.get("ticket_id")
        channel = item["channel"]
        endpoint_url = item.get("endpoint_url")
        payload = item.get("payload") or {}
        next_attempt = int(item.get("attempt_count", 1)) + 1
        max_attempts = int(item.get("max_attempts", DEFAULT_MAX_ATTEMPTS))

        try:
            await run_executor(channel, endpoint_url, payload)

            supabase.table("webhook_dead_letters").update(
                {
                    "status": "resolved",
                    "attempt_count": next_attempt,
                    "last_attempted_at": now_iso,
                    "resolved_at": now_iso,
                }
            ).eq("id", dlq_id).execute()

            if ticket_id:
                record_audit_event(
                    supabase,
                    ticket_id=ticket_id,
                    actor=AutomatedActor.RETRY_WORKER,
                    event_type=AutomatedEventType.RETRY_SUCCEEDED,
                    previous_state="pending_retry",
                    new_state="resolved",
                    metadata={
                        "dlq_id": dlq_id,
                        "channel": channel,
                        "attempt_count": next_attempt,
                    },
                    occurred_at=current_time,
                )

            resolved_count += 1
            details.append({"dlq_id": dlq_id, "outcome": "resolved", "attempt": next_attempt})

        except Exception as exc:
            err_str = str(exc)[:1000]
            if next_attempt >= max_attempts:
                supabase.table("webhook_dead_letters").update(
                    {
                        "status": "dead_lettered",
                        "attempt_count": next_attempt,
                        "error_message": err_str,
                        "last_attempted_at": now_iso,
                    }
                ).eq("id", dlq_id).execute()

                if ticket_id:
                    record_audit_event(
                        supabase,
                        ticket_id=ticket_id,
                        actor=AutomatedActor.RETRY_WORKER,
                        event_type=AutomatedEventType.DEAD_LETTER_EXHAUSTED,
                        previous_state="pending_retry",
                        new_state="dead_lettered",
                        metadata={
                            "dlq_id": dlq_id,
                            "channel": channel,
                            "attempt_count": next_attempt,
                            "final_error": err_str[:300],
                        },
                        occurred_at=current_time,
                    )

                dead_lettered_count += 1
                details.append(
                    {"dlq_id": dlq_id, "outcome": "dead_lettered", "attempt": next_attempt}
                )
            else:
                backoff_secs = compute_exponential_backoff_seconds(
                    attempt_count=next_attempt,
                    base_seconds=base_backoff_seconds,
                )
                next_retry_at = (current_time + timedelta(seconds=backoff_secs)).isoformat()

                supabase.table("webhook_dead_letters").update(
                    {
                        "status": "pending_retry",
                        "attempt_count": next_attempt,
                        "error_message": err_str,
                        "last_attempted_at": now_iso,
                        "next_retry_at": next_retry_at,
                    }
                ).eq("id", dlq_id).execute()

                requeued_count += 1
                details.append(
                    {
                        "dlq_id": dlq_id,
                        "outcome": "requeued",
                        "attempt": next_attempt,
                        "next_retry_at": next_retry_at,
                    }
                )

    return {
        "checked_at": now_iso,
        "processed_count": len(due_items),
        "resolved_count": resolved_count,
        "requeued_count": requeued_count,
        "dead_lettered_count": dead_lettered_count,
        "details": details,
    }