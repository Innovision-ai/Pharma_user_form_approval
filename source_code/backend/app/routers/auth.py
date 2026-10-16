from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import password_policy
from app.audit import log_audit
from app.auth import ACCESS_TOKEN_EXPIRE_MINUTES, Token, create_access_token, verify_password
from app.database import get_db
from app.deps import get_current_user, verify_current_password
from app.models import User

router = APIRouter(tags=["auth"])


class _LoginForm(OAuth2PasswordRequestForm):
    """OAuth2 form + optional plant field (kept backward compatible)."""

    def __init__(
        self,
        username: str = Form(...),
        password: str = Form(...),
        plant: Optional[str] = Form(None),
    ):
        super().__init__(username=username, password=password)
        self.plant = plant


@router.post("/api/auth/login", response_model=Token)
def login_for_access_token(
    db: Session = Depends(get_db),
    form_data: _LoginForm = Depends(),
):
    user = db.query(User).filter(User.employee_id == form_data.username).first()
    bad_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not user:
        raise bad_credentials

    if user.locked:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Account is locked after 3 failed login attempts. Contact your administrator.",
        )

    try:
        valid = verify_password(form_data.password, user.hashed_password)
    except Exception:  # noqa: BLE001
        valid = False
    if not valid:
        user.failed_attempts = (user.failed_attempts or 0) + 1
        locked_now = user.failed_attempts >= password_policy.MAX_FAILED_ATTEMPTS
        if locked_now:
            user.locked = True
        db.commit()
        if locked_now:
            log_audit(db, user, "ACCOUNT_LOCKED", f"Account {user.employee_id} locked after "
                      f"{password_policy.MAX_FAILED_ATTEMPTS} consecutive failed login attempts")
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                "Account locked after 3 failed login attempts. Contact your administrator.")
        raise bad_credentials

    if not user.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    plant = (form_data.plant or "").strip() or None
    if plant and plant not in user.plants_list():
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"User {user.employee_id} does not have access to plant {plant}",
        )

    if user.failed_attempts:
        user.failed_attempts = 0
        db.commit()

    claims = {"sub": user.employee_id}
    if plant:
        claims["plant"] = plant
    access_token = create_access_token(
        data=claims, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/api/auth/plants")
def list_login_plants(employee_id: str, db: Session = Depends(get_db)):
    """Plants a username may log in to (used by the login page plant selector).
    Unknown users get the default plant list so usernames are not disclosed."""
    user = db.query(User).filter(User.employee_id == employee_id).first()
    if not user:
        return {"plants": []}
    return {"plants": user.plants_list()}


class VerifyIn(BaseModel):
    password: str


@router.post("/api/auth/verify")
def verify_credentials(
    payload: VerifyIn,
    current_user: User = Depends(get_current_user),
):
    """Re-authentication check used before sensitive actions (e-signature)."""
    verify_current_password(current_user, payload.password)
    return {"ok": True, "user_id": current_user.employee_id, "name": current_user.name}


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.post("/api/auth/change-password")
def change_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_current_password(current_user, payload.current_password)
    err = password_policy.validate_complexity(payload.new_password)
    if err:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, err)
    if password_policy.is_reused(current_user, payload.new_password):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Password was used recently. Choose one not used in the last {password_policy.HISTORY_COUNT} passwords.",
        )
    password_policy.apply_new_password(current_user, payload.new_password)
    db.commit()
    log_audit(db, current_user, "PASSWORD_CHANGED", f"User {current_user.employee_id} changed their password",
              entity=f"User {current_user.employee_id}", field="Password", old="********", new="********")
    return {"ok": True}


@router.get("/api/auth/password-policy")
def get_password_policy():
    return {
        "min_length": password_policy.MIN_LENGTH,
        "expiry_days": password_policy.EXPIRY_DAYS,
        "history_count": password_policy.HISTORY_COUNT,
        "max_failed_attempts": password_policy.MAX_FAILED_ATTEMPTS,
        "idle_timeout_minutes": password_policy.IDLE_TIMEOUT_MINUTES,
        "text": password_policy.POLICY_TEXT,
    }
