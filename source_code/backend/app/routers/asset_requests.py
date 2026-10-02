import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.constants import (
    ROLE_EMPLOYEE, ROLE_IT, ROLE_QA,
    ASSET_STATUS_APPROVED, ASSET_STATUS_CANCELLED, ASSET_STATUS_CORRECTION,
    ASSET_STATUS_CREATED, ASSET_STATUS_REJECTED, ASSET_STATUS_UNDER_APPROVAL,
    ASSET_STATUS_UNDER_IT_REVIEW, ASSET_STATUS_UNDER_REVIEW,
)
from app.database import get_db
from app.deps import get_current_user, require_role
from app.models import AssetCreationRequest, AuditLog, Equipment, User
from app.schemas import AssetCreationAction, AssetCreationRequestCreate, AssetCreationRequestOut

router = APIRouter(prefix="/api/asset-requests", tags=["asset-requests"])


def _next_code(db: Session) -> str:
    last = db.query(AssetCreationRequest).order_by(AssetCreationRequest.id.desc()).first()
    seq = 1
    if last:
        try:
            seq = int(last.request_code.split("-")[1]) + 1
        except (IndexError, ValueError):
            seq = last.id + 1
    return f"ACR-{seq:04d}"


def _audit(db: Session, req: AssetCreationRequest, user: User, action: str, description: str) -> None:
    db.add(AuditLog(
        request_code=req.request_code,
        user_employee_id=user.employee_id,
        user_name=user.name,
        action=action,
        description=description,
    ))


def _get(db: Session, code: str) -> AssetCreationRequest:
    req = db.query(AssetCreationRequest).filter(AssetCreationRequest.request_code == code).first()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset creation request not found")
    return req


def _can_see(user: User, req: AssetCreationRequest) -> bool:
    return user.role == "ADMIN" or req.employee_id == user.employee_id or user.employee_id in {
        req.reviewer_id, req.it_executor_id, req.qa_approver_id,
    }


@router.get("/selectors")
def selectors(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    reviewers = db.query(User).filter(User.role.in_(["HOD", "ADMIN"]), User.active.is_(True)).all()
    it_users = db.query(User).filter(User.role == "IT", User.active.is_(True)).all()
    qa_users = db.query(User).filter(User.role == "QA", User.active.is_(True)).all()
    return {
        "reviewers": [{"id": u.employee_id, "name": u.name, "department": u.department} for u in reviewers],
        "it_executors": [{"id": u.employee_id, "name": u.name} for u in it_users],
        "qa_approvers": [{"id": u.employee_id, "name": u.name, "department": u.department} for u in qa_users],
    }


@router.get("", response_model=list[AssetCreationRequestOut])
def list_requests(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AssetCreationRequest)
    if current_user.role == ROLE_EMPLOYEE:
        q = q.filter(AssetCreationRequest.employee_id == current_user.employee_id)
    elif current_user.role == ROLE_IT:
        q = q.filter(
            AssetCreationRequest.it_executor_id == current_user.employee_id,
            AssetCreationRequest.status == ASSET_STATUS_UNDER_IT_REVIEW,
        )
    elif current_user.role == ROLE_QA:
        q = q.filter(
            AssetCreationRequest.qa_approver_id == current_user.employee_id,
            AssetCreationRequest.status == ASSET_STATUS_UNDER_APPROVAL,
        )
    elif current_user.role not in ("ADMIN",):
        q = q.filter(
            (AssetCreationRequest.reviewer_id == current_user.employee_id) |
            (AssetCreationRequest.employee_id == current_user.employee_id),
        )
    if status_filter:
        q = q.filter(AssetCreationRequest.status == status_filter)
    return q.order_by(AssetCreationRequest.created_at.desc()).all()


@router.post("", response_model=AssetCreationRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: AssetCreationRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (ROLE_EMPLOYEE, "ADMIN"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an initiator can create an asset creation request")
    req = AssetCreationRequest(
        request_code=_next_code(db),
        employee_id=current_user.employee_id,
        employee_name=current_user.name,
        employee_email=current_user.email,
        system_name=payload.system_name,
        system_id=payload.system_id,
        system_type=payload.system_type,
        make=payload.make,
        model_name=payload.model_name,
        primary_function=payload.primary_function,
        application_name=payload.application_name,
        gamp_category=payload.gamp_category,
        department=payload.department,
        location=payload.location,
        usp_classification=payload.usp_classification,
        db_server_name=payload.db_server_name,
        computer_name=payload.computer_name,
        validation_summary_report_no=payload.validation_summary_report_no,
        approval_date=payload.approval_date,
        change_control_no=payload.change_control_no,
        reviewer_id=payload.reviewer_id,
        it_executor_id=payload.it_executor_id,
        qa_approver_id=payload.qa_approver_id,
        plant=payload.plant,
        form_data=json.dumps(payload.form_data),
        status=ASSET_STATUS_CREATED,
    )
    db.add(req)
    db.flush()
    _audit(db, req, current_user, "ASSET_REQUEST_CREATED", f"Asset creation request {req.request_code} submitted")
    db.commit()
    db.refresh(req)
    return req


@router.get("/{code}", response_model=AssetCreationRequestOut)
def get_request(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if not _can_see(current_user, req):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this request")
    return req


@router.post("/{code}/review-complete", response_model=AssetCreationRequestOut)
def review_complete(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if req.status != ASSET_STATUS_CREATED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request is not pending review")
    if req.reviewer_id and req.reviewer_id != current_user.employee_id and current_user.role != "ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not assigned as reviewer")
    req.status = ASSET_STATUS_UNDER_IT_REVIEW
    _audit(db, req, current_user, "ASSET_REVIEW_COMPLETE", payload.comment or "Review completed, forwarded to IT")
    db.commit(); db.refresh(req)
    return req


@router.post("/{code}/it-review-complete", response_model=AssetCreationRequestOut)
def it_review_complete(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if req.status != ASSET_STATUS_UNDER_IT_REVIEW:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request is not pending IT review")
    if req.it_executor_id and req.it_executor_id != current_user.employee_id and current_user.role != "ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not assigned as IT executor")
    req.status = ASSET_STATUS_UNDER_APPROVAL
    _audit(db, req, current_user, "ASSET_IT_REVIEW_COMPLETE", payload.comment or "IT review completed, forwarded to QA")
    db.commit(); db.refresh(req)
    return req


@router.post("/{code}/qa-approve", response_model=AssetCreationRequestOut)
def qa_approve(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if req.status != ASSET_STATUS_UNDER_APPROVAL:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request is not pending QA approval")
    if req.qa_approver_id and req.qa_approver_id != current_user.employee_id and current_user.role != "ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not assigned as QA approver")
    req.status = ASSET_STATUS_APPROVED
    _audit(db, req, current_user, "ASSET_QA_APPROVED", payload.comment or "QA approved")
    db.flush()

    # Auto-create equipment record when approved
    if req.system_name:
        from app.routers.equipment import _next_equipment_code
        eq = Equipment(
            equipment_code=_next_equipment_code(db),
            name=req.system_name,
            type=req.system_type or "Software",
            location=req.location or "",
            plant=req.plant,
            allowed_roles="Analyst",
            validation_date=req.approval_date or datetime.utcnow().date(),
            active=True,
            created_by=current_user.name,
            system_id=req.system_id,
            system_type=req.system_type,
            make=req.make,
            model_name=req.model_name,
            application_name=req.application_name,
            gamp_category=req.gamp_category,
            usp_classification=req.usp_classification,
            validation_status="under_validation",
            computer_system_id=req.computer_name,
        )
        db.add(eq)

    db.commit()
    db.refresh(req)
    return req


@router.post("/{code}/correction", response_model=AssetCreationRequestOut)
def correction(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if not _can_see(current_user, req):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    if not payload.comment:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Correction comment required")
    req.status = ASSET_STATUS_CORRECTION
    req.rejection_reason = payload.comment
    _audit(db, req, current_user, "ASSET_CORRECTION_REQUIRED", payload.comment)
    db.commit(); db.refresh(req)
    return req


@router.post("/{code}/resubmit", response_model=AssetCreationRequestOut)
def resubmit(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can resubmit")
    if req.status != ASSET_STATUS_CORRECTION:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request is not in correction state")
    req.status = ASSET_STATUS_CREATED
    req.rejection_reason = None
    _audit(db, req, current_user, "ASSET_RESUBMITTED", payload.comment or "Resubmitted after correction")
    db.commit(); db.refresh(req)
    return req


@router.post("/{code}/reject", response_model=AssetCreationRequestOut)
def reject(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if not _can_see(current_user, req):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized")
    req.status = ASSET_STATUS_REJECTED
    req.rejection_reason = payload.comment or "Rejected"
    _audit(db, req, current_user, "ASSET_REJECTED", req.rejection_reason)
    db.commit(); db.refresh(req)
    return req


@router.post("/{code}/cancel", response_model=AssetCreationRequestOut)
def cancel(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id and current_user.role != "ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can cancel")
    if req.status in (ASSET_STATUS_APPROVED, ASSET_STATUS_REJECTED, ASSET_STATUS_CANCELLED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request is already closed")
    req.status = ASSET_STATUS_CANCELLED
    _audit(db, req, current_user, "ASSET_CANCELLED", payload.comment or "Cancelled")
    db.commit(); db.refresh(req)
    return req
