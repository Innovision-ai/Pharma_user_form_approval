"""Shared audit-trail helpers.

Usage:
    from app.audit import log_audit, diff_and_log

    log_audit(db, user, "EQUIPMENT_STATUS_CHANGED", "Equipment 0005 status changed",
              entity="Equipment 0005", field="Status", old="Active", new="Retired")

    changes = diff_and_log(db, user, "EQUIPMENT_UPDATED", "Equipment 0005",
                           old_dict, new_dict, labels={"make": "Make"})
"""
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def _fmt(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, (list, tuple, set)):
        return ", ".join(str(v) for v in value)
    return str(value)


def log_audit(
    db: Session,
    user: Optional[User],
    action: str,
    description: str,
    request_code: Optional[str] = None,
    entity: Optional[str] = None,
    field: Optional[str] = None,
    old: Any = None,
    new: Any = None,
    plant: Optional[str] = None,
    commit: bool = True,
) -> AuditLog:
    entry = AuditLog(
        request_code=request_code,
        user_employee_id=user.employee_id if user else "SYSTEM",
        user_name=user.name if user else "System",
        action=action,
        description=description,
        entity=entity,
        field_name=field,
        old_value=_fmt(old),
        new_value=_fmt(new),
        plant=plant,
    )
    db.add(entry)
    if commit:
        db.commit()
    return entry


def diff_and_log(
    db: Session,
    user: Optional[User],
    action: str,
    entity: str,
    old: dict,
    new: dict,
    labels: Optional[dict] = None,
    request_code: Optional[str] = None,
    plant: Optional[str] = None,
) -> list[tuple[str, Optional[str], Optional[str]]]:
    """Log one audit row per changed field. Returns [(label, old, new), ...]."""
    labels = labels or {}
    changes = []
    for key, new_val in new.items():
        old_val = old.get(key)
        if _fmt(old_val) == _fmt(new_val):
            continue
        label = labels.get(key, key.replace("_", " ").title())
        changes.append((label, _fmt(old_val), _fmt(new_val)))
        log_audit(
            db, user, action, f"{entity}: {label} changed",
            request_code=request_code, entity=entity, field=label,
            old=old_val, new=new_val, plant=plant, commit=False,
        )
    if changes:
        db.commit()
    return changes
