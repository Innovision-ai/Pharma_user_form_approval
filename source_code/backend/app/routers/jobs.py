"""Scheduled work. The same sweeps also run on dashboard / notification / request
list loads, so nothing depends on an external scheduler; this endpoint lets a
cron (e.g. Vercel Cron or the company's scheduler) trigger them daily too.
If JOBS_TOKEN is set, callers must send it as `X-Jobs-Token`."""
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.api_route("/run", methods=["GET", "POST"])
def run_jobs(db: Session = Depends(get_db), x_jobs_token: Optional[str] = Header(default=None)):
    expected = os.getenv("JOBS_TOKEN")
    if expected and x_jobs_token != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid jobs token")
    from app.routers.password_vault import sweep_expiry_notifications
    from app.routers.uam_requests import sweep_temporary_logins
    from app.scheduling import sweep_schedule_notifications

    return {
        "auto_deactivation_requests": sweep_temporary_logins(db),
        "schedule_notifications": sweep_schedule_notifications(db),
        "vault_notifications": sweep_expiry_notifications(db),
    }
