from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    """Powers the demo login screen - every seeded identity, active first."""
    return (
        db.query(User)
        .order_by(User.active.desc(), User.role, User.name)
        .all()
    )


@router.get("/me", response_model=UserOut)
def whoami(current_user: User = Depends(get_current_user)):
    return current_user
