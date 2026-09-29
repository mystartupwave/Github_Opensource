import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers import activity, auth, customize, followups, leads, public, reports, settings, users
from .seed import seed_defaults
from .services import check_followup_reminders

log = logging.getLogger("crm")


async def _reminder_loop():
    """Every minute, turn due/overdue follow-ups into in-app notifications."""
    while True:
        try:
            with SessionLocal() as db:
                await asyncio.to_thread(check_followup_reminders, db)
        except Exception:  # keep the loop alive; one bad tick shouldn't stop reminders
            log.exception("follow-up reminder check failed")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_defaults(db)
    task = asyncio.create_task(_reminder_loop())
    yield
    task.cancel()


app = FastAPI(title="CRM API", version="1.0.0", lifespan=lifespan)

# Auth uses bearer tokens (no cookies), so a wildcard origin is safe and lets website forms post leads.
origins = [o.strip() for o in os.getenv("CRM_CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["Content-Disposition"])

for r in (auth, users, customize, leads, followups, activity, reports, settings, public):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"ok": True}
