from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_role
from app.constants import ROLE_ADMIN
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate
from app.audit import log_audit, diff_and_log

router = APIRouter(prefix="/api/users", tags=["users"])

FIELD_LABELS = {
    "name": "Name",
    "email": "Email",
    "department": "Department",
    "plant": "Primary Plant",
    "plants": "Plant Access",
    "role": "Role",
    "active": "Active",
}


def _user_snap(user: User) -> dict:
    return {
        "name": user.name,
        "email": user.email,
        "department": user.department,
        "plant": user.plant,
        "plants": user.plants or "",
        "role": user.role,
        "active": user.active,
    }


@router.get("/me", response_model=UserOut)
def whoami(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("", response_model=list[UserOut])
def list_users(
    role: Optional[str] = None,
    plant: Optional[str] = None,
    active: Optional[bool] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if plant:
        q = q.filter(User.plant == plant)
    if active is not None:
        q = q.filter(User.active.is_(active))
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(
            (User.name.ilike(like)) |
            (User.employee_id.ilike(like)) |
            (User.email.ilike(like)) |
            (User.department.ilike(like))
        )
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
    user_data = data.model_dump()
    plants_list = user_data.pop("plants", [])
    password = user_data.pop("password", None)

    user = User(**user_data)
    user.plants = ",".join(plants_list) if plants_list else None

    if password:
        from app.auth import get_password_hash
        user.hashed_password = get_password_hash(password)

    db.add(user)
    db.commit()
    db.refresh(user)
    log_audit(
        db, current_user, "USER_CREATED",
        f"Created user {user.employee_id}: {user.name} ({user.role})",
        entity=user.employee_id, field="Status", old=None, new="Active",
    )
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

    old_snap = _user_snap(user)

    user_data = data.model_dump()
    plants_list = user_data.pop("plants", [])
    for field, value in user_data.items():
        setattr(user, field, value)
    user.plants = ",".join(plants_list) if plants_list else None

    new_snap = _user_snap(user)
    db.commit()
    db.refresh(user)

    diff_and_log(
        db, current_user, "USER_UPDATED",
        f"User {user.employee_id}",
        old_snap, new_snap,
        labels=FIELD_LABELS,
    )
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
    old_active = user.active
    user.active = not user.active
    db.commit()
    db.refresh(user)
    old_label = "Active" if old_active else "Inactive"
    new_label = "Active" if user.active else "Inactive"
    log_audit(
        db, current_user, "USER_STATUS_CHANGED",
        f"User {user.employee_id} status changed from {old_label} to {new_label}",
        entity=user.employee_id, field="Status",
        old=old_label, new=new_label,
    )
    return {"employee_id": user.employee_id, "active": user.active}
