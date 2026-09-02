from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.constants import (
    STATUS_IT_COMPLETED, STATUS_IT_PENDING, STATUS_PENDING_HOD, STATUS_PENDING_QA,
)
from app.database import get_db
from app.models import AccessRequest, Equipment
from app.schemas import DashboardSummary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(db: Session = Depends(get_db)):
    total_equipment = db.query(Equipment).count()
    active_equipment = db.query(Equipment).filter(Equipment.active.is_(True)).count()
    pending_hod = db.query(AccessRequest).filter(AccessRequest.status == STATUS_PENDING_HOD).count()
    pending_qa = db.query(AccessRequest).filter(AccessRequest.status == STATUS_PENDING_QA).count()
    it_pending = db.query(AccessRequest).filter(AccessRequest.status == STATUS_IT_PENDING).count()
    approved_requests = db.query(AccessRequest).filter(AccessRequest.status == STATUS_IT_COMPLETED).count()
    recent_requests = (
        db.query(AccessRequest).order_by(AccessRequest.created_at.desc()).limit(10).all()
    )
    return DashboardSummary(
        total_equipment=total_equipment,
        active_equipment=active_equipment,
        pending_hod=pending_hod,
        pending_qa=pending_qa,
        approved_requests=approved_requests,
        it_pending=it_pending,
        recent_requests=recent_requests,
    )
