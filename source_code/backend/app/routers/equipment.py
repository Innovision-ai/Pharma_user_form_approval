from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, get_optional_plant, require_role
from app.constants import ROLE_ADMIN, ASSET_STATUS_APPROVED
from app.models import AuditLog, Equipment, User, AssetCreationRequest
from app.schemas import EquipmentCreate, EquipmentOut, EquipmentUpdate, StatusToggle
from app.audit import log_audit, diff_and_log

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentOut])
def list_equipment(
    active_only: bool = False,
    plant: Optional[str] = None,
    type: Optional[str] = None,
    system_type: Optional[str] = None,
    validation_status: Optional[str] = None,
    db: Session = Depends(get_db),
    token_plant: Optional[str] = Depends(get_optional_plant),
):
    q = db.query(Equipment)
    if active_only:
        q = q.filter(Equipment.active.is_(True))
    # Data is segregated by the plant chosen at login
    plant = token_plant or plant
    if plant:
        q = q.filter(Equipment.plant == plant)
    if type:
        q = q.filter(Equipment.type == type)
    if system_type:
        q = q.filter(Equipment.system_type == system_type)
    if validation_status:
        q = q.filter(Equipment.validation_status == validation_status)
    return q.order_by(Equipment.equipment_code).all()


@router.get("/validation-alerts")
def validation_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_optional_plant),
):
    """Return equipment under_validation that is >= 60 days since creation."""
    q = db.query(Equipment).filter(
        Equipment.validation_status == "under_validation",
        Equipment.active.is_(True),
    )
    if token_plant:
        q = q.filter(Equipment.plant == token_plant)
    items = q.all()
    alerts = []
    for item in items:
        created = item.created_at.date() if item.created_at else date.today()
        days_since = (date.today() - created).days
        if days_since >= 60:
            alerts.append({
                "equipment_code": item.equipment_code,
                "name": item.name,
                "system_type": item.system_type,
                "validation_status": item.validation_status,
                "days_pending": days_since,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            })
    return alerts


def next_equipment_code(db: Session) -> str:
    """Return the next free numeric code (0001, 0002, ...).

    Legacy codes such as EQ-001 / SW-001 are kept as they are; only all-digit
    codes count towards the sequence.
    """
    existing = {code for (code,) in db.query(Equipment.equipment_code).all()}
    max_seq = max((int(c) for c in existing if c and c.isdigit()), default=0)
    next_seq = max_seq + 1
    while f"{next_seq:04d}" in existing:
        next_seq += 1
    return f"{next_seq:04d}"


_next_equipment_code = next_equipment_code  # backward-compatible name


def _require_completion_date(payload: EquipmentCreate) -> None:
    """Validation completion date is filled in once the equipment is validated."""
    if payload.validation_status == "validated" and not payload.validation_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Validation Completion Date is required when the status is Validated")


def _require_approved_create(db: Session, code: Optional[str]) -> None:
    approved_create = None
    if code:
        approved_create = (
            db.query(AssetCreationRequest)
            .filter(
                AssetCreationRequest.equipment_code == code,
                AssetCreationRequest.request_type == "CREATE",
                AssetCreationRequest.status == ASSET_STATUS_APPROVED,
            )
            .first()
        )
    if not approved_create:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Equipment can only be set to 'Validated' after its Asset Creation request has been approved."
        )


def _apply_extended_fields(item: Equipment, payload: EquipmentCreate) -> None:
    item.system_id = payload.system_id
    item.system_type = payload.system_type
    item.make = payload.make
    item.model_name = payload.model_name
    item.application_name = payload.application_name
    item.gamp_category = payload.gamp_category
    item.usp_classification = payload.usp_classification
    item.validation_status = payload.validation_status
    item.initial_validation_date = payload.initial_validation_date
    item.latest_validation_date = payload.latest_validation_date
    item.periodic_review_frequency = payload.periodic_review_frequency
    item.backup_include = payload.backup_include
    item.computer_system_id = payload.computer_system_id
    item.remarks = payload.remarks
    if hasattr(payload, "instrument_ids"):
        item.instrument_ids = payload.instrument_ids


def _equipment_dict(item: Equipment) -> dict:
    """Snapshot key mutable fields for diff_and_log."""
    return {
        "name": item.name,
        "type": item.type,
        "location": item.location,
        "plant": item.plant,
        "allowed_roles": item.allowed_roles,
        "system_id": item.system_id,
        "system_type": item.system_type,
        "make": item.make,
        "model_name": item.model_name,
        "application_name": item.application_name,
        "gamp_category": item.gamp_category,
        "usp_classification": item.usp_classification,
        "validation_status": item.validation_status,
        "periodic_review_frequency": item.periodic_review_frequency,
        "backup_include": item.backup_include,
        "computer_system_id": item.computer_system_id,
        "remarks": item.remarks,
    }


FIELD_LABELS = {
    "name": "Name",
    "type": "Type",
    "location": "Department",
    "plant": "Plant",
    "allowed_roles": "Allowed Roles",
    "system_id": "System ID",
    "system_type": "System Type",
    "make": "Make",
    "model_name": "Model",
    "application_name": "Application Name",
    "gamp_category": "GAMP Category",
    "usp_classification": "USP Classification",
    "validation_status": "Validation Status",
    "periodic_review_frequency": "Periodic Review Frequency (months)",
    "backup_include": "Include in Backup",
    "computer_system_id": "Computer System ID",
    "remarks": "Remarks",
}


@router.post("", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    if payload.validation_status == "validated":
        _require_approved_create(db, None)
    item = Equipment(
        equipment_code=next_equipment_code(db),
        name=payload.name,
        type=payload.type,
        location=payload.location,
        plant=payload.plant,
        allowed_roles=",".join(payload.allowed_roles),
        validation_date=payload.validation_date,
        active=True,
        created_by=current_user.name,
    )
    _apply_extended_fields(item, payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    log_audit(
        db, current_user, "EQUIPMENT_CREATED",
        f"Created equipment {item.equipment_code}: {item.name}",
        entity=item.equipment_code, field="Status", old=None, new="Active",
        plant=item.plant,
    )
    return item


def _get_or_404(db: Session, code: str) -> Equipment:
    item = db.query(Equipment).filter(Equipment.equipment_code == code).first()
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")
    return item


@router.get("/{code}", response_model=EquipmentOut)
def get_equipment(code: str, db: Session = Depends(get_db)):
    return _get_or_404(db, code)


@router.put("/{code}", response_model=EquipmentOut)
def update_equipment(
    code: str,
    payload: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    item = _get_or_404(db, code)

    # Snapshot before-state for audit diff
    old_snap = _equipment_dict(item)

    # Reject validation_status='validated' unless an approved CREATE asset request exists
    current_val_status = item.validation_status or ""
    new_val_status = payload.validation_status or ""
    if new_val_status == "validated" and current_val_status != "validated":
        _require_approved_create(db, code)
    _require_completion_date(payload)

    item.name = payload.name
    item.type = payload.type
    item.location = payload.location
    item.plant = payload.plant
    item.allowed_roles = ",".join(payload.allowed_roles)
    item.validation_date = payload.validation_date
    _apply_extended_fields(item, payload)

    # Build new snapshot and diff
    new_snap = _equipment_dict(item)
    db.commit()
    db.refresh(item)

    diff_and_log(
        db, current_user, "EQUIPMENT_UPDATED",
        f"Equipment {item.equipment_code}",
        old_snap, new_snap,
        labels=FIELD_LABELS,
        plant=item.plant,
    )
    return item


@router.patch("/{code}/status", response_model=EquipmentOut)
def toggle_equipment_status(
    code: str,
    payload: StatusToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_ADMIN)),
):
    item = _get_or_404(db, code)
    old_active = item.active

    # If retiring (active=False), require an approved RETIRE asset request
    if not payload.active and old_active:
        approved_retire = (
            db.query(AssetCreationRequest)
            .filter(
                AssetCreationRequest.equipment_code == code,
                AssetCreationRequest.request_type == "RETIRE",
                AssetCreationRequest.status == ASSET_STATUS_APPROVED,
            )
            .first()
        )
        if not approved_retire:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Equipment can only be retired after an Asset Retire request has been approved. "
                "Please submit and approve an Asset Retire request first."
            )

    item.active = payload.active
    db.commit()
    db.refresh(item)

    old_label = "Active" if old_active else "Retired"
    new_label = "Active" if item.active else "Retired"
    log_audit(
        db, current_user, "EQUIPMENT_STATUS_CHANGED",
        f"Equipment {item.equipment_code} status changed from {old_label} to {new_label}",
        entity=item.equipment_code, field="Status",
        old=old_label, new=new_label,
        plant=item.plant,
    )
    return item


@router.get("/{code}/users")
def get_equipment_users(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.access import user_access

    _get_or_404(db, code)
    return [
        {
            "employee_id": a["employee_id"],
            "user_name": a["user_name"],
            "department": a["department"] or "",
            "user_id": a["user_id"],
            "role": a["role"],
            "access_granted_by": a["granted_by"],
            "granted_date": a["granted_date"],
            "request_code": a["request_code"],
            "status": a["status"],
        }
        for a in user_access(db, asset_code=code)
    ]
