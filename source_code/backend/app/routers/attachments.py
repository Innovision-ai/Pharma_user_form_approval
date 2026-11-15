"""Small file attachments: training evidence (UAM) and deviation records (PM /
periodic review). Kept in the database (serverless host has no disk)."""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Attachment, User

router = APIRouter(prefix="/api/attachments", tags=["attachments"])

MAX_BYTES = 5 * 1024 * 1024
ALLOWED_TYPES = {
    "application/pdf", "image/png", "image/jpeg", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    file: UploadFile = File(...),
    purpose: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Attachments are limited to 5 MB")
    content_type = (file.content_type or "application/octet-stream").split(";")[0]
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            "Allowed files: PDF, images (PNG/JPG/WEBP), Word or Excel")
    att = Attachment(
        owner_employee_id=current_user.employee_id,
        filename=(file.filename or "attachment")[:200],
        content_type=content_type,
        size=len(data),
        data=data,
        purpose=(purpose or None),
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return {"id": att.id, "filename": att.filename, "size": att.size, "content_type": att.content_type}


@router.get("/{attachment_id}")
def download_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(Attachment).filter(Attachment.id == attachment_id).first()
    if not att:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    safe_name = att.filename.replace('"', "")
    return Response(
        content=att.data,
        media_type=att.content_type,
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )
