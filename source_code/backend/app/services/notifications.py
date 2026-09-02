"""Mock notification service.

No SMTP, no outbound network call - every notification is simply written to
the `notifications` table with status "SENT". This keeps the workflow fully
demonstrable offline, while the function signatures below (recipient,
subject, body) are exactly what a real email/Graph/Teams integration would
need, so swapping one in later is a config change, not a rewrite. See the
client-facing spec, Section 10 and Section 14 (Phase 2).
"""

from sqlalchemy.orm import Session

from app.config import IT_NOTIFICATION_EMAIL
from app.models import AccessRequest, Notification


def _create(db: Session, req: AccessRequest, recipient_name: str, recipient_email: str,
            subject: str, body: str, ntype: str) -> Notification:
    note = Notification(
        request_code=req.request_code,
        recipient_name=recipient_name,
        recipient_email=recipient_email,
        subject=subject,
        body=body,
        type=ntype,
        status="SENT",
    )
    db.add(note)
    return note


def notify_request_submitted(db: Session, req: AccessRequest) -> None:
    _create(
        db, req, req.hod_name, req.hod_email,
        subject=f"New Access Request Pending Your Approval - {req.request_code}",
        body=(
            f"Dear {req.hod_name},\n\n"
            f"{req.employee_name} has requested access to {req.equipment_name} "
            f"as {req.requested_role}.\n\nReason: {req.reason}\n\n"
            f"Please review and approve or reject this request."
        ),
        ntype="REQUEST_SUBMITTED",
    )


def notify_hod_approved(db: Session, req: AccessRequest) -> None:
    _create(
        db, req, req.qa_name, req.qa_email,
        subject=f"Access Request Pending QA Review - {req.request_code}",
        body=(
            f"Dear {req.qa_name},\n\n"
            f"The request {req.request_code} from {req.employee_name} for "
            f"{req.equipment_name} has been approved by HOD {req.hod_name} and "
            f"now requires your review."
        ),
        ntype="HOD_APPROVED",
    )


def notify_qa_approved(db: Session, req: AccessRequest) -> None:
    _create(
        db, req, req.employee_name, req.employee_email,
        subject=f"Your Access Request Has Been Approved - {req.request_code}",
        body=(
            f"Dear {req.employee_name},\n\n"
            f"Your request for {req.equipment_name} has been approved by both "
            f"your HOD and QA. IT will provision your access shortly."
        ),
        ntype="QA_APPROVED",
    )
    _create(
        db, req, "IT Support", IT_NOTIFICATION_EMAIL,
        subject=f"Access Provisioning Required - {req.request_code}",
        body=(
            f"{req.request_code} for {req.employee_name} "
            f"({req.equipment_name}, role: {req.requested_role}) has been fully "
            f"approved and is ready for provisioning."
        ),
        ntype="IT_PROVISIONING_REQUIRED",
    )


def notify_it_completed(db: Session, req: AccessRequest) -> None:
    _create(
        db, req, req.employee_name, req.employee_email,
        subject=f"Access Granted - {req.request_code}",
        body=(
            f"Dear {req.employee_name},\n\n"
            f"Your access to {req.equipment_name} has been provisioned. "
            f"You may now use this equipment."
        ),
        ntype="ACCESS_COMPLETED",
    )


def notify_rejected(db: Session, req: AccessRequest, stage: str) -> None:
    _create(
        db, req, req.employee_name, req.employee_email,
        subject=f"Your Access Request Was Rejected - {req.request_code}",
        body=(
            f"Dear {req.employee_name},\n\n"
            f"Your request for {req.equipment_name} was rejected at the {stage} "
            f"stage.\n\nReason: {req.rejection_reason}"
        ),
        ntype="REQUEST_REJECTED",
    )
