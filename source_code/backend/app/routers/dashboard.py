from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.constants import (
    STATUS_IT_COMPLETED, STATUS_IT_PENDING, STATUS_PENDING_HOD, STATUS_PENDING_QA,
    UAM_STATUS_PENDING_EXECUTION, UAM_STATUS_PENDING_REVIEW,
)
from app.database import get_db
from app.deps import get_current_user
from app.models import AccessRequest, Equipment, UAMRequest, User
from app.schemas import DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_equipment = db.query(Equipment).count()
    active_equipment = db.query(Equipment).filter(Equipment.active.is_(True)).count()
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
            UAMRequest.status.in_([UAM_STATUS_PENDING_REVIEW, UAM_STATUS_PENDING_EXECUTION]),
            (UAMRequest.reviewer_id == uid) | (UAMRequest.it_executor_id == uid),
        )
        .count()
    )

    # Validation alerts
    threshold = date.today() - timedelta(days=60)
    validation_alerts = (
        db.query(Equipment)
        .filter(Equipment.validation_status == "under_validation", Equipment.active.is_(True))
        .count()
    )

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
    )
