import json
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.timeutil import local_today
from app.access import user_access
from app.constants import (
    ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_HOD, ROLE_IT, ROLE_QA,
    UAM_FOLDER_PERMISSIONS,
    UAM_STATUS_CANCELLED, UAM_STATUS_COMPLETED, UAM_STATUS_CORRECTION,
    UAM_STATUS_PENDING_ACK, UAM_STATUS_PENDING_DEPARTMENT,
    UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_PENDING_QA,
    UAM_STATUS_PENDING_REVIEW, UAM_STATUS_REJECTED, UAM_STATUS_SUSPENDED,
)
from app.database import get_db
from app.deps import get_current_plant, get_current_user, verify_current_password
from app.models import Attachment, AuditLog, Equipment, Notification, UAMRequest, User
from app.numbering import next_year_code
from app.schemas import (
    BulkDeactivateRequest, SelfDeactivateRequest, UAMAckOut, UAMAction, UAMReassign,
    UAMRequestCreate, UAMRequestOut,
)

router = APIRouter(prefix="/api/uam/requests", tags=["uam-requests"])

TEMPLATE_ASSET_TYPES = {
    "MANUFACTURING": ["EQUIPMENT"],
    "QC": ["SOFTWARE"],
    "ERP": ["SOFTWARE"],
    "FOLDER_PROJECT": ["FOLDER"],
}
# Actions that hand the user a (new) password, so the executor must record one.
ACTIONS_NEEDING_PASSWORD = {"CREATE", "UNLOCK", "CHANGE_PASSWORD"}
# Actions that grant access (a temporary login applies to these).
GRANTING_ACTIONS = {"CREATE", "ACTIVATE"}
TEMPORARY_LOGIN_DAYS = (10, 15)
APPROVAL_STAGES = (UAM_STATUS_PENDING_REVIEW, UAM_STATUS_PENDING_DEPARTMENT, UAM_STATUS_PENDING_QA)
EXECUTION_STAGES = (UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_SUSPENDED)
OPEN_STATUSES = APPROVAL_STAGES + EXECUTION_STAGES + (UAM_STATUS_PENDING_ACK, UAM_STATUS_CORRECTION)
# Which assignment field each workflow stage uses, and the stages it covers
STAGE_FIELDS = {
    "reviewer": ("reviewer_id", (UAM_STATUS_PENDING_REVIEW,), (ROLE_HOD,)),
    "department_approver": ("department_approver_id", (UAM_STATUS_PENDING_REVIEW, UAM_STATUS_PENDING_DEPARTMENT), (ROLE_HOD,)),
    "qa_approver": ("qa_approver_id", (UAM_STATUS_PENDING_REVIEW, UAM_STATUS_PENDING_DEPARTMENT, UAM_STATUS_PENDING_QA), (ROLE_QA,)),
    "it_executor": ("it_executor_id", APPROVAL_STAGES + EXECUTION_STAGES, (ROLE_ADMIN, ROLE_IT)),
}


def _audit(db: Session, req: UAMRequest, user: Optional[User], action: str, description: str,
           field: Optional[str] = None, old: Optional[str] = None, new: Optional[str] = None) -> None:
    db.add(AuditLog(
        request_code=req.request_code,
        user_employee_id=user.employee_id if user else "SYSTEM",
        user_name=user.name if user else "System",
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
    data.pop("temp_password_enc", None)  # never leaves the server except at acknowledgement
    data["form_data"] = json.loads(req.form_data or "{}")
    data["has_temp_password"] = bool(req.temp_password_enc)
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


def _holder(req: UAMRequest) -> str:
    """Whose account the request is about."""
    return req.beneficiary_employee_id or req.employee_id


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
    """True when the person currently holds an active account on the asset."""
    return any(a["status"] == "Active" for a in user_access(db, employee_id=employee_id, asset_code=asset_code))


def _plant_users(db: Session, plant: str, roles: list[str]) -> list[User]:
    users = db.query(User).filter(User.role.in_(roles), User.active.is_(True)).order_by(User.employee_id).all()
    return [u for u in users if plant in u.plants_list()]


def _vault():
    # Same encryption as the password vault (Fernet, VAULT_ENCRYPTION_KEY)
    from app.routers.password_vault import _decrypt, _encrypt
    return _encrypt, _decrypt


def _notify(db: Session, req: UAMRequest, recipient: Optional[User], subject: str, body: str, ntype: str) -> None:
    db.add(Notification(
        request_code=req.request_code,
        recipient_name=recipient.name if recipient else req.employee_name,
        recipient_email=recipient.email if recipient else req.employee_email,
        subject=subject, body=body, type=ntype, status="SENT",
    ))


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

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
        "temporary_login_days": list(TEMPORARY_LOGIN_DAYS),
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
    scope: str = Query(default="mine", pattern="^(mine|all)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    """Active equipment / software of the selected plant. `mine` (own request):
    the user's department only; `all` (request for others): the whole plant."""
    plant = _effective_plant(current_user, token_plant)
    q = db.query(Equipment).filter(Equipment.active.is_(True), Equipment.plant == plant)
    if scope == "mine" and current_user.role != ROLE_ADMIN:
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
            "computer_system_id": e.computer_system_id,
            "hostname": e.hostname,
            "ip_address": e.ip_address,
            "has_user_id": _has_user_id(db, current_user.employee_id, e.equipment_code),
        }
        for e in items
    ]


@router.get("/equipment-users/{code}")
def equipment_users(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """People who currently hold an active account on the equipment (request for
    others: deactivation / modification picks from this list)."""
    return [
        {"employee_id": a["employee_id"], "name": a["user_name"], "department": a["department"],
         "user_id": a["user_id"], "role": a["role"]}
        for a in user_access(db, asset_code=code) if a["status"] == "Active"
    ]


# ---------------------------------------------------------------------------
# Scheduled work (run on page loads and by /api/jobs/run)
# ---------------------------------------------------------------------------

def sweep_temporary_logins(db: Session) -> list[str]:
    """Raise a DEACTIVATE request for every temporary login whose period ended."""
    today = local_today()
    expired = db.query(UAMRequest).filter(
        UAMRequest.status == UAM_STATUS_COMPLETED,
        UAMRequest.temporary_login.is_(True),
        UAMRequest.access_expires_on.isnot(None),
        UAMRequest.access_expires_on <= today,
        UAMRequest.auto_deactivation_code.is_(None),
    ).all()
    created = []
    for src in expired:
        if not _has_user_id(db, _holder(src), src.asset_code):
            src.auto_deactivation_code = "N/A"  # already deactivated another way
            continue
        new = UAMRequest(
            request_code=next_year_code(db, UAMRequest),
            employee_id=src.employee_id, employee_name=src.employee_name, employee_email=src.employee_email,
            template=src.template, asset_type=src.asset_type, asset_code=src.asset_code,
            requested_role=src.requested_role, action="DEACTIVATE", plant=src.plant,
            reason=f"Temporary login from {src.request_code} expired on {src.access_expires_on:%d/%m/%Y}",
            form_data=json.dumps({**json.loads(src.form_data or "{}"), "auto_generated_from": src.request_code,
                                  "user_login_id": None}),
            reviewer_id=src.reviewer_id, department_approver_id=src.department_approver_id,
            qa_approver_id=src.qa_approver_id, it_executor_id=src.it_executor_id,
            status=UAM_STATUS_PENDING_REVIEW, auth_reason="System generated: temporary login expired",
            for_others=src.for_others, beneficiary_employee_id=src.beneficiary_employee_id,
            beneficiary_name=src.beneficiary_name, beneficiary_email=src.beneficiary_email,
            beneficiary_department=src.beneficiary_department,
            training_completed="NA", training_remark="System generated deactivation",
        )
        db.add(new)
        db.flush()
        src.auto_deactivation_code = new.request_code
        _audit(db, new, None, "UAM_AUTO_DEACTIVATION",
               f"Deactivation raised automatically: temporary login from {src.request_code} expired",
               field="Status", new=UAM_STATUS_PENDING_REVIEW)
        _audit(db, src, None, "UAM_TEMPORARY_LOGIN_EXPIRED",
               f"Temporary login expired; deactivation request {new.request_code} raised")
        created.append(new.request_code)
    if expired:
        db.commit()
    return created


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

@router.get("", response_model=list[UAMRequestOut])
def list_requests(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    sweep_temporary_logins(db)
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


def _validate_training(db: Session, payload: UAMRequestCreate) -> None:
    if payload.training_completed not in ("YES", "NA"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Answer 'Are all required trainings completed?' with Yes or NA")
    if payload.training_completed == "NA" and not (payload.training_remark or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter a remark explaining why training is not applicable")
    if payload.training_attachment_id is not None:
        if payload.training_completed != "YES":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A training attachment is only added when trainings are completed")
        if not db.query(Attachment.id).filter(Attachment.id == payload.training_attachment_id).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Training attachment not found")


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
    _validate_training(db, payload)

    # Whose account: the initiator, or another person (request for others)
    beneficiary = {}
    if payload.for_others:
        emp_id = (payload.beneficiary_employee_id or "").strip()
        if not emp_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select or enter the user the request is for")
        if emp_id == current_user.employee_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use a normal request for your own access")
        known = db.query(User).filter(User.employee_id == emp_id).first()
        name = (payload.beneficiary_name or "").strip() or (known.name if known else "")
        if not name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the user's name")
        beneficiary = {
            "beneficiary_employee_id": emp_id,
            "beneficiary_name": name,
            "beneficiary_email": (payload.beneficiary_email or "").strip() or (known.email if known else None),
            "beneficiary_department": (payload.beneficiary_department or "").strip() or (known.department if known else None),
        }
    holder = beneficiary.get("beneficiary_employee_id", current_user.employee_id)

    temporary_days = None
    if payload.temporary_login:
        if payload.action not in GRANTING_ACTIONS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Temporary login applies to CREATE / ACTIVATE requests only")
        temporary_days = payload.temporary_days or TEMPORARY_LOGIN_DAYS[0]
        if temporary_days not in TEMPORARY_LOGIN_DAYS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Temporary login lasts 10 or 15 days")

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
        has_id = _has_user_id(db, holder, asset.equipment_code)
        who = "Your user ID" if holder == current_user.employee_id else f"{holder}'s user ID"
        if payload.action != "CREATE" and not has_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{who} does not exist on {asset.equipment_code} ({asset.name}). "
                f"Raise a CREATE request first; {payload.action} is only allowed for an existing user ID.",
            )
        # Equipment details recorded with the request
        form_data.update({
            "asset_name": asset.name,
            "computer_system_id": asset.computer_system_id,
            "hostname": asset.hostname,
            "ip_address": asset.ip_address,
        })

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
        for_others=payload.for_others, **beneficiary,
        training_completed=payload.training_completed,
        training_remark=(payload.training_remark or "").strip() or None,
        training_attachment_id=payload.training_attachment_id,
        temporary_login=payload.temporary_login, temporary_days=temporary_days,
    )
    db.add(req)
    db.flush()
    for_text = f" for {beneficiary['beneficiary_name']} ({holder})" if payload.for_others else ""
    _audit(db, req, current_user, "UAM_REQUEST_SUBMITTED",
           f"{current_user.name} submitted {req.request_code}{for_text} (e-signed). Reason: {reason}",
           field="Status", old=None, new=UAM_STATUS_PENDING_REVIEW)
    db.commit()
    db.refresh(req)
    return _out(req)


@router.post("/self-deactivate")
def self_deactivate(
    payload: SelfDeactivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    """Any user can ask for all of their own access to be deactivated (one
    DEACTIVATE request per system they hold an ID on)."""
    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    plant = _effective_plant(current_user, token_plant)
    holdings = [a for a in user_access(db, employee_id=current_user.employee_id) if a["status"] == "Active"]
    # Assets where a deactivation of *this user's own* ID is already in progress
    open_deactivations = {
        r.asset_code for r in db.query(UAMRequest).filter(
            UAMRequest.action == "DEACTIVATE", UAMRequest.status.in_(OPEN_STATUSES),
        )
        if (json.loads(r.form_data or "{}").get("target_employee_id") or r.beneficiary_employee_id or r.employee_id)
        == current_user.employee_id
    }
    created, skipped = [], []
    for a in holdings:
        eq = db.query(Equipment).filter(Equipment.equipment_code == a["equipment_code"]).first()
        if a["equipment_code"] in open_deactivations or (eq and eq.plant != plant):
            skipped.append(a["equipment_code"])
            continue
        src = db.query(UAMRequest).filter(UAMRequest.request_code == a.get("request_code")).first()
        new = UAMRequest(
            request_code=next_year_code(db, UAMRequest),
            employee_id=current_user.employee_id, employee_name=current_user.name, employee_email=current_user.email,
            template=src.template if src else "MANUFACTURING",
            asset_type=src.asset_type if src else ("SOFTWARE" if eq and eq.type == "Software" else "EQUIPMENT"),
            asset_code=a["equipment_code"], requested_role=a["role"], action="DEACTIVATE", plant=plant,
            reason=payload.reason,
            form_data=json.dumps({"self_bulk_deactivation": True, "asset_name": a["equipment_name"],
                                  "user_login_id": a["user_id"]}),
            reviewer_id=payload.reviewer_id, it_executor_id=payload.it_executor_id or None,
            status=UAM_STATUS_PENDING_REVIEW, auth_reason=reason,
            training_completed="NA", training_remark="Deactivation request",
        )
        db.add(new)
        db.flush()
        _audit(db, new, current_user, "UAM_SELF_DEACTIVATION",
               f"{current_user.name} requested deactivation of their access on {a['equipment_code']} (e-signed). "
               f"Reason: {payload.reason}", field="Status", new=UAM_STATUS_PENDING_REVIEW)
        created.append(new.request_code)
    db.commit()
    return {"created_requests": created, "count": len(created), "skipped": skipped}


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


@router.post("/{code}/reassign", response_model=UAMRequestOut)
def reassign(code: str, payload: UAMReassign, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Proxy user: the initiator replaces an assignee (absent or otherwise) for a
    stage that has not been completed yet. Recorded in the audit trail."""
    req = _get(db, code)
    if req.employee_id != current_user.employee_id and current_user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can change the assigned users")
    field, open_stages, roles = STAGE_FIELDS[payload.stage]
    if req.status not in open_stages:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That stage is already completed or the request is closed")
    if payload.stage == "department_approver" and req.template == "MANUFACTURING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Manufacturing requests have no department approval stage")
    new_user = db.query(User).filter(User.employee_id == payload.new_user_id, User.active.is_(True)).first()
    if not new_user or new_user.role not in roles or req.plant not in new_user.plants_list():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select an active user with the right role in this plant")
    if new_user.employee_id == req.employee_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The initiator cannot approve their own request")
    old = getattr(req, field)
    if old == new_user.employee_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That user is already assigned")
    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    setattr(req, field, new_user.employee_id)
    label = payload.stage.replace("_", " ").title()
    _audit(db, req, current_user, "UAM_REASSIGNED",
           f"{current_user.name} reassigned {label} from {old or 'unassigned'} to {new_user.employee_id} "
           f"(e-signed). Reason: {reason}", field=label, old=old, new=new_user.employee_id)
    db.commit(); db.refresh(req)
    return _out(req)


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


def _verbal_password(req: UAMRequest) -> bool:
    """New account requested for someone else: the password is shared verbally."""
    return bool(req.for_others) and req.action == "CREATE"


@router.post("/{code}/execute", response_model=UAMRequestOut)
def execute(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if current_user.role not in (ROLE_IT, ROLE_ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an IT executor can complete execution")
    _require_assignee(req, current_user, EXECUTION_STAGES)
    if not (payload.user_login_id or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User ID is required")
    verbal = _verbal_password(req)
    if verbal and payload.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "For a new user requested by someone else, the password is shared verbally; leave it empty")
    if not verbal and req.action in ACTIONS_NEEDING_PASSWORD and not payload.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Temporary password is required for this action")
    reason = _esign(current_user, payload.auth_password, payload.auth_reason)
    data = json.loads(req.form_data or "{}")
    data.update({"user_login_id": payload.user_login_id.strip(), "credential_set_at": datetime.utcnow().isoformat(),
                 "password_shared_verbally": verbal})
    req.form_data = json.dumps(data)
    # The temporary password is never emailed or audited: it is stored encrypted and
    # shown once, to the initiator, when they acknowledge the request.
    if payload.password and not verbal:
        encrypt, _ = _vault()
        req.temp_password_enc = encrypt(payload.password)
    if not req.it_executor_id:
        req.it_executor_id = current_user.employee_id
    _transition(db, req, current_user, UAM_STATUS_PENDING_ACK, "UAM_EXECUTION_COMPLETE", reason, payload.comment)
    initiator = db.query(User).filter(User.employee_id == req.employee_id).first()
    password_line = (
        "The password will be shared with the user verbally." if verbal else
        "Log in and open the request to acknowledge it; the temporary password is shown to you there."
        if req.temp_password_enc else ""
    )
    _notify(db, req, initiator,
            f"Access executed - {req.request_code}",
            f"{req.action} on {req.asset_code} has been executed by IT. User ID: {payload.user_login_id.strip()}. "
            f"{password_line}".strip(),
            "UAM_EXECUTED")
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/acknowledge", response_model=UAMAckOut)
def acknowledge(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id or req.status != UAM_STATUS_PENDING_ACK:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can acknowledge a completed execution")
    old = req.status
    req.status = UAM_STATUS_COMPLETED
    if req.temporary_login and req.temporary_days and req.action in GRANTING_ACTIONS:
        req.access_expires_on = local_today() + timedelta(days=req.temporary_days)
    temp_password = None
    if req.temp_password_enc:
        _, decrypt = _vault()
        temp_password = decrypt(req.temp_password_enc)
        req.temp_password_enc = None  # shown once, then wiped
    text = payload.comment or "Initiator acknowledged and closed request"
    if temp_password:
        text += "; temporary password displayed to the initiator"
    if req.access_expires_on:
        text += f"; temporary login until {req.access_expires_on:%d/%m/%Y}"
    _audit(db, req, current_user, "UAM_ACKNOWLEDGED", text, field="Status", old=old, new=UAM_STATUS_COMPLETED)
    db.commit(); db.refresh(req)
    out = _out(req).model_dump()
    return UAMAckOut(**out, temporary_password=temp_password)


@router.post("/{code}/cancel", response_model=UAMRequestOut)
def cancel(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id and current_user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can cancel this request")
    if req.status in (UAM_STATUS_COMPLETED, UAM_STATUS_REJECTED, UAM_STATUS_CANCELLED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This request is already closed")
    old = req.status
    req.status = UAM_STATUS_CANCELLED
    req.temp_password_enc = None
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

    # One DEACTIVATE request per system the user currently holds an ID on
    created = []
    for a in user_access(db, employee_id=payload.employee_id):
        if a["status"] != "Active":
            continue
        src = db.query(UAMRequest).filter(UAMRequest.request_code == a.get("request_code")).first()
        new_req = UAMRequest(
            request_code=next_year_code(db, UAMRequest),
            employee_id=current_user.employee_id,
            employee_name=current_user.name,
            employee_email=current_user.email,
            template=src.template if src else "MANUFACTURING",
            asset_type=src.asset_type if src else "EQUIPMENT",
            asset_code=a["equipment_code"],
            requested_role=a["role"],
            action="DEACTIVATE",
            plant=src.plant if src else target.plant,
            reason=payload.reason,
            form_data=json.dumps({"target_employee_id": payload.employee_id, "bulk_deactivation": True,
                                  "asset_name": a["equipment_name"]}),
            reviewer_id=src.reviewer_id if src else None,
            department_approver_id=src.department_approver_id if src else None,
            qa_approver_id=src.qa_approver_id if src else None,
            it_executor_id=payload.it_executor_id,
            status=UAM_STATUS_PENDING_REVIEW,
            training_completed="NA", training_remark="Deactivation request",
        )
        db.add(new_req)
        db.flush()  # so the next yearly code sees this one
        _audit(db, new_req, current_user, "UAM_BULK_DEACTIVATION",
               f"Bulk deactivation of {payload.employee_id} on {a['equipment_code']}: {payload.reason}",
               field="Status", old=None, new=UAM_STATUS_PENDING_REVIEW)
        created.append(new_req.request_code)

    db.commit()
    return {"created_requests": created, "count": len(created)}
