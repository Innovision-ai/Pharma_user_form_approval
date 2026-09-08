from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_role
from app.constants import ROLE_ADMIN
from app.models import AuditLog, Equipment, User
from app.schemas import EquipmentCreate, EquipmentOut, EquipmentUpdate, StatusToggle

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentOut])
def list_equipment(
    active_only: bool = False,
    plant: Optional[str] = None,
    type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Equipment)
    if active_only:
        q = q.filter(Equipment.active.is_(True))
    if plant:
        q = q.filter(Equipment.plant == plant)
    if type:
        q = q.filter(Equipment.type == type)
    return q.order_by(Equipment.equipment_code).all()


def _log_audit(db: Session, user: User, action: str, description: str, request_code: Optional[str] = None) -> None:
    log = AuditLog(
        request_code=request_code,
        user_employee_id=user.employee_id,
        user_name=user.name,
        action=action,
        description=description,
    )
    db.add(log)
    db.commit()


def _next_equipment_code(db: Session) -> str:
    last = db.query(Equipment).order_by(Equipment.id.desc()).first()
    next_seq = 1
    if last is not None:
        try:
            next_seq = int(last.equipment_code.split("-")[1]) + 1
        except (IndexError, ValueError):
            next_seq = last.id + 1
    return f"EQ-{next_seq:03d}"


@router.post("", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    item = Equipment(
        equipment_code=_next_equipment_code(db),
        name=payload.name,
        type=payload.type,
        location=payload.location,
        plant=payload.plant,
        allowed_roles=",".join(payload.allowed_roles),
        validation_date=payload.validation_date,
        active=True,
        created_by=current_user.name,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    _log_audit(db, current_user, "EQUIPMENT_CREATED", f"Created equipment {item.equipment_code}: {item.name}")
    return item


def _get_or_404(db: Session, code: str) -> Equipment:
    item = db.query(Equipment).filter(Equipment.equipment_code == code).first()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")
    return item


@router.put("/{code}", response_model=EquipmentOut)
def update_equipment(
    code: str,
    payload: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    item = _get_or_404(db, code)
    item.name = payload.name
    item.type = payload.type
    item.location = payload.location
    item.plant = payload.plant
    item.allowed_roles = ",".join(payload.allowed_roles)
    item.validation_date = payload.validation_date
    db.commit()
    db.refresh(item)
    _log_audit(db, current_user, "EQUIPMENT_UPDATED", f"Updated equipment {item.equipment_code}: {item.name}")
    return item


@router.patch("/{code}/status", response_model=EquipmentOut)
def toggle_equipment_status(
    code: str,
    payload: StatusToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    item = _get_or_404(db, code)
    item.active = payload.active
    db.commit()
    db.refresh(item)
    status_text = "activated" if item.active else "deactivated"
    _log_audit(db, current_user, "EQUIPMENT_STATUS_CHANGED", f"Equipment {item.equipment_code} {status_text} by {current_user.name}")
    return item
