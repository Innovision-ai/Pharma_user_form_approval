from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import BackupScheduleEntry, Equipment, User

router = APIRouter(prefix="/api/backup-schedule", tags=["backup-schedule"])


def _get_or_create_entry(db: Session, equipment_code: str, freq: int = 30) -> BackupScheduleEntry:
    entry = db.query(BackupScheduleEntry).filter(BackupScheduleEntry.equipment_code == equipment_code).first()
    if not entry:
        entry = BackupScheduleEntry(
            equipment_code=equipment_code,
            frequency_days=freq,
            updated_by="",
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
    return entry


def _build_row(eq: Equipment, entry: Optional[BackupScheduleEntry]) -> dict:
    return {
        "equipment_code": eq.equipment_code,
        "equipment_name": eq.name,
        "system_type": eq.system_type,
        "make": eq.make,
        "last_backup_date": entry.last_backup_date.isoformat() if entry and entry.last_backup_date else None,
        "next_backup_date": entry.next_backup_date.isoformat() if entry and entry.next_backup_date else None,
        "frequency_days": entry.frequency_days if entry else 30,
        "notes": entry.notes if entry else None,
        "updated_by": entry.updated_by if entry else None,
        "updated_at": entry.updated_at.isoformat() if entry and entry.updated_at else None,
    }


@router.get("")
def list_backup_schedule(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    equips = (
        db.query(Equipment)
        .filter(Equipment.active.is_(True), Equipment.backup_include.is_(True))
        .order_by(Equipment.equipment_code)
        .all()
    )
    rows = []
    for eq in equips:
        entry = db.query(BackupScheduleEntry).filter(BackupScheduleEntry.equipment_code == eq.equipment_code).first()
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
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only IT or ADMIN can update backup dates")
    eq = db.query(Equipment).filter(Equipment.equipment_code == equipment_code).first()
    if not eq:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")

    freq = payload.get("frequency_days", 30)
    entry = _get_or_create_entry(db, equipment_code, freq)

    last_date = date.fromisoformat(payload["last_backup_date"])
    entry.last_backup_date = last_date
    entry.next_backup_date = last_date + timedelta(days=freq)
    entry.frequency_days = freq
    entry.notes = payload.get("notes")
    entry.updated_by = current_user.name
    db.commit()
    db.refresh(entry)
    return _build_row(eq, entry)
