"""Password Vault router.

Additions over the original:
  - update_entry: sets created_date to today + recomputes expiry_date
  - list_entries: generates a Notification row when an entry expires within 10 days
  - search param on list_entries
  - all create/update/delete actions are audit-logged (password never logged)
"""
from datetime import date, timedelta
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import VAULT_ENCRYPTION_KEY
from app.database import get_db
from app.deps import get_current_user
from app.models import Notification, PasswordVaultEntry, User
from app.schemas import VaultEntryCreate, VaultEntryOut, VaultEntryUpdate
from app.audit import log_audit

router = APIRouter(prefix="/api/vault", tags=["vault"])

EXPIRY_WARN_DAYS = 10


def _fernet() -> Fernet:
    key = VAULT_ENCRYPTION_KEY.encode()
    import base64
    try:
        return Fernet(key)
    except Exception:
        key = base64.urlsafe_b64encode(key[:32].ljust(32, b"="))
        return Fernet(key)


def _encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return "***decryption-error***"


def _with_password(entry: PasswordVaultEntry) -> VaultEntryOut:
    out = VaultEntryOut.model_validate(entry)
    out.password = _decrypt(entry.encrypted_password)
    return out


def _maybe_notify(db: Session, entry: PasswordVaultEntry, user: User) -> None:
    """Create a Notification row if entry expires within EXPIRY_WARN_DAYS and one doesn't exist yet."""
    if not entry.expiry_date:
        return
    days_left = (entry.expiry_date - date.today()).days
    if days_left > EXPIRY_WARN_DAYS or days_left < 0:
        return

    # Check for duplicate notification (same request_code pattern)
    notif_code = f"VAULT-{entry.id}-EXPIRY"
    existing = db.query(Notification).filter(
        Notification.request_code == notif_code,
        Notification.type == "VAULT_EXPIRY",
        Notification.status != "RESOLVED",
    ).first()
    if existing:
        return

    subject = (
        f"Password expiring in {days_left} day(s): {entry.equipment_name}"
        if days_left >= 0
        else f"Password EXPIRED: {entry.equipment_name}"
    )
    body = (
        f"The vault entry for equipment '{entry.equipment_name}' (code: {entry.equipment_code}) "
        f"will expire on {entry.expiry_date.strftime('%d/%m/%Y')}. Please change the password and "
        f"update the vault entry."
    )
    notif = Notification(
        request_code=notif_code,
        recipient_name=user.name,
        recipient_email=user.email,
        subject=subject,
        body=body,
        type="VAULT_EXPIRY",
        status="PENDING",
    )
    db.add(notif)
    db.commit()


def sweep_expiry_notifications(db: Session) -> int:
    """Raise the 10-day expiry notification for every owner's entries (run on
    dashboard / notification loads so it does not depend on opening the vault)."""
    soon = date.today() + timedelta(days=EXPIRY_WARN_DAYS)
    entries = db.query(PasswordVaultEntry).filter(
        PasswordVaultEntry.expiry_date.isnot(None),
        PasswordVaultEntry.expiry_date <= soon,
        PasswordVaultEntry.expiry_date >= date.today(),
    ).all()
    owners = {u.employee_id: u for u in db.query(User).filter(
        User.employee_id.in_({e.owner_employee_id for e in entries})).all()} if entries else {}
    raised = 0
    for entry in entries:
        owner = owners.get(entry.owner_employee_id)
        if owner:
            before = db.query(Notification).count()
            _maybe_notify(db, entry, owner)
            raised += db.query(Notification).count() - before
    return raised


def _resolve_notifications(db: Session, entry: PasswordVaultEntry) -> None:
    """Password changed: close the open expiry notification so the next cycle can raise a new one."""
    db.query(Notification).filter(
        Notification.request_code == f"VAULT-{entry.id}-EXPIRY",
        Notification.type == "VAULT_EXPIRY",
        Notification.status != "RESOLVED",
    ).update({Notification.status: "RESOLVED"}, synchronize_session=False)


@router.get("", response_model=list[VaultEntryOut])
def list_entries(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = (
        db.query(PasswordVaultEntry)
        .filter(PasswordVaultEntry.owner_employee_id == current_user.employee_id)
    )
    if search:
        like = f"%{search.lower()}%"
        q = q.filter(
            (PasswordVaultEntry.equipment_name.ilike(like)) |
            (PasswordVaultEntry.equipment_code.ilike(like))
        )
    entries = q.order_by(PasswordVaultEntry.equipment_code).all()

    result = []
    for entry in entries:
        _maybe_notify(db, entry, current_user)
        out = _with_password(entry)
        # Annotate expiry flag
        if entry.expiry_date:
            days_left = (entry.expiry_date - date.today()).days
            if days_left < 0:
                out.expiry_flag = "expired"
            elif days_left <= EXPIRY_WARN_DAYS:
                out.expiry_flag = f"expiring_in_{days_left}d"
        result.append(out)
    return result


@router.post("", response_model=VaultEntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(
    payload: VaultEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expiry_date = None
    if payload.expiry_days:
        expiry_date = payload.created_date + timedelta(days=payload.expiry_days)
    entry = PasswordVaultEntry(
        owner_employee_id=current_user.employee_id,
        equipment_code=payload.equipment_code,
        equipment_name=payload.equipment_name,
        encrypted_password=_encrypt(payload.password),
        created_date=payload.created_date,
        expiry_days=payload.expiry_days,
        expiry_date=expiry_date,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    log_audit(
        db, current_user, "VAULT_CREATED",
        f"Vault entry created for {entry.equipment_name} ({entry.equipment_code})",
        entity=f"Vault:{entry.equipment_code}", field="Status", old=None, new="Created",
    )
    return _with_password(entry)


@router.put("/{entry_id}", response_model=VaultEntryOut)
def update_entry(
    entry_id: int,
    payload: VaultEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = db.query(PasswordVaultEntry).filter(PasswordVaultEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vault entry not found")
    if entry.owner_employee_id != current_user.employee_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only update your own vault entries")

    old_date = entry.created_date
    old_expiry = entry.expiry_date

    # Update password and reset the creation/last-updated date to today
    entry.encrypted_password = _encrypt(payload.password)
    entry.created_date = date.today()
    _resolve_notifications(db, entry)
    entry.expiry_days = payload.expiry_days
    if payload.expiry_days:
        entry.expiry_date = entry.created_date + timedelta(days=payload.expiry_days)
    else:
        entry.expiry_date = None

    db.commit()
    db.refresh(entry)

    log_audit(
        db, current_user, "VAULT_UPDATED",
        f"Vault entry updated for {entry.equipment_name} ({entry.equipment_code}) — password changed",
        entity=f"Vault:{entry.equipment_code}", field="Password", old="[hidden]", new="[hidden]",
    )
    log_audit(
        db, current_user, "VAULT_UPDATED",
        f"Vault entry created/updated date changed",
        entity=f"Vault:{entry.equipment_code}", field="Created/Updated Date",
        old=old_date,
        new=entry.created_date,
    )
    if old_expiry != entry.expiry_date:
        log_audit(
            db, current_user, "VAULT_UPDATED",
            f"Vault entry expiry date changed",
            entity=f"Vault:{entry.equipment_code}", field="Expiry Date",
            old=old_expiry,
            new=entry.expiry_date,
        )
    return _with_password(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = db.query(PasswordVaultEntry).filter(PasswordVaultEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vault entry not found")
    if entry.owner_employee_id != current_user.employee_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete your own vault entries")
    name = entry.equipment_name
    code = entry.equipment_code
    db.delete(entry)
    db.commit()
    log_audit(
        db, current_user, "VAULT_DELETED",
        f"Vault entry deleted for {name} ({code})",
        entity=f"Vault:{code}", field="Status", old="Active", new="Deleted",
    )
