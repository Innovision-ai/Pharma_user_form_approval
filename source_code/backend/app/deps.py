from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.auth import SECRET_KEY, ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        employee_id: str = payload.get("sub")
        if employee_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.employee_id == employee_id).first()
    if user is None:
        raise credentials_exception
    if not user.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This user is inactive")
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


def get_current_plant(
    token: str = Depends(oauth2_scheme),
) -> Optional[str]:
    """Plant selected at login (stored in the JWT). None = no plant scoping (legacy tokens)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    return payload.get("plant") or None


def verify_current_password(user: User, password: Optional[str]) -> None:
    """Re-authentication ("e-signature") check: raises 401 unless `password` is the
    logged-in user's account password (or their action PIN for legacy accounts)."""
    from app.auth import verify_password

    if not password:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Password is required to perform this action")
    ok = False
    try:
        ok = bool(user.hashed_password) and verify_password(password, user.hashed_password)
    except Exception:  # noqa: BLE001
        ok = False
    if not ok and user.action_pin and password == user.action_pin:
        ok = True
    if not ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
