from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.constants import (
    STATUS_IT_COMPLETED, STATUS_IT_PENDING, STATUS_PENDING_HOD, STATUS_PENDING_QA,
    UAM_STATUS_CORRECTION, UAM_STATUS_PENDING_ACK, UAM_STATUS_PENDING_DEPARTMENT,
    UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_PENDING_QA, UAM_STATUS_PENDING_REVIEW,
)
from app.database import get_db
from typing import Optional

from app.deps import get_current_plant, get_current_user
from app.models import AccessRequest, Equipment, UAMRequest, User
from app.schemas import DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    token_plant: Optional[str] = Depends(get_current_plant),
):
    from app.routers.password_vault import sweep_expiry_notifications
    from app.routers.uam_requests import _out as uam_out
    sweep_expiry_notifications(db)

    eq_q = db.query(Equipment)
    if token_plant:
        eq_q = eq_q.filter(Equipment.plant == token_plant)
    total_equipment = eq_q.count()
    active_equipment = eq_q.filter(Equipment.active.is_(True)).count()
    pending_hod = db.query(AccessRequest).filter(AccessRequest.status == STATUS_PENDING_HOD).count()
    pending_qa = db.query(AccessRequest).filter(AccessRequest.status == STATUS_PENDING_QA).count()
    it_pending = db.query(AccessRequest).filter(AccessRequest.status == STATUS_IT_PENDING).count()
    approved_requests = db.query(AccessRequest).filter(AccessRequest.status == STATUS_IT_COMPLETED).count()
    recent_requests = (
        db.query(AccessRequest).order_by(AccessRequest.created_at.desc()).limit(10).all()
    )

    # User-specific metrics
    uid = current_user.employee_id
    user_total_requests = db.query(AccessRequest).filter(AccessRequest.employee_id == uid).count()
    user_uam_requests = db.query(UAMRequest).filter(UAMRequest.employee_id == uid).count()

    completed_for_user = (
        db.query(AccessRequest)
        .filter(AccessRequest.employee_id == uid, AccessRequest.status == STATUS_IT_COMPLETED)
        .all()
    )
    user_equipment_count = len({r.equipment_code for r in completed_for_user})

    user_pending_actions = (
        db.query(UAMRequest)
        .filter(
            ((UAMRequest.reviewer_id == uid) & (UAMRequest.status == UAM_STATUS_PENDING_REVIEW))
            | ((UAMRequest.department_approver_id == uid) & (UAMRequest.status == UAM_STATUS_PENDING_DEPARTMENT))
            | ((UAMRequest.qa_approver_id == uid) & (UAMRequest.status == UAM_STATUS_PENDING_QA))
            | ((UAMRequest.it_executor_id == uid) & (UAMRequest.status == UAM_STATUS_PENDING_EXECUTION))
            | ((UAMRequest.employee_id == uid) & (UAMRequest.status.in_([UAM_STATUS_PENDING_ACK, UAM_STATUS_CORRECTION])))
        )
        .count()
    )

    # Validation alerts
    threshold = date.today() - timedelta(days=60)
    validation_alerts = (
        eq_q.filter(Equipment.validation_status == "under_validation", Equipment.active.is_(True))
        .count()
    )

    plant = token_plant or current_user.plant
    uam_q = db.query(UAMRequest).filter(UAMRequest.plant == plant)
    if current_user.role != "ADMIN":
        uam_q = uam_q.filter(
            (UAMRequest.employee_id == uid) | (UAMRequest.reviewer_id == uid)
            | (UAMRequest.department_approver_id == uid) | (UAMRequest.qa_approver_id == uid)
            | (UAMRequest.it_executor_id == uid)
        )
    recent_uam = [uam_out(r) for r in uam_q.order_by(UAMRequest.created_at.desc()).limit(10).all()]

    return DashboardSummary(
        total_equipment=total_equipment,
        active_equipment=active_equipment,
        pending_hod=pending_hod,
        pending_qa=pending_qa,
        approved_requests=approved_requests,
        it_pending=it_pending,
        recent_requests=recent_requests,
        user_total_requests=user_total_requests,
        user_uam_requests=user_uam_requests,
        user_equipment_count=user_equipment_count,
        user_pending_actions=user_pending_actions,
        validation_alerts=validation_alerts,
        recent_uam_requests=recent_uam,
    )
