from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog
from app.schemas import AuditLogOut

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
def list_audit_logs(
    request_code: Optional[str] = None,
    user: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    if request_code:
        q = q.filter(AuditLog.request_code == request_code)
    if user:
        q = q.filter(AuditLog.user_name.ilike(f"%{user}%"))
    if action:
        q = q.filter(AuditLog.action == action)
    if date_from:
        q = q.filter(AuditLog.timestamp >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(AuditLog.timestamp < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    return q.order_by(AuditLog.timestamp.desc()).limit(limit).all()
