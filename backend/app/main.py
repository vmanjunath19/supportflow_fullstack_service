import logging
import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app.routers import webhooks
from app.routers.webhooks import get_supabase_admin
from app.services.sla_escalation import run_sla_escalation_sweep

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("supportflow.main")

SLA_POLL_INTERVAL_SECONDS = int(os.getenv("SLA_POLL_INTERVAL_SECONDS", "60"))
scheduler = AsyncIOScheduler()


async def scheduled_sla_job() -> None:
    try:
        supabase = get_supabase_admin()
        await run_sla_escalation_sweep(supabase)
    except Exception:
        logger.exception("Scheduled SLA escalation sweep failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        scheduled_sla_job,
        trigger=IntervalTrigger(seconds=SLA_POLL_INTERVAL_SECONDS),
        id="sla_breach_escalation_worker",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info("APScheduler SLA worker started (interval=%ss)", SLA_POLL_INTERVAL_SECONDS)
    yield
    scheduler.shutdown(wait=False)
    logger.info("APScheduler SLA worker stopped")


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

app.include_router(webhooks.router)


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