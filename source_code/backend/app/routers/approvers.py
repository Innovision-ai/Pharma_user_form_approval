from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_role
from app.constants import ROLE_ADMIN
from app.models import Approver, User
from app.schemas import ApproverCreate, ApproverOut, ApproverUpdate, StatusToggle

router = APIRouter(prefix="/api/approvers", tags=["approvers"])


@router.get("", response_model=list[ApproverOut])
def list_approvers(type: Optional[str] = None, active_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(Approver)
    if type:
        q = q.filter(Approver.type == type)
    if active_only:
        q = q.filter(Approver.active.is_(True))
    return q.order_by(Approver.type, Approver.name).all()


def _next_approver_code(db: Session, approver_type: str) -> str:
    prefix = approver_type
    existing = (
        db.query(Approver)
        .filter(Approver.approver_code.like(f"{prefix}%"))
        .order_by(Approver.id.desc())
        .first()
    )
    next_seq = 1
    if existing is not None:
        try:
            next_seq = int(existing.approver_code.replace(prefix, "")) + 1
        except ValueError:
            next_seq = existing.id + 1
    return f"{prefix}{next_seq:03d}"


@router.post("", response_model=ApproverOut, status_code=status.HTTP_201_CREATED)
def create_approver(
    payload: ApproverCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    item = Approver(
        approver_code=_next_approver_code(db, payload.type),
        name=payload.name,
        type=payload.type,
        department=payload.department,
        email=payload.email,
        active=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _get_or_404(db: Session, code: str) -> Approver:
    item = db.query(Approver).filter(Approver.approver_code == code).first()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Approver not found")
    return item


@router.put("/{code}", response_model=ApproverOut)
def update_approver(
    code: str,
    payload: ApproverUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    item = _get_or_404(db, code)
    item.name = payload.name
    item.department = payload.department
    item.email = payload.email
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{code}/status", response_model=ApproverOut)
def toggle_approver_status(
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
