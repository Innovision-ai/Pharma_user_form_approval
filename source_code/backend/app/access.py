"""Who holds a user ID on which equipment.

Derived from completed requests, replayed in order per (user, asset):
CREATE / ACTIVATE -> active, DEACTIVATE -> inactive, MODIFY -> role change.
Completed legacy access requests count as an active CREATE.
"""
import json
from typing import Optional

from sqlalchemy.orm import Session

from app.constants import STATUS_IT_COMPLETED, UAM_STATUS_COMPLETED
from app.models import AccessRequest, Equipment, UAMRequest, User


def user_access(db: Session, employee_id: Optional[str] = None, asset_code: Optional[str] = None) -> list[dict]:
    records: dict[tuple[str, str], dict] = {}

    legacy = db.query(AccessRequest).filter(AccessRequest.status == STATUS_IT_COMPLETED)
    uam = db.query(UAMRequest).filter(UAMRequest.status == UAM_STATUS_COMPLETED)
    if employee_id:
        # UAM rows are filtered below: bulk deactivations are raised by an admin
        # and carry the holder in form_data
        legacy = legacy.filter(AccessRequest.employee_id == employee_id)
    if asset_code:
        legacy = legacy.filter(AccessRequest.equipment_code == asset_code)
        uam = uam.filter(UAMRequest.asset_code == asset_code)

    for r in legacy.order_by(AccessRequest.updated_at).all():
        records[(r.employee_id, r.equipment_code)] = {
            "employee_id": r.employee_id, "user_name": r.employee_name, "department": r.employee_department,
            "equipment_code": r.equipment_code, "equipment_name": r.equipment_name, "role": r.requested_role,
            "user_id": r.user_login_id or r.employee_id, "request_code": r.request_code,
            "granted_by": "IT Support", "granted_date": (r.it_submitted_at or r.updated_at).isoformat(),
            "status": "Active",
        }

    for r in uam.order_by(UAMRequest.updated_at).all():
        form = json.loads(r.form_data or "{}")
        holder = form.get("target_employee_id") or r.employee_id
        if employee_id and holder != employee_id:
            continue
        key = (holder, r.asset_code)
        rec = records.get(key)
        if rec is None and r.action == "DEACTIVATE":
            continue  # nothing to deactivate
        if r.action in ("CREATE", "ACTIVATE") or rec is None:
            rec = rec or {
                "employee_id": holder, "user_name": r.employee_name, "department": None,
                "equipment_code": r.asset_code, "equipment_name": form.get("asset_name") or r.asset_code,
                "role": r.requested_role, "user_id": form.get("user_login_id") or r.employee_id,
                "request_code": r.request_code, "granted_by": r.it_executor_id or "IT Executor",
                "granted_date": r.updated_at.isoformat(), "status": "Active",
            }
            rec["status"] = "Active"
            if r.action == "CREATE":
                rec.update(request_code=r.request_code, user_id=form.get("user_login_id") or rec["user_id"],
                           granted_by=r.it_executor_id or rec["granted_by"], granted_date=r.updated_at.isoformat(),
                           role=r.requested_role)
        elif r.action == "DEACTIVATE":
            rec["status"] = "Inactive"
        elif r.action == "MODIFY":
            rec["role"] = r.requested_role
        rec["last_request"] = r.request_code
        records[key] = rec

    # fill department / equipment names
    users = {u.employee_id: u for u in db.query(User).filter(
        User.employee_id.in_({k[0] for k in records})).all()} if records else {}
    eqs = {e.equipment_code: e for e in db.query(Equipment).filter(
        Equipment.equipment_code.in_({k[1] for k in records})).all()} if records else {}
    for (emp, code), rec in records.items():
        if emp in users:
            rec["department"] = rec.get("department") or users[emp].department
            rec["user_name"] = users[emp].name
        if code in eqs:
            rec["equipment_name"] = eqs[code].name
            rec["equipment_active"] = eqs[code].active
    return sorted(records.values(), key=lambda r: (r["equipment_code"], r["employee_id"]))
