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
    plant: Mapped[str] = mapped_column(String(20), default="P1")
    plants: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # comma-sep multi-plant
    role: Mapped[str] = mapped_column(String(20))
    hashed_password: Mapped[str] = mapped_column(String(255), default="")
    action_pin: Mapped[str] = mapped_column(String(10), default="0000")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    def plants_list(self) -> list[str]:
        base = [p.strip() for p in (self.plants or "").split(",") if p.strip()]
        if self.plant and self.plant not in base:
            base.insert(0, self.plant)
        return base


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(40), default="Hardware")
    location: Mapped[str] = mapped_column(String(80))
    plant: Mapped[str] = mapped_column(String(20), default="P1")
    allowed_roles: Mapped[str] = mapped_column(Text)  # comma-separated role names
    validation_date: Mapped[date] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[str] = mapped_column(String(120))

    # Extended computerized system fields (Phase 1)
    system_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    system_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # HMI|SCADA|Software|DCS|Data Logger|Other
    make: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    application_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    gamp_category: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # 1|2|3|4|5
    usp_classification: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    validation_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # validated|under_validation
    initial_validation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    latest_validation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    periodic_review_frequency: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # months
    backup_include: Mapped[bool] = mapped_column(Boolean, default=False)
    computer_system_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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

    user_login_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    temporary_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    it_submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    user_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class UAMRequest(Base):
    """Generalized UAM request kept separate from the legacy access workflow."""
    __tablename__ = "uam_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    employee_id: Mapped[str] = mapped_column(String(20), index=True)
    employee_name: Mapped[str] = mapped_column(String(120))
    employee_email: Mapped[str] = mapped_column(String(160))
    template: Mapped[str] = mapped_column(String(30))
    asset_type: Mapped[str] = mapped_column(String(20))
    asset_code: Mapped[str] = mapped_column(String(40), index=True)
    requested_role: Mapped[str] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(String(30))
    plant: Mapped[str] = mapped_column(String(20), index=True)
    reason: Mapped[str] = mapped_column(Text)
    form_data: Mapped[str] = mapped_column(Text, default="{}")
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    department_approver_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    qa_approver_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    it_executor_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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


# ---------- Asset Creation Workflow ----------

class AssetCreationRequest(Base):
    __tablename__ = "asset_creation_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    employee_id: Mapped[str] = mapped_column(String(20), index=True)
    employee_name: Mapped[str] = mapped_column(String(120))
    employee_email: Mapped[str] = mapped_column(String(160))

    # Asset fields submitted by inventory requestor
    system_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    system_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    system_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    make: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    primary_function: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    application_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    gamp_category: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    usp_classification: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    db_server_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    computer_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    validation_summary_report_no: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    approval_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    change_control_no: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    # Workflow assignments
    reviewer_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    it_executor_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    qa_approver_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    plant: Mapped[str] = mapped_column(String(20), default="P1")
    status: Mapped[str] = mapped_column(String(30), index=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    form_data: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------- Operational Schedule Modules ----------

class PeriodicReviewEntry(Base):
    __tablename__ = "periodic_review_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_code: Mapped[str] = mapped_column(String(20), index=True)
    last_review_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_review_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    review_frequency_months: Mapped[int] = mapped_column(Integer, default=12)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str] = mapped_column(String(120), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BackupScheduleEntry(Base):
    __tablename__ = "backup_schedule_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_code: Mapped[str] = mapped_column(String(20), index=True)
    last_backup_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_backup_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    frequency_days: Mapped[int] = mapped_column(Integer, default=30)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str] = mapped_column(String(120), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PreventiveMaintenanceEntry(Base):
    __tablename__ = "preventive_maintenance_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_code: Mapped[str] = mapped_column(String(20), index=True)
    last_pm_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_pm_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    frequency_months: Mapped[int] = mapped_column(Integer, default=6)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str] = mapped_column(String(120), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------- Password Vault ----------

class PasswordVaultEntry(Base):
    __tablename__ = "password_vault_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_employee_id: Mapped[str] = mapped_column(String(20), index=True)
    equipment_code: Mapped[str] = mapped_column(String(20))
    equipment_name: Mapped[str] = mapped_column(String(160))
    encrypted_password: Mapped[str] = mapped_column(Text)
    created_date: Mapped[date] = mapped_column(Date)
    expiry_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
