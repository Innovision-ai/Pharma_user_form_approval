"""Shared rules for PM, periodic review and backup schedules.

- Due dates are one day before the anniversary: PM done 02/11/26 with a
  12-month frequency is due 01/11/27.
- A completion date cannot be in the future.
- Completing a task after its due date requires Breakdown / QMS details and a
  deviation number (attachment optional).
- Reminder notifications: 15 days before PM, 90 days before periodic review.
"""
from datetime import date, datetime, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.timeutil import local_today
from app.models import Attachment, Equipment, Notification, PeriodicReviewEntry, PreventiveMaintenanceEntry

PM_REMINDER_DAYS = 15
PERIODIC_REVIEW_REMINDER_DAYS = 90
# First periodic review when the equipment has no frequency configured: 3 years.
DEFAULT_PERIODIC_REVIEW_MONTHS = 36


def next_due(done: date, months: int) -> date:
    """Due date `months` after `done`, minus one day."""
    return done + relativedelta(months=months) - timedelta(days=1)


def first_periodic_review_due(eq: Equipment) -> Optional[date]:
    """No review recorded yet: due from the validation (completion) date."""
    base = eq.validation_date or eq.latest_validation_date or eq.initial_validation_date
    if not base:
        return None
    return next_due(base, eq.periodic_review_frequency or DEFAULT_PERIODIC_REVIEW_MONTHS)


def require_not_future(done: date, label: str = "Done date") -> None:
    if done > local_today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} cannot be later than today")


def parse_utc(value: str) -> datetime:
    """ISO datetime from the browser (with offset, e.g. toISOString) -> naive UTC."""
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid date/time")
    if dt.tzinfo is not None:
        dt = (dt - dt.utcoffset()).replace(tzinfo=None)
    return dt


def require_not_future_dt(done_utc: datetime, label: str = "Backup date/time") -> None:
    # Small allowance for clock skew between browser and server
    if done_utc > datetime.utcnow() + timedelta(minutes=5):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} cannot be in the future")


def overdue_details(db: Session, payload: dict, due: Optional[date]) -> dict:
    """If the task is past its due date, Breakdown/QMS details and a deviation
    number are mandatory before it can be completed. Returns the fields to store."""
    is_overdue = bool(due and local_today() > due)
    details = (payload.get("breakdown_details") or "").strip()
    deviation = (payload.get("deviation_no") or "").strip()
    attachment_id = payload.get("attachment_id")
    if is_overdue and (not details or not deviation):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"This task was due on {due.strftime('%d/%m/%Y')} and is overdue. Enter the Breakdown / QMS "
            "details and the deviation number before completing it.",
        )
    if attachment_id is not None:
        if not db.query(Attachment.id).filter(Attachment.id == int(attachment_id)).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Attachment not found")
        attachment_id = int(attachment_id)
    return {
        "overdue": is_overdue,
        "breakdown_details": details or None,
        "deviation_no": deviation or None,
        "attachment_id": attachment_id,
    }


def _notify_once(db: Session, code: str, ntype: str, subject: str, body: str) -> bool:
    if db.query(Notification.id).filter(Notification.request_code == code, Notification.type == ntype).first():
        return False
    db.add(Notification(
        request_code=code[:20], recipient_name="IT Executor", recipient_email="it.support@company.com",
        subject=subject, body=body, type=ntype, status="PENDING",
    ))
    return True


def sweep_schedule_notifications(db: Session) -> int:
    """Raise PM (15 days) and periodic review (90 days) due reminders once per due date."""
    today = local_today()
    raised = 0
    pm_window = today + timedelta(days=PM_REMINDER_DAYS)
    for entry, eq in (
        db.query(PreventiveMaintenanceEntry, Equipment)
        .join(Equipment, Equipment.equipment_code == PreventiveMaintenanceEntry.equipment_code)
        .filter(Equipment.active.is_(True), PreventiveMaintenanceEntry.next_pm_date.isnot(None),
                PreventiveMaintenanceEntry.next_pm_date <= pm_window)
        .all()
    ):
        due = entry.next_pm_date
        raised += _notify_once(
            db, f"PM{entry.id}-{due:%y%m%d}", "PM_DUE",
            f"PM due {due:%d/%m/%Y}: {eq.name} ({eq.equipment_code})",
            f"Preventive maintenance for {eq.name} ({eq.equipment_code}, plant {eq.plant}) is due on "
            f"{due:%d/%m/%Y}" + (" and is overdue." if due < today else "."),
        )

    pr_window = today + timedelta(days=PERIODIC_REVIEW_REMINDER_DAYS)
    equips = db.query(Equipment).filter(
        Equipment.active.is_(True),
        (Equipment.validation_status.is_(None)) | (Equipment.validation_status != "under_validation"),
    ).all()
    entries = {e.equipment_code: e for e in db.query(PeriodicReviewEntry).all()}
    for eq in equips:
        entry = entries.get(eq.equipment_code)
        due = entry.next_review_date if entry and entry.next_review_date else first_periodic_review_due(eq)
        if not due or due > pr_window:
            continue
        raised += _notify_once(
            db, f"PR{eq.id}-{due:%y%m%d}", "PERIODIC_REVIEW_DUE",
            f"Periodic review due {due:%d/%m/%Y}: {eq.name} ({eq.equipment_code})",
            f"The periodic review of {eq.name} ({eq.equipment_code}, plant {eq.plant}) is due on "
            f"{due:%d/%m/%Y}" + (" and is overdue." if due < today else "."),
        )
    if raised:
        db.commit()
    return raised
