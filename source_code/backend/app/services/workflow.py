"""Workflow service.

Every function here is the single place a rule from the client-facing spec
(Section 8, "Business Rules") is enforced. Routers stay thin and only call
into this module - the rules apply no matter what the frontend sends.
"""

from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.constants import (
    ROLE_EMPLOYEE, ROLE_HOD, ROLE_IT, ROLE_QA,
    STATUS_IT_COMPLETED, STATUS_IT_PENDING, STATUS_PENDING_HOD,
    STATUS_PENDING_QA, STATUS_REJECTED,
)
from app.models import AccessRequest, Approver, Equipment, User
from app.schemas import RequestCreate
from app.services import notifications as notify


def _next_request_code(db: Session) -> str:
    last = (
        db.query(AccessRequest)
        .order_by(AccessRequest.id.desc())
        .first()
    )
    next_seq = 1
    if last is not None:
        try:
            next_seq = int(last.request_code.split("-")[1]) + 1
        except (IndexError, ValueError):
            next_seq = last.id + 1
    return f"REQ-{next_seq:04d}"


def _audit(db: Session, request_code: Optional[str], user: User, action: str, description: str) -> None:
    from app.models import AuditLog

    db.add(
        AuditLog(
            request_code=request_code,
            user_employee_id=user.employee_id,
            user_name=user.name,
            action=action,
            description=description,
        )
    )


def submit_request(db: Session, current_user: User, payload: RequestCreate) -> AccessRequest:
    if current_user.role != ROLE_EMPLOYEE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only employees can submit access requests")

    equipment = (
        db.query(Equipment)
        .filter(Equipment.equipment_code == payload.equipment_code)
        .first()
    )
    if equipment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Equipment not found")
    if not equipment.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This equipment is inactive and cannot be requested")
    if payload.requested_role not in equipment.roles_list():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"'{payload.requested_role}' is not a valid role for {equipment.name}",
        )

    hod = db.query(Approver).filter(Approver.approver_code == payload.hod_id).first()
    if hod is None or hod.type != ROLE_HOD or not hod.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected HOD is not a valid, active approver")

    qa = db.query(Approver).filter(Approver.approver_code == payload.qa_id).first()
    if qa is None or qa.type != ROLE_QA or not qa.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Selected QA is not a valid, active approver")

    req = AccessRequest(
        request_code=_next_request_code(db),
        employee_id=current_user.employee_id,
        employee_name=current_user.name,
        employee_email=current_user.email,
        employee_department=current_user.department,
        equipment_code=equipment.equipment_code,
        equipment_name=equipment.name,
        requested_role=payload.requested_role,
        hod_id=hod.approver_code,
        hod_name=hod.name,
        hod_email=hod.email,
        qa_id=qa.approver_code,
        qa_name=qa.name,
        qa_email=qa.email,
        reason=payload.reason,
        status=STATUS_PENDING_HOD,
    )
    db.add(req)
    db.flush()

    _audit(
        db, req.request_code, current_user, "REQUEST_SUBMITTED",
        f"{current_user.name} submitted {req.request_code} for {equipment.name} "
        f"as {payload.requested_role}",
    )
    notify.notify_request_submitted(db, req)

    db.commit()
    db.refresh(req)
    return req


def _get_request(db: Session, request_code: str) -> AccessRequest:
    req = db.query(AccessRequest).filter(AccessRequest.request_code == request_code).first()
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return req


def approve_request(db: Session, current_user: User, request_code: str) -> AccessRequest:
    req = _get_request(db, request_code)

    if req.status == STATUS_PENDING_HOD:
        if current_user.role != ROLE_HOD or current_user.employee_id != req.hod_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This request is not assigned to you")
        req.status = STATUS_PENDING_QA
        _audit(db, req.request_code, current_user, "HOD_APPROVED",
               f"HOD {current_user.name} approved {req.request_code}")
        notify.notify_hod_approved(db, req)

    elif req.status == STATUS_PENDING_QA:
        if current_user.role != ROLE_QA or current_user.employee_id != req.qa_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This request is not assigned to you")
        req.status = STATUS_IT_PENDING
        _audit(db, req.request_code, current_user, "QA_APPROVED",
               f"QA {current_user.name} approved {req.request_code}")
        notify.notify_qa_approved(db, req)

    else:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{req.request_code} is not awaiting approval (current status: {req.status})",
        )

    db.commit()
    db.refresh(req)
    return req


def reject_request(db: Session, current_user: User, request_code: str, reason: str) -> AccessRequest:
    req = _get_request(db, request_code)

    if req.status == STATUS_PENDING_HOD:
        if current_user.role != ROLE_HOD or current_user.employee_id != req.hod_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This request is not assigned to you")
        stage = "HOD"
    elif req.status == STATUS_PENDING_QA:
        if current_user.role != ROLE_QA or current_user.employee_id != req.qa_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This request is not assigned to you")
        stage = "QA"
    else:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{req.request_code} is not awaiting approval (current status: {req.status})",
        )

    req.status = STATUS_REJECTED
    req.rejected_stage = stage
    req.rejection_reason = reason
    _audit(db, req.request_code, current_user, f"{stage}_REJECTED",
           f"{stage} {current_user.name} rejected {req.request_code}: {reason}")
    notify.notify_rejected(db, req, stage)

    db.commit()
    db.refresh(req)
    return req


def complete_request(db: Session, current_user: User, request_code: str) -> AccessRequest:
    req = _get_request(db, request_code)

    if current_user.role != ROLE_IT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only IT can complete provisioning")
    if req.status != STATUS_IT_PENDING:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{req.request_code} is not awaiting IT provisioning (current status: {req.status})",
        )

    req.status = STATUS_IT_COMPLETED
    _audit(db, req.request_code, current_user, "IT_COMPLETED",
           f"IT ({current_user.name}) marked {req.request_code} as access completed")
    notify.notify_it_completed(db, req)

    db.commit()
    db.refresh(req)
    return req
