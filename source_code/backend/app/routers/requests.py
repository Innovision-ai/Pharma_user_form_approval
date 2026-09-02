from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.constants import (
    ROLE_HOD, ROLE_IT, ROLE_QA,
    STATUS_IT_COMPLETED, STATUS_IT_PENDING, STATUS_PENDING_HOD, STATUS_PENDING_QA,
)
from app.database import get_db
from app.deps import get_current_user, require_role
from app.models import AccessRequest, User
from app.schemas import RejectRequest, RequestCreate, RequestOut
from app.services import workflow

router = APIRouter(prefix="/api/requests", tags=["requests"])


@router.get("", response_model=list[RequestOut])
def list_all_requests(limit: int = 50, db: Session = Depends(get_db)):
    """All requests, newest first - backs the Dashboard's recent-activity table."""
    return (
        db.query(AccessRequest)
        .order_by(AccessRequest.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/mine", response_model=list[RequestOut])
def list_my_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """My Requests screen - every request this employee has ever submitted."""
    return (
        db.query(AccessRequest)
        .filter(AccessRequest.employee_id == current_user.employee_id)
        .order_by(AccessRequest.created_at.desc())
        .all()
    )


@router.get("/approvals", response_model=list[RequestOut])
def list_pending_approvals(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_HOD, ROLE_QA)),
):
    """Approvals screen - only requests assigned to *this* HOD/QA and awaiting them."""
    q = db.query(AccessRequest)
    if current_user.role == ROLE_HOD:
        q = q.filter(
            AccessRequest.hod_id == current_user.employee_id,
            AccessRequest.status == STATUS_PENDING_HOD,
        )
    else:
        q = q.filter(
            AccessRequest.qa_id == current_user.employee_id,
            AccessRequest.status == STATUS_PENDING_QA,
        )
    return q.order_by(AccessRequest.created_at).all()


@router.get("/it-queue", response_model=list[RequestOut])
def list_it_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(ROLE_IT)),
):
    """IT Requests screen - approved requests awaiting provisioning, and recently completed ones."""
    return (
        db.query(AccessRequest)
        .filter(AccessRequest.status.in_([STATUS_IT_PENDING, STATUS_IT_COMPLETED]))
        .order_by(AccessRequest.updated_at.desc())
        .all()
    )


@router.get("/{code}", response_model=RequestOut)
def get_request(code: str, db: Session = Depends(get_db)):
    from fastapi import HTTPException, status as http_status

    req = db.query(AccessRequest).filter(AccessRequest.request_code == code).first()
    if req is None:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Request not found")
    return req


@router.post("", response_model=RequestOut, status_code=201)
def create_request(
    payload: RequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return workflow.submit_request(db, current_user, payload)


@router.post("/{code}/approve", response_model=RequestOut)
def approve(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return workflow.approve_request(db, current_user, code)


@router.post("/{code}/reject", response_model=RequestOut)
def reject(
    code: str,
    payload: RejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return workflow.reject_request(db, current_user, code, payload.reason)


@router.post("/{code}/complete", response_model=RequestOut)
def complete(code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return workflow.complete_request(db, current_user, code)
