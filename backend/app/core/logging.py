from contextvars import ContextVar
from datetime import datetime, timezone
import json
import logging
import re
from typing import Any

# Thread/async-safe request correlation ID context
correlation_id_ctx: ContextVar[str | None] = ContextVar("correlation_id", default=None)

SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "authorization",
        "x-webhook-secret",
        "webhook_secret",
        "supabase_service_role_key",
        "supabase_anon_key",
        "api_key",
        "apikey",
        "secret",
        "password",
        "token",
        "access_token",
        "refresh_token",
        "slack_webhook_url",
        "smtp_password",
        "resend_api_key",
    }
)

_BEARER_PATTERN = re.compile(r"(Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)
_SECRET_KV_PATTERN = re.compile(
    r"((?:secret|token|password|apikey|api_key|key)\s*[=:]\s*)([^\s,;\"']+)",
    re.IGNORECASE,
)


def mask_sensitive_data(value: Any, *, key_hint: str | None = None) -> Any:
    """Recursively redacts sensitive keys and secret patterns before JSON serialization."""
    if key_hint and key_hint.lower().strip() in SENSITIVE_KEYS:
        return "[REDACTED]"

    if isinstance(value, dict):
        return {
            str(k): mask_sensitive_data(v, key_hint=str(k))
            for k, v in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [mask_sensitive_data(item) for item in value]

    if isinstance(value, str):
        masked = _BEARER_PATTERN.sub(r"\1[REDACTED]", value)
        masked = _SECRET_KV_PATTERN.sub(r"\1[REDACTED]", masked)
        return masked

    return value


class StructuredJSONFormatter(logging.Formatter):
    """Formats every LogRecord as a single-line JSON object with correlation_id and scrubbed metadata."""

    _RESERVED_ATTRS = frozenset(
        {
            "args",
            "asctime",
            "created",
            "exc_info",
            "exc_text",
            "filename",
            "funcName",
            "levelname",
            "levelno",
            "lineno",
            "module",
            "msecs",
            "message",
            "msg",
            "name",
            "pathname",
            "process",
            "processName",
            "relativeCreated",
            "stack_info",
            "thread",
            "threadName",
            "taskName",
        }
    )

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "correlation_id": getattr(record, "correlation_id", None) or correlation_id_ctx.get(),
            "message": mask_sensitive_data(record.getMessage()),
        }

        # Attach structured extra fields (e.g., duration_ms, status_code, decision)
        for key, val in record.__dict__.items():
            if key not in self._RESERVED_ATTRS and not key.startswith("_"):
                log_entry[key] = mask_sensitive_data(val, key_hint=key)

        if record.exc_info:
            log_entry["exception"] = mask_sensitive_data(self.formatException(record.exc_info))

        return json.dumps(log_entry, default=str)


def configure_structured_logging(level: int = logging.INFO) -> None:
    """Configures root and uvicorn loggers to emit structured JSON without duplicate handlers."""
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Replace existing handlers to prevent plain-text duplicate output
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(StructuredJSONFormatter())
    root_logger.addHandler(stream_handler)

    for noisy_logger in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(noisy_logger)
        uv_logger.handlers.clear()
        uv_logger.propagate = True