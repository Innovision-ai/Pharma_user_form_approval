from datetime import datetime, date
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160))
    department: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    location: Mapped[str] = mapped_column(String(80))
    allowed_roles: Mapped[str] = mapped_column(Text)  # comma-separated role names
    validation_date: Mapped[date] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[str] = mapped_column(String(120))

    def roles_list(self) -> list[str]:
        return [r.strip() for r in self.allowed_roles.split(",") if r.strip()]


class Approver(Base):
    __tablename__ = "approvers"

    id: Mapped[int] = mapped_column(primary_key=True)
    approver_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(10))  # HOD | QA
    department: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(160))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)

    employee_id: Mapped[str] = mapped_column(String(20))
    employee_name: Mapped[str] = mapped_column(String(120))
    employee_email: Mapped[str] = mapped_column(String(160))
    employee_department: Mapped[str] = mapped_column(String(80))

    equipment_code: Mapped[str] = mapped_column(String(20))
    equipment_name: Mapped[str] = mapped_column(String(160))
    requested_role: Mapped[str] = mapped_column(String(60))

    # Approver snapshot - copied at submission time, see README / spec section 9.
    hod_id: Mapped[str] = mapped_column(String(20))
    hod_name: Mapped[str] = mapped_column(String(120))
    hod_email: Mapped[str] = mapped_column(String(160))
    qa_id: Mapped[str] = mapped_column(String(20))
    qa_name: Mapped[str] = mapped_column(String(120))
    qa_email: Mapped[str] = mapped_column(String(160))

    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20))

    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rejected_stage: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    user_employee_id: Mapped[str] = mapped_column(String(20))
    user_name: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_code: Mapped[str] = mapped_column(String(20), index=True)
    recipient_name: Mapped[str] = mapped_column(String(120))
    recipient_email: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(20), default="SENT")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
