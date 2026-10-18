import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.constants import (
    ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_HOD, ROLE_IT, ROLE_QA,
    UAM_FOLDER_PERMISSIONS,
    UAM_STATUS_CANCELLED, UAM_STATUS_COMPLETED, UAM_STATUS_CORRECTION,
    UAM_STATUS_PENDING_ACK, UAM_STATUS_PENDING_DEPARTMENT,
    UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_PENDING_QA,
    UAM_STATUS_PENDING_REVIEW, UAM_STATUS_REJECTED, UAM_STATUS_SUSPENDED,
    STATUS_IT_COMPLETED,
)
from app.database import get_db
from app.deps import get_current_plant, get_current_user, verify_current_password
from app.models import AccessRequest, AuditLog, Equipment, UAMRequest, User
from app.numbering import next_year_code
from app.schemas import BulkDeactivateRequest, UAMAction, UAMRequestCreate, UAMRequestOut

router = APIRouter(prefix="/api/uam/requests", tags=["uam-requests"])

TEMPLATE_ASSET_TYPES = {
    "MANUFACTURING": ["EQUIPMENT"],
    "QC": ["SOFTWARE"],
    "ERP": ["SOFTWARE"],
    "FOLDER_PROJECT": ["FOLDER"],
}
# Actions that hand the user a (new) password, so the executor must record one.
ACTIONS_NEEDING_PASSWORD = {"CREATE", "UNLOCK", "CHANGE_PASSWORD"}
APPROVAL_STAGES = (UAM_STATUS_PENDING_REVIEW, UAM_STATUS_PENDING_DEPARTMENT, UAM_STATUS_PENDING_QA)
EXECUTION_STAGES = (UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_SUSPENDED)


def _audit(db: Session, req: UAMRequest, user: User, action: str, description: str,
           field: Optional[str] = None, old: Optional[str] = None, new: Optional[str] = None) -> None:
    db.add(AuditLog(
        request_code=req.request_code,
        user_employee_id=user.employee_id,
        user_name=user.name,
        action=action,
        description=description,
        entity=f"Request {req.request_code}",
        field_name=field,
        old_value=old,
        new_value=new,
        plant=req.plant,
    ))


def _out(req: UAMRequest) -> UAMRequestOut:
    data = {column.name: getattr(req, column.name) for column in UAMRequest.__table__.columns}
    data["form_data"] = json.loads(req.form_data or "{}")
    return UAMRequestOut.model_validate(data)


def _get(db: Session, code: str) -> UAMRequest:
    req = db.query(UAMRequest).filter(UAMRequest.request_code == code).first()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return req


def _can_see(user: User, req: UAMRequest) -> bool:
    return user.role == ROLE_ADMIN or req.employee_id == user.employee_id or user.employee_id in {
        req.reviewer_id, req.department_approver_id, req.qa_approver_id, req.it_executor_id,
    }


def _stage_actor(req: UAMRequest) -> Optional[str]:
    """Employee ID of the person the request is currently assigned to."""
    return {
        UAM_STATUS_PENDING_REVIEW: req.reviewer_id,
        UAM_STATUS_PENDING_DEPARTMENT: req.department_approver_id,
        UAM_STATUS_PENDING_QA: req.qa_approver_id,
        UAM_STATUS_PENDING_EXECUTION: req.it_executor_id,
        UAM_STATUS_SUSPENDED: req.it_executor_id,
        UAM_STATUS_PENDING_ACK: req.employee_id,
        UAM_STATUS_CORRECTION: req.employee_id,
    }.get(req.status)


def _require_assignee(req: UAMRequest, user: User, stages: tuple) -> None:
    """Only the current stage's assignee may act; earlier approvers are locked out."""
    if req.status not in stages:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"This action is not allowed while the request is {req.status}")
    actor = _stage_actor(req)
    if req.status in EXECUTION_STAGES and not actor:
        # Unassigned execution: any IT executor may pick it up.
        if user.role not in (ROLE_IT, ROLE_ADMIN):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This request is not assigned to you")
        return
    if actor != user.employee_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This request is not assigned to you")


def _esign(user: User, password: Optional[str], reason: Optional[str]) -> str:
    """Verify the e-signature (own password + reason); returns the reason."""
    verify_current_password(user, password)
    reason = (reason or "").strip()
    if not reason:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A reason is required for this action")
    return reason


def _after_review(req: UAMRequest) -> str:
    if req.template == "MANUFACTURING":
        return UAM_STATUS_PENDING_QA
    if req.department_approver_id:
        return UAM_STATUS_PENDING_DEPARTMENT
    if req.qa_approver_id:
        return UAM_STATUS_PENDING_QA
    return UAM_STATUS_PENDING_EXECUTION


def _effective_plant(user: User, token_plant: Optional[str]) -> str:
    return token_plant or user.plant


def _has_user_id(db: Session, employee_id: str, asset_code: str) -> bool:
    """True when the user already holds an account on the asset (completed CREATE)."""
    uam = db.query(UAMRequest).filter(
        UAMRequest.employee_id == employee_id,
        UAMRequest.asset_code == asset_code,
        UAMRequest.action == "CREATE",
        UAMRequest.status == UAM_STATUS_COMPLETED,
    ).first()
    if uam:
        return True
    legacy = db.query(AccessRequest).filter(
        AccessRequest.employee_id == employee_id,
        AccessRequest.equipment_code == asset_code,
        AccessRequest.status == STATUS_IT_COMPLETED,
    ).first()
    return legacy is not None


def _plant_users(db: Session, plant: str, roles: list[str]) -> list[User]:
    users = db.query(User).filter(User.role.in_(roles), User.active.is_(True)).order_by(User.employee_id).all()
    return [u for u in users if plant in u.plants_list()]


@router.get("/templates")
def templates():
    return {
        "templates": [
            {"code": "MANUFACTURING", "asset_types": ["EQUIPMENT"], "requires_qa": True},
            {"code": "QC", "asset_types": ["SOFTWARE"], "requires_qa": False},
            {"code": "ERP", "asset_types": ["SOFTWARE"], "requires_qa": False},
            {"code": "FOLDER_PROJECT", "asset_types": ["FOLDER"], "requires_qa": False},
        ],
        "actions": ["CREATE", "MODIFY", "DEACTIVATE", "ACTIVATE", "UNLOCK", "CHANGE_PASSWORD"],
        "folder_permissions": UAM_FOLDER_PERMISSIONS,
    }


@router.get("/selectors")
def selectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    """Active users of the selected plant who can be assigned to each stage."""
    plant = _effective_plant(current_user, token_plant)
    pick = lambda users: [{"id": u.employee_id, "name": u.name, "department": u.department} for u in users]  # noqa: E731
    return {
        "reviewers": pick(_plant_users(db, plant, [ROLE_HOD])),
        "department_approvers": pick(_plant_users(db, plant, [ROLE_HOD])),
        "qa_approvers": pick(_plant_users(db, plant, [ROLE_QA])),
        "it_executors": pick(_plant_users(db, plant, [ROLE_ADMIN, ROLE_IT])),
    }


@router.get("/equipment-options")
def equipment_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    """Active equipment / software of the selected plant in the user's department,
    with its allowed roles and whether the user already has an ID on it."""
    plant = _effective_plant(current_user, token_plant)
    q = db.query(Equipment).filter(Equipment.active.is_(True), Equipment.plant == plant)
    if current_user.role != ROLE_ADMIN:
        q = q.filter(func.lower(Equipment.location) == (current_user.department or "").lower())
    items = q.order_by(Equipment.equipment_code).all()
    return [
        {
            "equipment_code": e.equipment_code,
            "name": e.name,
            "type": e.type,
            "system_type": e.system_type,
            "department": e.location,
            "allowed_roles": e.roles_list(),
            "has_user_id": _has_user_id(db, current_user.employee_id, e.equipment_code),
        }
        for e in items
    ]


@router.get("", response_model=list[UAMRequestOut])
def list_requests(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    q = db.query(UAMRequest).filter(UAMRequest.plant == _effective_plant(current_user, token_plant))
    if current_user.role != ROLE_ADMIN:
        me = current_user.employee_id
        # Own requests, plus requests currently waiting on me.
        q = q.filter(
            (UAMRequest.employee_id == me)
            | ((UAMRequest.reviewer_id == me) & (UAMRequest.status == UAM_STATUS_PENDING_REVIEW))
            | ((UAMRequest.department_approver_id == me) & (UAMRequest.status == UAM_STATUS_PENDING_DEPARTMENT))
            | ((UAMRequest.qa_approver_id == me) & (UAMRequest.status == UAM_STATUS_PENDING_QA))
            | ((UAMRequest.it_executor_id == me) & (UAMRequest.status.in_(EXECUTION_STAGES)))
        )
    if status_filter:
        q = q.filter(UAMRequest.status == status_filter)
    return [_out(item) for item in q.order_by(UAMRequest.created_at.desc()).all()]


@router.post("", response_model=UAMRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: UAMRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    if current_user.role not in (ROLE_EMPLOYEE, ROLE_ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an initiator can create a request")
    plant = _effective_plant(current_user, token_plant)
    if payload.plant != plant:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You are logged in to plant {plant}")
    if payload.asset_type not in TEMPLATE_ASSET_TYPES[payload.template]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"{payload.template} requests must target {', '.join(TEMPLATE_ASSET_TYPES[payload.template]).lower()}")
    if not payload.reviewer_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select a reviewer")
    if payload.template == "MANUFACTURING" and not payload.qa_approver_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A QA approver is required for Manufacturing requests")

    form_data = dict(payload.form_data or {})
    if payload.asset_type == "FOLDER":
        if payload.requested_role not in UAM_FOLDER_PERMISSIONS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Permission must be one of {', '.join(UAM_FOLDER_PERMISSIONS)}")
        if not str(form_data.get("folder_path") or "").strip():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Folder / project path is required")
    else:
        asset = db.query(Equipment).filter(Equipment.equipment_code == payload.asset_code).first()
        if not asset or not asset.active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected equipment is not active")
        if asset.plant != plant:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected equipment belongs to another plant")
        if payload.requested_role not in asset.roles_list():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Requested role is not available for this equipment")
        if payload.action != "CREATE" and not _has_user_id(db, current_user.employee_id, asset.equipment_code):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Your user ID does not exist on {asset.equipment_code} ({asset.name}). "
                f"Raise a CREATE request first; {payload.action} is only allowed for an existing user ID.",
            )
        form_data.setdefault("asset_name", asset.name)

    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    req = UAMRequest(
        request_code=next_year_code(db, UAMRequest), employee_id=current_user.employee_id,
        employee_name=current_user.name, employee_email=current_user.email,
        template=payload.template, asset_type=payload.asset_type, asset_code=payload.asset_code,
        requested_role=payload.requested_role, action=payload.action, plant=plant,
        reason=payload.reason, form_data=json.dumps(form_data),
        reviewer_id=payload.reviewer_id, department_approver_id=payload.department_approver_id or None,
        qa_approver_id=payload.qa_approver_id or None, it_executor_id=payload.it_executor_id or None,
        status=UAM_STATUS_PENDING_REVIEW, auth_reason=reason,
    )
    db.add(req)
    db.flush()
    _audit(db, req, current_user, "UAM_REQUEST_SUBMITTED",
           f"{current_user.name} submitted {req.request_code} (e-signed). Reason: {reason}",
           field="Status", old=None, new=UAM_STATUS_PENDING_REVIEW)
    db.commit()
    db.refresh(req)
    return _out(req)


@router.get("/{code}", response_model=UAMRequestOut)
def get_request(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if not _can_see(current_user, req):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this request")
    return _out(req)


def _transition(db: Session, req: UAMRequest, user: User, new_status: str, action: str, reason: str,
                comment: Optional[str]) -> None:
    old = req.status
    req.status = new_status
    req.auth_reason = reason
    text = f"{user.name}: {old} -> {new_status} (e-signed). Reason: {reason}"
    if comment:
        text += f". Comment: {comment}"
    _audit(db, req, user, action, text, field="Status", old=old, new=new_status)


@router.post("/{code}/approve", response_model=UAMRequestOut)
def approve(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    _require_assignee(req, current_user, APPROVAL_STAGES)
    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    if req.status == UAM_STATUS_PENDING_REVIEW:
        new_status = _after_review(req)
    else:  # department or QA approval
        if req.status == UAM_STATUS_PENDING_DEPARTMENT and req.template == "MANUFACTURING":
            new_status = UAM_STATUS_PENDING_QA
        else:
            new_status = UAM_STATUS_PENDING_EXECUTION
    _transition(db, req, current_user, new_status, "UAM_APPROVED", reason, payload.comment)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/correction", response_model=UAMRequestOut)
def correction(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    _require_assignee(req, current_user, APPROVAL_STAGES + EXECUTION_STAGES)
    if not (payload.comment or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A correction comment is required")
    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    req.rejection_reason = payload.comment
    _transition(db, req, current_user, UAM_STATUS_CORRECTION, "CORRECTION_REQUIRED", reason, payload.comment)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/reject", response_model=UAMRequestOut)
def reject(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    _require_assignee(req, current_user, APPROVAL_STAGES)
    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    req.rejection_reason = payload.comment or reason
    _transition(db, req, current_user, UAM_STATUS_REJECTED, "UAM_REJECTED", reason, payload.comment)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/resubmit", response_model=UAMRequestOut)
def resubmit(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    _require_assignee(req, current_user, (UAM_STATUS_CORRECTION,))
    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    req.rejection_reason = None
    _transition(db, req, current_user, UAM_STATUS_PENDING_REVIEW, "UAM_RESUBMITTED", reason, payload.comment)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/execute", response_model=UAMRequestOut)
def execute(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if current_user.role not in (ROLE_IT, ROLE_ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an IT executor can complete execution")
    _require_assignee(req, current_user, EXECUTION_STAGES)
    if not (payload.user_login_id or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User ID is required")
    if req.action in ACTIONS_NEEDING_PASSWORD and not payload.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Temporary password is required for this action")
    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    # Keep credential values out of the response and audit text; the legacy flow retains them only for its demo.
    data = json.loads(req.form_data or "{}")
    data.update({"user_login_id": payload.user_login_id, "credential_set_at": datetime.utcnow().isoformat()})
    req.form_data = json.dumps(data)
    if not req.it_executor_id:
        req.it_executor_id = current_user.employee_id
    _transition(db, req, current_user, UAM_STATUS_PENDING_ACK, "UAM_EXECUTION_COMPLETE", reason, payload.comment)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/acknowledge", response_model=UAMRequestOut)
def acknowledge(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id or req.status != UAM_STATUS_PENDING_ACK:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can acknowledge a completed execution")
    old = req.status
    req.status = UAM_STATUS_COMPLETED
    _audit(db, req, current_user, "UAM_ACKNOWLEDGED", payload.comment or "Initiator acknowledged and closed request",
           field="Status", old=old, new=UAM_STATUS_COMPLETED)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/cancel", response_model=UAMRequestOut)
def cancel(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id and current_user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can cancel this request")
    if req.status in (UAM_STATUS_COMPLETED, UAM_STATUS_REJECTED, UAM_STATUS_CANCELLED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This request is already closed")
    old = req.status
    req.status = UAM_STATUS_CANCELLED
    _audit(db, req, current_user, "UAM_CANCELLED", payload.comment or "Request cancelled",
           field="Status", old=old, new=UAM_STATUS_CANCELLED)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/bulk-deactivate")
def bulk_deactivate(
    payload: BulkDeactivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (ROLE_ADMIN, ROLE_HOD):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an IT executor or reviewer can request bulk deactivation")

    target = db.query(User).filter(User.employee_id == payload.employee_id).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target user not found")

    # One DEACTIVATE request per asset the user holds via a completed request
    uam_reqs = (
        db.query(UAMRequest)
        .filter(
            UAMRequest.employee_id == payload.employee_id,
            UAMRequest.status == UAM_STATUS_COMPLETED,
            UAMRequest.action == "CREATE",
        )
        .all()
    )

    created = []
    seen = set()
    for req in uam_reqs:
        if req.asset_code in seen:
            continue
        seen.add(req.asset_code)
        new_req = UAMRequest(
            request_code=next_year_code(db, UAMRequest),
            employee_id=current_user.employee_id,
            employee_name=current_user.name,
            employee_email=current_user.email,
            template=req.template,
            asset_type=req.asset_type,
            asset_code=req.asset_code,
            requested_role=req.requested_role,
            action="DEACTIVATE",
            plant=req.plant,
            reason=payload.reason,
            form_data=json.dumps({"target_employee_id": payload.employee_id, "bulk_deactivation": True}),
            reviewer_id=req.reviewer_id,
            department_approver_id=req.department_approver_id,
            qa_approver_id=req.qa_approver_id,
            it_executor_id=payload.it_executor_id,
            status=UAM_STATUS_PENDING_REVIEW,
        )
        db.add(new_req)
        db.flush()  # so the next yearly code sees this one
        _audit(db, new_req, current_user, "UAM_BULK_DEACTIVATION",
               f"Bulk deactivation of {payload.employee_id} on {req.asset_code}: {payload.reason}",
               field="Status", old=None, new=UAM_STATUS_PENDING_REVIEW)
        created.append(new_req.request_code)

    db.commit()
    return {"created_requests": created, "count": len(created)}
