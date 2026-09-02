from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_role
from app.constants import ROLE_ADMIN
from app.models import Equipment, User
from app.schemas import EquipmentCreate, EquipmentOut, EquipmentUpdate, StatusToggle

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentOut])
def list_equipment(active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(Equipment)
    if active_only:
        q = q.filter(Equipment.active.is_(True))
    return q.order_by(Equipment.equipment_code).all()


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
        location=payload.location,
        allowed_roles=",".join(payload.allowed_roles),
        validation_date=payload.validation_date,
        active=True,
        created_by=current_user.name,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
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
    item.location = payload.location
    item.allowed_roles = ",".join(payload.allowed_roles)
    item.validation_date = payload.validation_date
    db.commit()
    db.refresh(item)
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
    return item
