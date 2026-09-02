from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User


def get_current_user(
    x_demo_user: Optional[str] = Header(default=None, alias="X-Demo-User"),
    db: Session = Depends(get_db),
) -> User:
    """Stands in for real authentication.

    The frontend's demo user switcher sends the chosen employee_id on every
    request via this header - see README "How login works" for why this is
    enough to demonstrate the full workflow without real auth.
    """
    if not x_demo_user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No demo user selected")

    user = db.query(User).filter(User.employee_id == x_demo_user).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown demo user")
    if not user.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This demo user is inactive")
    return user


def require_role(*roles: str):
    def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action requires role {', '.join(roles)}, not {user.role}",
            )
        return user

    return _check
