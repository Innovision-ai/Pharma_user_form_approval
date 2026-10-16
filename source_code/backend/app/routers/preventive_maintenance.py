"""Preventive Maintenance router.

Additions:
  - Show Computer System ID (already in _build_row)
  - Exclude retired (active=False) equipment
  - auth_password required for update-done (e-signature)
  - Audit trail per update
  - PM History table: PMHistory written on each update-done (new table pm_history via models/schema_compat)
  - /history/{equipment_code} endpoint to view PM history for a system
  - Additional systems not in Equipment: AdditionalPMSystem new table with endpoints
  - /planner endpoint (monthly / yearly)
  - plant scoping
"""
from datetime import date
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import Column, Integer, String, Date, DateTime, Text
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db, Base
from app.deps import get_current_user, get_current_plant, verify_current_password
from app.models import Equipment, PreventiveMaintenanceEntry, User
from app.audit import log_audit

router = APIRouter(prefix="/api/preventive-maintenance", tags=["preventive-maintenance"])


# ---------------------------------------------------------------------------
# Additional local models registered on Base (new tables auto-created by create_all)
# ---------------------------------------------------------------------------

class PMHistory(Base):
    __tablename__ = "pm_history"
    id = Column(Integer, primary_key=True)
    equipment_code = Column(String(20), index=True)
    pm_date = Column(Date)
    frequency_months = Column(Integer)
    notes = Column(Text, nullable=True)
    performed_by = Column(String(120))
    performed_at = Column(DateTime, default=datetime.utcnow)


class AdditionalPMSystem(Base):
    __tablename__ = "additional_pm_systems"
    id = Column(Integer, primary_key=True)
    system_name = Column(String(160))
    system_id = Column(String(60), nullable=True)
    computer_system_id = Column(String(60), nullable=True)
    frequency_months = Column(Integer, default=6)
    plant = Column(String(20), default="P1")
    last_pm_date = Column(Date, nullable=True)
    next_pm_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    updated_by = Column(String(120), default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(120), default="")
    created_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _active_pm_equipment(
    db: Session,
    plant: Optional[str] = None,
):
    """Active equipment with a computer_system_id (PM eligible)."""
    q = db.query(Equipment).filter(
        Equipment.active.is_(True),
        Equipment.computer_system_id.isnot(None),
    )
    if plant:
        q = q.filter(Equipment.plant == plant)
    return q.order_by(Equipment.equipment_code).all()


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
        "department": eq.location,
        "plant": eq.plant,
        "make": eq.make,
        "last_pm_date": entry.last_pm_date.isoformat() if entry and entry.last_pm_date else None,
        "next_pm_date": entry.next_pm_date.isoformat() if entry and entry.next_pm_date else None,
        "frequency_months": entry.frequency_months if entry else 6,
        "notes": entry.notes if entry else None,
        "updated_by": entry.updated_by if entry else None,
        "updated_at": entry.updated_at.isoformat() if entry and entry.updated_at else None,
        "source": "equipment",
    }


def _build_additional_row(sys: AdditionalPMSystem) -> dict:
    return {
        "equipment_code": f"ADD-{sys.id}",
        "equipment_name": sys.system_name,
        "system_type": None,
        "computer_system_id": sys.computer_system_id,
        "system_id": sys.system_id,
        "department": None,
        "plant": sys.plant,
        "make": None,
        "last_pm_date": sys.last_pm_date.isoformat() if sys.last_pm_date else None,
        "next_pm_date": sys.next_pm_date.isoformat() if sys.next_pm_date else None,
        "frequency_months": sys.frequency_months,
        "notes": sys.notes,
        "updated_by": sys.updated_by,
        "updated_at": sys.updated_at.isoformat() if sys.updated_at else None,
        "source": "additional",
        "additional_id": sys.id,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_pm(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    plant: Optional[str] = Depends(get_current_plant),
):
    equips = _active_pm_equipment(db, plant=plant)
    rows = []
    for eq in equips:
        entry = db.query(PreventiveMaintenanceEntry).filter(
            PreventiveMaintenanceEntry.equipment_code == eq.equipment_code
        ).first()
        rows.append(_build_row(eq, entry))

    # Include additional PM systems
    add_q = db.query(AdditionalPMSystem)
    if plant:
        add_q = add_q.filter(AdditionalPMSystem.plant == plant)
    for sys in add_q.all():
        rows.append(_build_additional_row(sys))

    return rows


@router.get("/planner")
def get_planner(
    year: int,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    plant: Optional[str] = Depends(get_current_plant),
):
    """Return PM planner for a given year (and optionally month)."""
    all_rows = list_pm(db=db, current_user=current_user, plant=plant)
    result = []
    for row in all_rows:
        next_date_str = row.get("next_pm_date")
        if not next_date_str:
            result.append(row)
            continue
        next_date = date.fromisoformat(next_date_str)
        if next_date.year == year and (month is None or next_date.month == month):
            result.append(row)
    return result


@router.get("/history/{equipment_code}")
def get_pm_history(
    equipment_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all PM history entries for a given equipment code."""
    records = (
        db.query(PMHistory)
        .filter(PMHistory.equipment_code == equipment_code)
        .order_by(PMHistory.pm_date.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "equipment_code": r.equipment_code,
            "pm_date": r.pm_date.isoformat() if r.pm_date else None,
            "frequency_months": r.frequency_months,
            "notes": r.notes,
            "performed_by": r.performed_by,
            "performed_at": r.performed_at.isoformat() if r.performed_at else None,
        }
        for r in records
    ]


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

    freq = int(payload.get("frequency_months", 6))
    entry = _get_or_create_entry(db, equipment_code, freq)

    old_last = entry.last_pm_date
    last_date = date.fromisoformat(payload["last_pm_date"])
    next_date = last_date + relativedelta(months=freq)

    entry.last_pm_date = last_date
    entry.next_pm_date = next_date
    entry.frequency_months = freq
    entry.notes = payload.get("notes")
    entry.updated_by = current_user.name
    db.commit()
    db.refresh(entry)

    # Write PM history row
    history = PMHistory(
        equipment_code=equipment_code,
        pm_date=last_date,
        frequency_months=freq,
        notes=payload.get("notes"),
        performed_by=current_user.name,
    )
    db.add(history)
    db.commit()

    # Audit
    reason = payload.get("reason", "")
    log_audit(
        db, current_user, "PM_UPDATED",
        f"PM performed for {eq.name} ({equipment_code})" + (f" — {reason}" if reason else ""),
        entity=equipment_code, field="Last PM Date",
        old=old_last.isoformat() if old_last else None,
        new=last_date.isoformat(),
        plant=eq.plant,
    )

    return _build_row(eq, entry)


# ---------------------------------------------------------------------------
# Additional PM Systems CRUD
# ---------------------------------------------------------------------------

@router.get("/additional")
def list_additional_systems(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    plant: Optional[str] = Depends(get_current_plant),
):
    q = db.query(AdditionalPMSystem)
    if plant:
        q = q.filter(AdditionalPMSystem.plant == plant)
    return [_build_additional_row(s) for s in q.all()]


@router.post("/additional", status_code=status.HTTP_201_CREATED)
def add_additional_system(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sys = AdditionalPMSystem(
        system_name=payload["system_name"],
        system_id=payload.get("system_id"),
        computer_system_id=payload.get("computer_system_id"),
        frequency_months=int(payload.get("frequency_months", 6)),
        plant=payload.get("plant", "P1"),
        created_by=current_user.name,
        updated_by=current_user.name,
    )
    db.add(sys)
    db.commit()
    db.refresh(sys)
    log_audit(
        db, current_user, "PM_ADDITIONAL_CREATED",
        f"Additional PM system added: {sys.system_name}",
        entity=f"ADD-{sys.id}", field="Status", old=None, new="Active",
        plant=sys.plant,
    )
    return _build_additional_row(sys)


@router.put("/additional/{system_id}")
def update_additional_system(
    system_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # E-signature
    verify_current_password(current_user, payload.get("auth_password"))

    sys = db.query(AdditionalPMSystem).filter(AdditionalPMSystem.id == system_id).first()
    if not sys:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Additional PM system not found")

    old_snap = {"name": sys.system_name, "freq": sys.frequency_months}
    sys.system_name = payload.get("system_name", sys.system_name)
    sys.system_id = payload.get("system_id", sys.system_id)
    sys.computer_system_id = payload.get("computer_system_id", sys.computer_system_id)
    sys.frequency_months = int(payload.get("frequency_months", sys.frequency_months))
    sys.updated_by = current_user.name

    if "last_pm_date" in payload:
        last_date = date.fromisoformat(payload["last_pm_date"])
        sys.last_pm_date = last_date
        sys.next_pm_date = last_date + relativedelta(months=sys.frequency_months)
        # Write history
        history = PMHistory(
            equipment_code=f"ADD-{sys.id}",
            pm_date=last_date,
            frequency_months=sys.frequency_months,
            notes=payload.get("notes"),
            performed_by=current_user.name,
        )
        db.add(history)

    if payload.get("notes") is not None:
        sys.notes = payload["notes"]

    db.commit()
    db.refresh(sys)

    log_audit(
        db, current_user, "PM_ADDITIONAL_UPDATED",
        f"Additional PM system updated: {sys.system_name}",
        entity=f"ADD-{sys.id}", field="System Name",
        old=old_snap["name"], new=sys.system_name,
        plant=sys.plant,
    )
    return _build_additional_row(sys)


@router.delete("/additional/{system_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_additional_system(
    system_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sys = db.query(AdditionalPMSystem).filter(AdditionalPMSystem.id == system_id).first()
    if not sys:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Additional PM system not found")
    name = sys.system_name
    plant = sys.plant
    db.delete(sys)
    db.commit()
    log_audit(
        db, current_user, "PM_ADDITIONAL_DELETED",
        f"Additional PM system deleted: {name}",
        entity=f"ADD-{system_id}", field="Status", old="Active", new="Deleted",
        plant=plant,
    )
