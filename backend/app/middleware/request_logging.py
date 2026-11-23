import logging
import time
from typing import Callable
from uuid import uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.logging import correlation_id_ctx, mask_sensitive_data

logger = logging.getLogger("supportflow.http")


class CorrelationLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        incoming_cid = request.headers.get("X-Correlation-ID", "").strip()
        correlation_id = incoming_cid or str(uuid4())
        token = correlation_id_ctx.set(correlation_id)

        request.state.correlation_id = correlation_id
        request.state.decision_metadata = {}

        start_ns = time.perf_counter_ns()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000, 3)
            logger.exception(
                "http_request_failed",
                extra={
                    "correlation_id": correlation_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                    "headers": mask_sensitive_data(dict(request.headers)),
                },
            )
            correlation_id_ctx.reset(token)
            raise

        duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000, 3)
        response.headers["X-Correlation-ID"] = correlation_id

        decision_meta = getattr(request.state, "decision_metadata", None) or {}
        logger.info(
            "http_request_completed",
            extra={
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "decision": decision_meta if decision_meta else None,
            },
        )
        correlation_id_ctx.reset(token)
        return response