from datetime import date, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Equipment, PeriodicReviewEntry, User

router = APIRouter(prefix="/api/periodic-review", tags=["periodic-review"])


def _get_or_create_entry(db: Session, equipment_code: str, freq: int) -> PeriodicReviewEntry:
    entry = db.query(PeriodicReviewEntry).filter(PeriodicReviewEntry.equipment_code == equipment_code).first()
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
        "validation_status": eq.validation_status,
        "validation_date": eq.validation_date.isoformat() if eq.validation_date else None,
        "periodic_review_frequency": eq.periodic_review_frequency,
        "last_review_date": entry.last_review_date.isoformat() if entry and entry.last_review_date else None,
        "next_review_date": entry.next_review_date.isoformat() if entry and entry.next_review_date else None,
        "notes": entry.notes if entry else None,
        "updated_by": entry.updated_by if entry else None,
        "updated_at": entry.updated_at.isoformat() if entry and entry.updated_at else None,
    }


@router.get("")
def list_periodic_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    equips = (
        db.query(Equipment)
        .filter(
            Equipment.active.is_(True),
            Equipment.periodic_review_frequency.isnot(None),
        )
        .order_by(Equipment.equipment_code)
        .all()
    )
    rows = []
    for eq in equips:
        entry = db.query(PeriodicReviewEntry).filter(PeriodicReviewEntry.equipment_code == eq.equipment_code).first()
        rows.append(_build_row(eq, entry))
    return rows


@router.get("/due")
def list_due(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    due_threshold = date.today() + timedelta(days=30)
    equips = (
        db.query(Equipment)
        .filter(Equipment.active.is_(True), Equipment.periodic_review_frequency.isnot(None))
        .all()
    )
    rows = []
    for eq in equips:
        entry = db.query(PeriodicReviewEntry).filter(PeriodicReviewEntry.equipment_code == eq.equipment_code).first()
        if entry and entry.next_review_date and entry.next_review_date <= due_threshold:
            rows.append(_build_row(eq, entry))
        elif not entry:
            rows.append(_build_row(eq, None))
    return rows


@router.put("/{equipment_code}/update-done")
def update_done(
    equipment_code: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("IT", "ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only IT or ADMIN can update review dates")
    eq = db.query(Equipment).filter(Equipment.equipment_code == equipment_code).first()
    if not eq:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")

    freq = eq.periodic_review_frequency or 12
    entry = _get_or_create_entry(db, equipment_code, freq)

    last_date = date.fromisoformat(payload["last_review_date"])
    next_date = last_date + relativedelta(months=freq)
    entry.last_review_date = last_date
    entry.next_review_date = next_date
    entry.review_frequency_months = freq
    entry.notes = payload.get("notes")
    entry.updated_by = current_user.name
    db.commit()
    db.refresh(entry)
    return _build_row(eq, entry)
