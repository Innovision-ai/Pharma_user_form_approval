import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.constants import (
    ROLE_EMPLOYEE, ROLE_HOD, ROLE_IT, ROLE_QA,
    UAM_STATUS_CANCELLED, UAM_STATUS_COMPLETED, UAM_STATUS_CORRECTION,
    UAM_STATUS_PENDING_ACK, UAM_STATUS_PENDING_DEPARTMENT,
    UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_PENDING_QA,
    UAM_STATUS_PENDING_REVIEW, UAM_STATUS_REJECTED, UAM_STATUS_SUSPENDED,
)
from app.database import get_db
from app.deps import get_current_user
from app.models import AccessRequest, AuditLog, Equipment, UAMRequest, User
from app.schemas import UAMAction, UAMRequestCreate, UAMRequestOut
from app.services import notifications as notify

router = APIRouter(prefix="/api/uam/requests", tags=["uam-requests"])


def _next_code(db: Session) -> str:
    last = db.query(UAMRequest).order_by(UAMRequest.id.desc()).first()
    seq = 1
    if last:
        try:
            seq = int(last.request_code.split("-")[1]) + 1
        except (IndexError, ValueError):
            seq = last.id + 1
    return f"UAM-{seq:04d}"


def _audit(db: Session, req: UAMRequest, user: User, action: str, description: str) -> None:
    db.add(AuditLog(
        request_code=req.request_code,
        user_employee_id=user.employee_id,
        user_name=user.name,
        action=action,
        description=description,
    ))


def _out(req: UAMRequest) -> UAMRequestOut:
    data = {column.name: getattr(req, column.name) for column in UAMRequest.__table__.columns}
    data["form_data"] = json.loads(req.form_data or "{}")
    return UAMRequestOut.model_validate(data)


def _get(db: Session, code: str) -> UAMRequest:
    req = db.query(UAMRequest).filter(UAMRequest.request_code == code).first()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "UAM request not found")
    return req


def _can_see(user: User, req: UAMRequest) -> bool:
    return user.role == "ADMIN" or req.employee_id == user.employee_id or user.employee_id in {
        req.reviewer_id, req.department_approver_id, req.qa_approver_id, req.it_executor_id,
    }


@router.get("/templates")
def templates():
    return {
        "templates": [
            {"code": "MANUFACTURING", "asset_types": ["EQUIPMENT"], "requires_qa": True},
            {"code": "QC", "asset_types": ["SOFTWARE"], "requires_qa": False},
            {"code": "ERP", "asset_types": ["SOFTWARE"], "requires_qa": False},
        ],
        "actions": ["CREATE", "MODIFY", "DEACTIVATE", "ACTIVATE", "UNLOCK", "CHANGE_PASSWORD"],
    }


@router.get("", response_model=list[UAMRequestOut])
def list_requests(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    plant: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(UAMRequest)
    if plant:
        q = q.filter(UAMRequest.plant == plant)
    if current_user.role != "ADMIN":
        q = q.filter(UAMRequest.plant == current_user.plant)
    if status_filter:
        q = q.filter(UAMRequest.status == status_filter)
    if current_user.role == ROLE_EMPLOYEE:
        q = q.filter(UAMRequest.employee_id == current_user.employee_id)
    elif current_user.role == ROLE_HOD:
        q = q.filter(UAMRequest.reviewer_id == current_user.employee_id, UAMRequest.status == UAM_STATUS_PENDING_REVIEW)
    elif current_user.role == ROLE_QA:
        q = q.filter(UAMRequest.qa_approver_id == current_user.employee_id, UAMRequest.status == UAM_STATUS_PENDING_QA)
    elif current_user.role == ROLE_IT:
        q = q.filter(UAMRequest.it_executor_id == current_user.employee_id, UAMRequest.status.in_([UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_SUSPENDED]))
    return [_out(item) for item in q.order_by(UAMRequest.created_at.desc()).all()]


@router.post("", response_model=UAMRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: UAMRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (ROLE_EMPLOYEE, "ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an initiator can create a UAM request")
    if payload.plant != current_user.plant and current_user.role != "ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this plant")
    if payload.asset_type == "EQUIPMENT":
        asset = db.query(Equipment).filter(Equipment.equipment_code == payload.asset_code).first()
        if not asset or not asset.active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected equipment is not active")
        if payload.requested_role not in asset.roles_list():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Requested role is not available for this equipment")
    if payload.template == "MANUFACTURING" and payload.asset_type != "EQUIPMENT":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Manufacturing requests must target equipment")
    if payload.template in ("QC", "ERP") and payload.asset_type != "SOFTWARE":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "QC and ERP requests must target software")
    if payload.template == "MANUFACTURING" and not payload.qa_approver_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A QA approver is required for Manufacturing requests")
    req = UAMRequest(
        request_code=_next_code(db), employee_id=current_user.employee_id,
        employee_name=current_user.name, employee_email=current_user.email,
        template=payload.template, asset_type=payload.asset_type, asset_code=payload.asset_code,
        requested_role=payload.requested_role, action=payload.action, plant=payload.plant,
        reason=payload.reason, form_data=json.dumps(payload.form_data),
        reviewer_id=payload.reviewer_id, department_approver_id=payload.department_approver_id,
        qa_approver_id=payload.qa_approver_id, it_executor_id=payload.it_executor_id,
        status=UAM_STATUS_PENDING_REVIEW,
    )
    db.add(req)
    db.flush()
    _audit(db, req, current_user, "UAM_REQUEST_SUBMITTED", f"{current_user.name} submitted {req.request_code}")
    db.commit()
    db.refresh(req)
    return _out(req)


@router.get("/{code}", response_model=UAMRequestOut)
def get_request(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if not _can_see(current_user, req):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this request")
    return _out(req)


@router.post("/{code}/approve", response_model=UAMRequestOut)
def approve(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if req.status == UAM_STATUS_PENDING_REVIEW and req.reviewer_id == current_user.employee_id:
        req.status = UAM_STATUS_PENDING_QA if req.template == "MANUFACTURING" else UAM_STATUS_PENDING_DEPARTMENT
    elif req.status == UAM_STATUS_PENDING_DEPARTMENT and req.department_approver_id == current_user.employee_id:
        req.status = UAM_STATUS_PENDING_EXECUTION
    elif req.status == UAM_STATUS_PENDING_QA and req.qa_approver_id == current_user.employee_id:
        req.status = UAM_STATUS_PENDING_EXECUTION
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This request is not assigned to you")
    _audit(db, req, current_user, "UAM_APPROVED", payload.comment or f"Approved {req.request_code}")
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/correction", response_model=UAMRequestOut)
def correction(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if not _can_see(current_user, req) or current_user.role not in (ROLE_HOD, ROLE_QA, ROLE_IT, "ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to request correction")
    if not payload.comment:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A correction comment is required")
    req.status = UAM_STATUS_CORRECTION
    req.rejection_reason = payload.comment
    _audit(db, req, current_user, "CORRECTION_REQUIRED", payload.comment)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/reject", response_model=UAMRequestOut)
def reject(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if not _can_see(current_user, req) or current_user.role not in (ROLE_HOD, ROLE_QA, "ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized to reject this request")
    req.status = UAM_STATUS_REJECTED
    req.rejection_reason = payload.comment or "Rejected by approver"
    _audit(db, req, current_user, "UAM_REJECTED", req.rejection_reason)
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/execute", response_model=UAMRequestOut)
def execute(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if req.it_executor_id and req.it_executor_id != current_user.employee_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This request is assigned to another executor")
    if current_user.role not in (ROLE_IT, "ADMIN") or req.status not in (UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_SUSPENDED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request is not ready for execution")
    if not payload.user_login_id or not payload.password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "User ID and password are required")
    # Keep credential values out of the response and audit text; the legacy flow retains them only for its demo.
    data = json.loads(req.form_data or "{}")
    data.update({"user_login_id": payload.user_login_id, "credential_set_at": datetime.utcnow().isoformat()})
    req.form_data = json.dumps(data)
    req.status = UAM_STATUS_PENDING_ACK
    _audit(db, req, current_user, "UAM_EXECUTION_COMPLETE", f"Execution completed for {req.request_code}")
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/acknowledge", response_model=UAMRequestOut)
def acknowledge(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id or req.status != UAM_STATUS_PENDING_ACK:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can acknowledge a completed execution")
    req.status = UAM_STATUS_COMPLETED
    _audit(db, req, current_user, "UAM_ACKNOWLEDGED", payload.comment or "Initiator acknowledged and closed request")
    db.commit(); db.refresh(req)
    return _out(req)


@router.post("/{code}/cancel", response_model=UAMRequestOut)
def cancel(code: str, payload: UAMAction, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id and current_user.role != "ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can cancel this request")
    if req.status in (UAM_STATUS_COMPLETED, UAM_STATUS_REJECTED, UAM_STATUS_CANCELLED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This request is already closed")
    req.status = UAM_STATUS_CANCELLED
    _audit(db, req, current_user, "UAM_CANCELLED", payload.comment or "Request cancelled")
    db.commit(); db.refresh(req)
    return _out(req)
