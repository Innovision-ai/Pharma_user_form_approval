import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.constants import (
    ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_HOD, ROLE_INVENTORY_REQUESTOR, ROLE_IT, ROLE_QA,
    ASSET_STATUS_APPROVED, ASSET_STATUS_CANCELLED, ASSET_STATUS_CORRECTION,
    ASSET_STATUS_CREATED, ASSET_STATUS_REJECTED, ASSET_STATUS_UNDER_APPROVAL,
    ASSET_STATUS_UNDER_IT_REVIEW, ASSET_STATUS_UNDER_REVIEW,
)
from app.database import get_db
from app.deps import get_current_plant, get_current_user
from app.models import AssetCreationRequest, AuditLog, Equipment, User
from app.numbering import next_year_code
from app.schemas import AssetCreationAction, AssetCreationRequestCreate, AssetCreationRequestOut

router = APIRouter(prefix="/api/asset-requests", tags=["asset-requests"])

OPEN_STATUSES = (ASSET_STATUS_CREATED, ASSET_STATUS_UNDER_REVIEW, ASSET_STATUS_CORRECTION,
                 ASSET_STATUS_UNDER_IT_REVIEW, ASSET_STATUS_UNDER_APPROVAL)
# Who may act on a stage when nobody was assigned to it
STAGE_ROLES = {
    ASSET_STATUS_CREATED: (ROLE_HOD, ROLE_ADMIN),
    ASSET_STATUS_UNDER_IT_REVIEW: (ROLE_IT, ROLE_ADMIN),
    ASSET_STATUS_UNDER_APPROVAL: (ROLE_QA, ROLE_ADMIN),
}


def next_asset_code(db: Session) -> str:
    """Yearly asset request number, e.g. AST-26-000001."""
    return next_year_code(db, AssetCreationRequest, prefix="AST-")


def _audit(db: Session, req: AssetCreationRequest, user: User, action: str, description: str,
           old: Optional[str] = None, new: Optional[str] = None) -> None:
    db.add(AuditLog(
        request_code=req.request_code,
        user_employee_id=user.employee_id,
        user_name=user.name,
        action=action,
        description=description,
        entity=f"Asset request {req.request_code}",
        field_name="Status" if new else None,
        old_value=old,
        new_value=new,
        plant=req.plant,
    ))


def _get(db: Session, code: str) -> AssetCreationRequest:
    req = db.query(AssetCreationRequest).filter(AssetCreationRequest.request_code == code).first()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset request not found")
    return req


def _can_see(user: User, req: AssetCreationRequest) -> bool:
    return user.role == ROLE_ADMIN or req.employee_id == user.employee_id or user.employee_id in {
        req.reviewer_id, req.it_executor_id, req.qa_approver_id,
    }


def _stage_assignee(req: AssetCreationRequest) -> Optional[str]:
    return {
        ASSET_STATUS_CREATED: req.reviewer_id,
        ASSET_STATUS_UNDER_REVIEW: req.reviewer_id,
        ASSET_STATUS_UNDER_IT_REVIEW: req.it_executor_id,
        ASSET_STATUS_UNDER_APPROVAL: req.qa_approver_id,
    }.get(req.status)


def _require_stage_actor(req: AssetCreationRequest, user: User) -> None:
    """The assigned user acts on the current stage; if unassigned, the stage's role does."""
    assignee = _stage_assignee(req)
    if assignee:
        if assignee != user.employee_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This stage is assigned to another user")
        return
    if user.role not in STAGE_ROLES.get(req.status, (ROLE_ADMIN,)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot act on this stage")


def _move(db: Session, req: AssetCreationRequest, user: User, new_status: str, action: str, text: str) -> None:
    old = req.status
    req.status = new_status
    _audit(db, req, user, action, text, old=old, new=new_status)


def _plant_users(db: Session, plant: str, roles: list[str]) -> list[User]:
    users = db.query(User).filter(User.role.in_(roles), User.active.is_(True)).order_by(User.employee_id).all()
    return [u for u in users if plant in u.plants_list()]


def create_linked_create_request(db: Session, eq: Equipment, user: User) -> AssetCreationRequest:
    """Asset CREATE request for equipment registered directly in Equipment Master.
    It goes through the normal review so the equipment can later be validated."""
    req = AssetCreationRequest(
        request_code=next_asset_code(db),
        employee_id=user.employee_id,
        employee_name=user.name,
        employee_email=user.email,
        system_name=eq.name,
        system_id=eq.system_id,
        system_type=eq.system_type,
        make=eq.make,
        model_name=eq.model_name,
        application_name=eq.application_name,
        gamp_category=eq.gamp_category,
        department=eq.location,
        location=eq.location,
        usp_classification=eq.usp_classification,
        computer_name=eq.computer_system_id,
        plant=eq.plant,
        request_type="CREATE",
        equipment_code=eq.equipment_code,
        form_data=json.dumps({"source": "equipment_master"}),
        status=ASSET_STATUS_CREATED,
    )
    db.add(req)
    db.flush()
    _audit(db, req, user, "ASSET_REQUEST_CREATED",
           f"Asset creation request {req.request_code} raised for new equipment {eq.equipment_code}",
           new=ASSET_STATUS_CREATED)
    return req


@router.get("/selectors")
def selectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    plant = token_plant or current_user.plant
    return {
        "reviewers": [{"id": u.employee_id, "name": u.name, "department": u.department}
                      for u in _plant_users(db, plant, [ROLE_HOD])],
        "it_executors": [{"id": u.employee_id, "name": u.name}
                         for u in _plant_users(db, plant, [ROLE_ADMIN, ROLE_IT])],
        "qa_approvers": [{"id": u.employee_id, "name": u.name, "department": u.department}
                         for u in _plant_users(db, plant, [ROLE_QA])],
    }


@router.get("", response_model=list[AssetCreationRequestOut])
def list_requests(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    request_type: Optional[str] = None,
    equipment_code: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    q = db.query(AssetCreationRequest)
    if token_plant:
        q = q.filter(AssetCreationRequest.plant == token_plant)
    if current_user.role != ROLE_ADMIN:
        me = current_user.employee_id
        visible = [
            AssetCreationRequest.employee_id == me,
            AssetCreationRequest.reviewer_id == me,
            AssetCreationRequest.it_executor_id == me,
            AssetCreationRequest.qa_approver_id == me,
        ]
        # Unassigned stages are visible to the role that can act on them
        unassigned = {
            ROLE_HOD: (AssetCreationRequest.reviewer_id, ASSET_STATUS_CREATED),
            ROLE_IT: (AssetCreationRequest.it_executor_id, ASSET_STATUS_UNDER_IT_REVIEW),
            ROLE_QA: (AssetCreationRequest.qa_approver_id, ASSET_STATUS_UNDER_APPROVAL),
        }.get(current_user.role)
        if unassigned:
            col, stage = unassigned
            visible.append(and_(col.is_(None), AssetCreationRequest.status == stage))
        q = q.filter(or_(*visible))
    if status_filter:
        q = q.filter(AssetCreationRequest.status == status_filter)
    if request_type:
        q = q.filter(AssetCreationRequest.request_type == request_type)
    if equipment_code:
        q = q.filter(AssetCreationRequest.equipment_code == equipment_code)
    return q.order_by(AssetCreationRequest.created_at.desc()).all()


@router.post("", response_model=AssetCreationRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: AssetCreationRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    if current_user.role not in (ROLE_EMPLOYEE, ROLE_ADMIN, ROLE_INVENTORY_REQUESTOR):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an initiator can create an asset request")
    plant = token_plant or payload.plant
    fields = payload.model_dump(exclude={"form_data", "plant", "request_type", "equipment_code"})

    eq = None
    if payload.request_type == "RETIRE" or payload.equipment_code:
        if not payload.equipment_code:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select the equipment to retire")
        eq = db.query(Equipment).filter(Equipment.equipment_code == payload.equipment_code).first()
        if not eq:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")
    if payload.request_type == "RETIRE":
        if not eq.active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{eq.equipment_code} is already retired")
        open_retire = db.query(AssetCreationRequest).filter(
            AssetCreationRequest.equipment_code == eq.equipment_code,
            AssetCreationRequest.request_type == "RETIRE",
            AssetCreationRequest.status.in_(OPEN_STATUSES),
        ).first()
        if open_retire:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"Retire request {open_retire.request_code} is already open for {eq.equipment_code}")
        plant = eq.plant
        # Snapshot the equipment being retired so the request is self-describing
        fields.update({
            "system_name": eq.name, "system_id": eq.system_id, "system_type": eq.system_type,
            "make": eq.make, "model_name": eq.model_name, "application_name": eq.application_name,
            "gamp_category": eq.gamp_category, "usp_classification": eq.usp_classification,
            "department": fields.get("department") or eq.location, "location": eq.location,
            "computer_name": eq.computer_system_id,
        })
    elif not (payload.system_name or "").strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "System name is required")

    req = AssetCreationRequest(
        request_code=next_asset_code(db),
        employee_id=current_user.employee_id,
        employee_name=current_user.name,
        employee_email=current_user.email,
        plant=plant,
        request_type=payload.request_type,
        equipment_code=eq.equipment_code if eq else None,
        form_data=json.dumps(payload.form_data),
        status=ASSET_STATUS_CREATED,
        **fields,
    )
    db.add(req)
    db.flush()
    kind = "retire" if payload.request_type == "RETIRE" else "creation"
    _audit(db, req, current_user, "ASSET_REQUEST_CREATED",
           f"Asset {kind} request {req.request_code} submitted" + (f" for {eq.equipment_code}" if eq else ""),
           new=ASSET_STATUS_CREATED)
    db.commit()
    db.refresh(req)
    return req


@router.get("/{code}", response_model=AssetCreationRequestOut)
def get_request(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    req = _get(db, code)
    if not (_can_see(current_user, req) or current_user.role in STAGE_ROLES.get(req.status, ())):
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
    _require_stage_actor(req, current_user)
    if not req.reviewer_id:
        req.reviewer_id = current_user.employee_id
    _move(db, req, current_user, ASSET_STATUS_UNDER_IT_REVIEW, "ASSET_REVIEW_COMPLETE",
          payload.comment or "Review completed, forwarded to IT")
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
    _require_stage_actor(req, current_user)
    if not req.it_executor_id:
        req.it_executor_id = current_user.employee_id
    _move(db, req, current_user, ASSET_STATUS_UNDER_APPROVAL, "ASSET_IT_REVIEW_COMPLETE",
          payload.comment or "IT review completed, forwarded to QA")
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
    _require_stage_actor(req, current_user)
    if not req.qa_approver_id:
        req.qa_approver_id = current_user.employee_id
    _move(db, req, current_user, ASSET_STATUS_APPROVED, "ASSET_QA_APPROVED", payload.comment or "QA approved")
    db.flush()

    if req.request_type == "RETIRE":
        # Approved retire request retires the equipment (drops it from PM, backup and periodic review)
        eq = db.query(Equipment).filter(Equipment.equipment_code == req.equipment_code).first()
        if eq and eq.active:
            eq.active = False
            db.add(AuditLog(
                request_code=req.request_code, user_employee_id=current_user.employee_id,
                user_name=current_user.name, action="EQUIPMENT_STATUS_CHANGED",
                description=f"Equipment {eq.equipment_code} retired by approved retire request {req.request_code}",
                entity=eq.equipment_code, field_name="Status", old_value="Active", new_value="Retired",
                plant=eq.plant,
            ))
    elif not req.equipment_code and req.system_name:
        # New system: register it in Equipment Master, linked to this request
        from app.routers.equipment import next_equipment_code
        eq = Equipment(
            equipment_code=next_equipment_code(db),
            name=req.system_name,
            type=req.system_type or "Software",
            location=req.department or req.location or "",
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
        db.flush()
        req.equipment_code = eq.equipment_code
        db.add(AuditLog(
            request_code=req.request_code, user_employee_id=current_user.employee_id,
            user_name=current_user.name, action="EQUIPMENT_CREATED",
            description=f"Equipment {eq.equipment_code} registered from approved asset request {req.request_code}",
            entity=eq.equipment_code, field_name="Status", new_value="Active", plant=eq.plant,
        ))

    db.commit()
    db.refresh(req)
    return req


@router.post("/{code}/correction", response_model=AssetCreationRequestOut)
def correction(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if req.status not in (ASSET_STATUS_CREATED, ASSET_STATUS_UNDER_REVIEW,
                          ASSET_STATUS_UNDER_IT_REVIEW, ASSET_STATUS_UNDER_APPROVAL):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Correction can only be requested on an open stage")
    _require_stage_actor(req, current_user)
    if not payload.comment:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Correction comment required")
    req.rejection_reason = payload.comment
    _move(db, req, current_user, ASSET_STATUS_CORRECTION, "ASSET_CORRECTION_REQUIRED", payload.comment)
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
    req.rejection_reason = None
    _move(db, req, current_user, ASSET_STATUS_CREATED, "ASSET_RESUBMITTED", payload.comment or "Resubmitted after correction")
    db.commit(); db.refresh(req)
    return req


@router.post("/{code}/reject", response_model=AssetCreationRequestOut)
def reject(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if req.status not in (ASSET_STATUS_CREATED, ASSET_STATUS_UNDER_REVIEW,
                          ASSET_STATUS_UNDER_IT_REVIEW, ASSET_STATUS_UNDER_APPROVAL):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only an open request can be rejected")
    _require_stage_actor(req, current_user)
    req.rejection_reason = payload.comment or "Rejected"
    _move(db, req, current_user, ASSET_STATUS_REJECTED, "ASSET_REJECTED", req.rejection_reason)
    db.commit(); db.refresh(req)
    return req


@router.post("/{code}/cancel", response_model=AssetCreationRequestOut)
def cancel(
    code: str, payload: AssetCreationAction,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    req = _get(db, code)
    if req.employee_id != current_user.employee_id and current_user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the initiator can cancel")
    if req.status in (ASSET_STATUS_APPROVED, ASSET_STATUS_REJECTED, ASSET_STATUS_CANCELLED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Request is already closed")
    _move(db, req, current_user, ASSET_STATUS_CANCELLED, "ASSET_CANCELLED", payload.comment or "Cancelled")
    db.commit(); db.refresh(req)
    return req
