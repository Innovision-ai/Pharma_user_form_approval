from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


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
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.employee_id == data.employee_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this employee ID already exists",
        )
    user = User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{employee_id}", response_model=UserOut)
def get_user(employee_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.put("/{employee_id}", response_model=UserOut)
def update_user(employee_id: str, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    for field, value in data.model_dump().items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{employee_id}/status")
def toggle_user_status(employee_id: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.active = not user.active
    db.commit()
    db.refresh(user)
    return {"employee_id": user.employee_id, "active": user.active}
