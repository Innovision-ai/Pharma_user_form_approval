from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import password_policy
from app.database import get_db
from app.deps import get_current_plant, get_current_user, get_optional_plant, require_role
from app.constants import ROLE_ADMIN
from app.models import User
from app.schemas import UserCreate, UserImportRequest, UserOut, UserUpdate
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
def whoami(
    current_user: User = Depends(get_current_user),
    plant: Optional[str] = Depends(get_current_plant),
):
    out = UserOut.model_validate(current_user)
    out.selected_plant = plant
    out.password_expired = password_policy.is_expired(current_user)
    return out


def _check_new_password(password: Optional[str]) -> None:
    if password:
        err = password_policy.validate_complexity(password)
        if err:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, err)


@router.get("", response_model=list[UserOut])
def list_users(
    role: Optional[str] = None,
    plant: Optional[str] = None,
    active: Optional[bool] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    token_plant: Optional[str] = Depends(get_optional_plant),
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
    users = q.order_by(User.employee_id).all()
    if token_plant:
        # Plant-wise segregation: only users who have access to the login plant
        users = [u for u in users if token_plant in u.plants_list()]
    return users


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
    _check_new_password(password)

    user = User(**user_data)
    user.plants = ",".join(plants_list) if plants_list else None

    if password:
        password_policy.apply_new_password(user, password)

    db.add(user)
    db.commit()
    db.refresh(user)
    log_audit(
        db, current_user, "USER_CREATED",
        f"Created user {user.employee_id}: {user.name} ({user.role})",
        entity=user.employee_id, field="Status", old=None, new="Active",
    )
    return user


@router.post("/import")
def import_users(
    data: UserImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    """Option 2 of user creation: users fetched from Active Directory / ERP.
    Takes the directory export (CSV parsed by the UI); existing usernames are skipped."""
    created, skipped, errors = [], [], []
    for row in data.users:
        if db.query(User).filter(User.employee_id == row.employee_id).first():
            skipped.append(row.employee_id)
            continue
        if row.password:
            err = password_policy.validate_complexity(row.password)
            if err:
                errors.append(f"{row.employee_id}: {err}")
                continue
        plants = row.plants or [row.plant]
        user = User(
            employee_id=row.employee_id, name=row.name, email=row.email,
            department=row.department, plant=row.plant, plants=",".join(plants),
            role=row.role, active=True, auth_source="DIRECTORY",
        )
        if row.password:
            password_policy.apply_new_password(user, row.password)
        db.add(user)
        db.flush()
        log_audit(db, current_user, "USER_IMPORTED",
                  f"Imported user {user.employee_id}: {user.name} ({user.role}) from AD/ERP",
                  entity=user.employee_id, field="Status", old=None, new="Active", commit=False)
        created.append(row.employee_id)
    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}


@router.get("/{employee_id}/access")
def user_equipment_access(
    employee_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Equipment on which this user's ID has been created (from completed requests)."""
    from app.access import user_access

    if not db.query(User).filter(User.employee_id == employee_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user_access(db, employee_id=employee_id)


@router.post("/{employee_id}/unlock")
def unlock_user(
    employee_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.locked = False
    user.failed_attempts = 0
    db.commit()
    log_audit(db, current_user, "USER_UNLOCKED", f"User {employee_id} unlocked",
              entity=employee_id, field="Account Lock", old="Locked", new="Unlocked")
    return {"employee_id": employee_id, "locked": False}


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
