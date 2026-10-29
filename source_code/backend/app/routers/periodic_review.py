"""Periodic Review router.

Additions:
  - Exclude 'under_validation' equipment from the list
  - Exclude retired (active=False) equipment
  - auth_password required for update-done (e-signature)
  - audit trail per update
  - /due-month and /due-year planner endpoints
  - plant scoping
  - type and department (location) filters
"""
from datetime import date, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_plant, verify_current_password
from app.models import Equipment, PeriodicReviewEntry, User
from app.audit import log_audit

router = APIRouter(prefix="/api/periodic-review", tags=["periodic-review"])


def _active_validated_equipment(
    db: Session,
    plant: Optional[str] = None,
    eq_type: Optional[str] = None,
    department: Optional[str] = None,
    include_retired: bool = False,
):
    """Validated (not under_validation) equipment with a periodic review frequency.
    Retired systems are listed for their history only and never planned."""
    q = (
        db.query(Equipment)
        .filter(
            Equipment.periodic_review_frequency.isnot(None),
            or_(Equipment.validation_status.is_(None), Equipment.validation_status != "under_validation"),
        )
    )
    if not include_retired:
        q = q.filter(Equipment.active.is_(True))
    if plant:
        q = q.filter(Equipment.plant == plant)
    if eq_type:
        q = q.filter(Equipment.type == eq_type)
    if department:
        q = q.filter(Equipment.location == department)
    return q.order_by(Equipment.equipment_code).all()


def _get_or_create_entry(db: Session, equipment_code: str, freq: int) -> PeriodicReviewEntry:
    entry = db.query(PeriodicReviewEntry).filter(
        PeriodicReviewEntry.equipment_code == equipment_code
    ).first()
    if not entry:
        entry = PeriodicReviewEntry(
            equipment_code=equipment_code,
            review_frequency_months=freq,
            updated_by="",
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
    return entry


def _build_row(eq: Equipment, entry: Optional[PeriodicReviewEntry]) -> dict:
    return {
        "equipment_code": eq.equipment_code,
        "equipment_name": eq.name,
        "system_type": eq.system_type,
        "make": eq.make,
        "department": eq.location,
        "type": eq.type,
        "plant": eq.plant,
        "validation_status": eq.validation_status,
        "validation_date": eq.validation_date.isoformat() if eq.validation_date else None,
        "periodic_review_frequency": eq.periodic_review_frequency,
        "last_review_date": entry.last_review_date.isoformat() if entry and entry.last_review_date else None,
        "next_review_date": entry.next_review_date.isoformat() if entry and entry.next_review_date else None,
        "notes": entry.notes if entry else None,
        "updated_by": entry.updated_by if entry else None,
        "updated_at": entry.updated_at.isoformat() if entry and entry.updated_at else None,
        "active": eq.active,
    }


@router.get("")
def list_periodic_review(
    type: Optional[str] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    plant: Optional[str] = Depends(get_current_plant),
):
    equips = _active_validated_equipment(db, plant=plant, eq_type=type, department=department,
                                         include_retired=True)
    rows = []
    for eq in equips:
        entry = db.query(PeriodicReviewEntry).filter(
            PeriodicReviewEntry.equipment_code == eq.equipment_code
        ).first()
        rows.append(_build_row(eq, entry))
    return rows


@router.get("/due")
def list_due(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    plant: Optional[str] = Depends(get_current_plant),
):
    due_threshold = date.today() + timedelta(days=30)
    equips = _active_validated_equipment(db, plant=plant)
    rows = []
    for eq in equips:
        entry = db.query(PeriodicReviewEntry).filter(
            PeriodicReviewEntry.equipment_code == eq.equipment_code
        ).first()
        if entry and entry.next_review_date and entry.next_review_date <= due_threshold:
            rows.append(_build_row(eq, entry))
        elif not entry:
            rows.append(_build_row(eq, None))
    return rows


@router.get("/planner")
def get_planner(
    year: int,
    month: Optional[int] = None,
    type: Optional[str] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    plant: Optional[str] = Depends(get_current_plant),
):
    """Return periodic review planner for a given year (and optionally month)."""
    equips = _active_validated_equipment(db, plant=plant, eq_type=type, department=department)
    rows = []
    for eq in equips:
        entry = db.query(PeriodicReviewEntry).filter(
            PeriodicReviewEntry.equipment_code == eq.equipment_code
        ).first()
        next_date_str = entry.next_review_date if entry else None
        # If no next_review_date, assume due based on last review + freq or just show it
        if not next_date_str:
            rows.append(_build_row(eq, entry))
            continue
        next_date = next_date_str
        if isinstance(next_date, str):
            next_date = date.fromisoformat(next_date)
        if next_date.year == year and (month is None or next_date.month == month):
            rows.append(_build_row(eq, entry))
    return rows


@router.put("/{equipment_code}/update-done")
def update_done(
    equipment_code: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # E-signature: require auth_password
    verify_current_password(current_user, payload.get("auth_password"))

    eq = db.query(Equipment).filter(Equipment.equipment_code == equipment_code).first()
    if not eq:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")
    if not eq.active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Equipment is retired")
    if eq.validation_status == "under_validation":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Under-validation equipment is not in the review list")

    freq = eq.periodic_review_frequency or 12
    entry = _get_or_create_entry(db, equipment_code, freq)

    old_last = entry.last_review_date
    old_next = entry.next_review_date

    last_date = date.fromisoformat(payload["last_review_date"])
    next_date = last_date + relativedelta(months=freq)
    entry.last_review_date = last_date
    entry.next_review_date = next_date
    entry.review_frequency_months = freq
    entry.notes = payload.get("notes")
    entry.updated_by = current_user.name
    db.commit()
    db.refresh(entry)

    # Audit
    reason = payload.get("reason", "")
    log_audit(
        db, current_user, "PERIODIC_REVIEW_UPDATED",
        f"Periodic review updated for {eq.name} ({equipment_code})" + (f" — {reason}" if reason else ""),
        entity=equipment_code, field="Last Review Date",
        old=old_last,
        new=last_date,
        plant=eq.plant,
    )
    log_audit(
        db, current_user, "PERIODIC_REVIEW_UPDATED",
        f"Next review date updated",
        entity=equipment_code, field="Next Review Date",
        old=old_next,
        new=next_date,
        plant=eq.plant,
        commit=False,
    )
    db.commit()

    return _build_row(eq, entry)
