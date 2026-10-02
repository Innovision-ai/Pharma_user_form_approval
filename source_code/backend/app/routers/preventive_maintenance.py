from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Equipment, PreventiveMaintenanceEntry, User

router = APIRouter(prefix="/api/preventive-maintenance", tags=["preventive-maintenance"])


def _get_or_create_entry(db: Session, equipment_code: str, freq: int = 6) -> PreventiveMaintenanceEntry:
    entry = db.query(PreventiveMaintenanceEntry).filter(
        PreventiveMaintenanceEntry.equipment_code == equipment_code
    ).first()
    if not entry:
        entry = PreventiveMaintenanceEntry(
            equipment_code=equipment_code,
            frequency_months=freq,
            updated_by="",
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
    return entry


def _build_row(eq: Equipment, entry: Optional[PreventiveMaintenanceEntry]) -> dict:
    return {
        "equipment_code": eq.equipment_code,
        "equipment_name": eq.name,
        "system_type": eq.system_type,
        "computer_system_id": eq.computer_system_id,
        "make": eq.make,
        "last_pm_date": entry.last_pm_date.isoformat() if entry and entry.last_pm_date else None,
        "next_pm_date": entry.next_pm_date.isoformat() if entry and entry.next_pm_date else None,
        "frequency_months": entry.frequency_months if entry else 6,
        "notes": entry.notes if entry else None,
        "updated_by": entry.updated_by if entry else None,
        "updated_at": entry.updated_at.isoformat() if entry and entry.updated_at else None,
    }


@router.get("")
def list_pm(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    equips = (
        db.query(Equipment)
        .filter(Equipment.active.is_(True), Equipment.computer_system_id.isnot(None))
        .order_by(Equipment.equipment_code)
        .all()
    )
    rows = []
    for eq in equips:
        entry = db.query(PreventiveMaintenanceEntry).filter(
            PreventiveMaintenanceEntry.equipment_code == eq.equipment_code
        ).first()
        rows.append(_build_row(eq, entry))
    return rows


@router.put("/{equipment_code}/update-done")
def update_done(
    equipment_code: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("IT", "ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only IT or ADMIN can update PM dates")
    eq = db.query(Equipment).filter(Equipment.equipment_code == equipment_code).first()
    if not eq:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")

    freq = payload.get("frequency_months", 6)
    entry = _get_or_create_entry(db, equipment_code, freq)

    last_date = date.fromisoformat(payload["last_pm_date"])
    entry.last_pm_date = last_date
    entry.next_pm_date = last_date + relativedelta(months=freq)
    entry.frequency_months = freq
    entry.notes = payload.get("notes")
    entry.updated_by = current_user.name
    db.commit()
    db.refresh(entry)
    return _build_row(eq, entry)
