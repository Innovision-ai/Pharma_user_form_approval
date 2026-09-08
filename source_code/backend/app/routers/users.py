from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_role
from app.constants import ROLE_ADMIN
from app.models import AuditLog, User
from app.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


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


@router.get("/me", response_model=UserOut)
def whoami(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("", response_model=list[UserOut])
def list_users(
    role: Optional[str] = None,
    plant: Optional[str] = None,
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if plant:
        q = q.filter(User.plant == plant)
    if active is not None:
        q = q.filter(User.active.is_(active))
    return q.order_by(User.employee_id).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    if db.query(User).filter(User.employee_id == data.employee_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this employee ID already exists",
        )
    user = User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    _log_audit(db, current_user, "USER_CREATED", f"Created user {user.employee_id}: {user.name} ({user.role})")
    return user


@router.get("/{employee_id}", response_model=UserOut)
def get_user(employee_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.put("/{employee_id}", response_model=UserOut)
def update_user(
    employee_id: str,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    for field, value in data.model_dump().items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    _log_audit(db, current_user, "USER_UPDATED", f"Updated user {user.employee_id}: {user.name}")
    return user


@router.patch("/{employee_id}/status")
def toggle_user_status(
    employee_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.active = not user.active
    db.commit()
    db.refresh(user)
    status_text = "activated" if user.active else "deactivated"
    _log_audit(db, current_user, "USER_STATUS_CHANGED", f"User {user.employee_id} {status_text} by {current_user.name}")
    return {"employee_id": user.employee_id, "active": user.active}
