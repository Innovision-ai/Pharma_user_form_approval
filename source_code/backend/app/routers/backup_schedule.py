"""Backup Schedule router.

Additions:
  - Exclude retired (active=False) equipment
  - Remove last_backup / next_backup from list response (keep in DB, hide from UI via separate fields)
  - backup_path field (via COLUMN_ADDITIONS in schema_compat)
  - frequency is editable on every update-done
  - auth_password required for update-done (e-signature)
  - audit trail per update
  - /planner endpoint
  - type (Equipment.type) and department (Equipment.location) filters
  - search param
  - plant scoping
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_current_plant, verify_current_password
from app.models import BackupScheduleEntry, Equipment, User
from app.audit import log_audit

router = APIRouter(prefix="/api/backup-schedule", tags=["backup-schedule"])


def _active_backup_equipment(
    db: Session,
    plant: Optional[str] = None,
    eq_type: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    include_retired: bool = False,
):
    """Equipment with backup_include=True. Retired systems are listed for their
    history only and never appear in the planner."""
    q = db.query(Equipment).filter(Equipment.backup_include.is_(True))
    if not include_retired:
        q = q.filter(Equipment.active.is_(True))
    if plant:
        q = q.filter(Equipment.plant == plant)
    if eq_type:
        q = q.filter(Equipment.type == eq_type)
    if department:
        q = q.filter(Equipment.location == department)
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(
            (Equipment.name.ilike(like)) |
            (Equipment.equipment_code.ilike(like))
        )
    return q.order_by(Equipment.equipment_code).all()


def _get_or_create_entry(db: Session, equipment_code: str, freq: int = 30) -> BackupScheduleEntry:
    entry = db.query(BackupScheduleEntry).filter(
        BackupScheduleEntry.equipment_code == equipment_code
    ).first()
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
    backup_path = entry.backup_path if entry else None
    return {
        "equipment_code": eq.equipment_code,
        "equipment_name": eq.name,
        "system_type": eq.system_type,
        "type": eq.type,
        "department": eq.location,
        "plant": eq.plant,
        "make": eq.make,
        "computer_system_id": eq.computer_system_id,
        # last_backup_date and next_backup_date removed from UI display but kept in dict for internal use
        "frequency_days": entry.frequency_days if entry else 30,
        "backup_path": backup_path,
        "notes": entry.notes if entry else None,
        "updated_by": entry.updated_by if entry else None,
        "updated_at": entry.updated_at.isoformat() if entry and entry.updated_at else None,
        "active": eq.active,
    }


@router.get("")
def list_backup_schedule(
    type: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    plant: Optional[str] = Depends(get_current_plant),
):
    equips = _active_backup_equipment(db, plant=plant, eq_type=type, department=department, search=search,
                                      include_retired=True)
    rows = []
    for eq in equips:
        entry = db.query(BackupScheduleEntry).filter(
            BackupScheduleEntry.equipment_code == eq.equipment_code
        ).first()
        rows.append(_build_row(eq, entry))
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
    """Return backup schedule planner for a given year (and optionally month)."""
    equips = _active_backup_equipment(db, plant=plant, eq_type=type, department=department)
    rows = []
    for eq in equips:
        entry = db.query(BackupScheduleEntry).filter(
            BackupScheduleEntry.equipment_code == eq.equipment_code
        ).first()
        if not entry or not entry.next_backup_date:
            rows.append(_build_row(eq, entry))
            continue
        next_date = entry.next_backup_date
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
    # E-signature
    verify_current_password(current_user, payload.get("auth_password"))

    eq = db.query(Equipment).filter(Equipment.equipment_code == equipment_code).first()
    if not eq:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")
    if not eq.active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Equipment is retired")

    freq = int(payload.get("frequency_days", 30))
    entry = _get_or_create_entry(db, equipment_code, freq)

    old_freq = entry.frequency_days
    old_path = entry.backup_path
    old_last = entry.last_backup_date

    last_date = date.fromisoformat(payload["last_backup_date"])
    entry.last_backup_date = last_date
    entry.next_backup_date = last_date + timedelta(days=freq)
    entry.frequency_days = freq
    entry.notes = payload.get("notes")
    entry.updated_by = current_user.name

    if "backup_path" in payload:
        entry.backup_path = (payload["backup_path"] or "").strip() or None

    db.commit()
    db.refresh(entry)

    reason = payload.get("reason", "")
    log_audit(
        db, current_user, "BACKUP_UPDATED",
        f"Backup schedule updated for {eq.name} ({equipment_code})" + (f" — {reason}" if reason else ""),
        entity=equipment_code, field="Last Backup Date",
        old=old_last, new=last_date,
        plant=eq.plant,
    )
    if old_freq != freq:
        log_audit(
            db, current_user, "BACKUP_UPDATED",
            f"Backup frequency changed",
            entity=equipment_code, field="Frequency (days)",
            old=str(old_freq), new=str(freq),
            plant=eq.plant, commit=False,
        )
    new_path = entry.backup_path
    if old_path != new_path:
        log_audit(
            db, current_user, "BACKUP_UPDATED",
            f"Backup path changed",
            entity=equipment_code, field="Backup Path",
            old=old_path, new=new_path,
            plant=eq.plant, commit=False,
        )
    db.commit()
    return _build_row(eq, entry)
