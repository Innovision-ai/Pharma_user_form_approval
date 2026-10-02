from datetime import date, timedelta

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import VAULT_ENCRYPTION_KEY
from app.database import get_db
from app.deps import get_current_user
from app.models import PasswordVaultEntry, User
from app.schemas import VaultEntryCreate, VaultEntryOut, VaultEntryUpdate

router = APIRouter(prefix="/api/vault", tags=["vault"])


def _fernet() -> Fernet:
    key = VAULT_ENCRYPTION_KEY.encode()
    # Pad / fix the key if needed (demo only)
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


@router.get("", response_model=list[VaultEntryOut])
def list_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entries = (
        db.query(PasswordVaultEntry)
        .filter(PasswordVaultEntry.owner_employee_id == current_user.employee_id)
        .order_by(PasswordVaultEntry.equipment_code)
        .all()
    )
    return [_with_password(e) for e in entries]


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
    entry.encrypted_password = _encrypt(payload.password)
    entry.expiry_days = payload.expiry_days
    if payload.expiry_days:
        entry.expiry_date = entry.created_date + timedelta(days=payload.expiry_days)
    else:
        entry.expiry_date = None
    db.commit()
    db.refresh(entry)
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
    db.delete(entry)
    db.commit()
