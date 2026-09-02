from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification
from app.schemas import NotificationOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(request_code: Optional[str] = None, limit: int = 200, db: Session = Depends(get_db)):
    """Notification Center - the mock outbox of every 'email' the system has sent."""
    q = db.query(Notification)
    if request_code:
        q = q.filter(Notification.request_code == request_code)
    return q.order_by(Notification.created_at.desc()).limit(limit).all()
