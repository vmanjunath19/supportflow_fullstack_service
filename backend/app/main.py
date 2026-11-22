import logging
import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import classification, health, webhooks
from app.routers.webhooks import get_supabase_admin
from app.services.sla_escalation import run_sla_escalation_sweep
from app.services.retry_queue import process_retry_queue


load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("supportflow.main")

SLA_POLL_INTERVAL_SECONDS = int(os.getenv("SLA_POLL_INTERVAL_SECONDS", "60"))
RETRY_POLL_INTERVAL_SECONDS = int(os.getenv("RETRY_POLL_INTERVAL_SECONDS", "30"))
scheduler = AsyncIOScheduler()


async def scheduled_sla_job() -> None:
    try:
        supabase = get_supabase_admin()
        await run_sla_escalation_sweep(supabase)
    except Exception:
        logger.exception("Scheduled SLA escalation sweep failed")

async def scheduled_retry_job() -> None:
    try:
        supabase = get_supabase_admin()
        await process_retry_queue(supabase)
    except Exception:
        logger.exception("Scheduled retry queue sweep failed")

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        scheduled_sla_job,
        trigger=IntervalTrigger(seconds=SLA_POLL_INTERVAL_SECONDS),
        id="sla_breach_escalation_worker",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        scheduled_retry_job,
        trigger=IntervalTrigger(seconds=RETRY_POLL_INTERVAL_SECONDS),
        id="webhook_retry_dlq_worker",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info(
        "APScheduler workers started (sla_interval=%ss, retry_interval=%ss)",
        SLA_POLL_INTERVAL_SECONDS,
        RETRY_POLL_INTERVAL_SECONDS,
    )
    yield
    scheduler.shutdown(wait=False)
    logger.info("APScheduler workers stopped")


app = FastAPI(
    title="SupportFlow Automation & Routing Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["Webhooks"])
app.include_router(health.router)
app.include_router(classification.router, prefix="/api/v1/tickets", tags=["Classification"])


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "sla_worker_running": scheduler.running,
        "sla_poll_interval_seconds": SLA_POLL_INTERVAL_SECONDS,
    }


@app.post("/api/v1/workers/sla-sweep", tags=["Workers"])
async def trigger_manual_sla_sweep():
    """Allows immediate manual triggering of the SLA breach & warning sweep."""
    supabase = get_supabase_admin()
    return await run_sla_escalation_sweep(supabase)

@app.post("/api/v1/workers/retry-sweep", tags=["Workers"])
async def trigger_manual_retry_sweep():
    """Immediately processes due items in `webhook_dead_letters`."""
    supabase = get_supabase_admin()
    return await process_retry_queue(supabase)


@app.get("/api/v1/workers/dead-letters", tags=["Workers"])
async def list_dead_letter_entries(status_filter: str | None = None):
    """Lists queued, recovered, and dead-lettered external dispatch records."""
    supabase = get_supabase_admin()
    query = supabase.table("webhook_dead_letters").select("*").order("created_at", desc=True).limit(50)
    if status_filter:
        query = query.eq("status", status_filter)
    resp = query.execute()
    items = resp.data or []
    return {"count": len(items), "items": items}

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting SupportFlow FastAPI automation microservice")
    yield
    logger.info("Shutting down SupportFlow FastAPI automation microservice")

from app.routers import classification, health, webhooks