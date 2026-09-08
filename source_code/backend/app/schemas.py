from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---------- Users ----------

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    employee_id: str
    name: str
    email: str
    department: str
    plant: str
    role: str
    active: bool
    action_pin: str


class UserCreate(BaseModel):
    employee_id: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    department: str = Field(min_length=1, max_length=80)
    plant: str = Field(default="P1", max_length=20)
    role: str = Field(pattern="^(EMPLOYEE|HOD|QA|ADMIN|IT)$")
    active: bool = True


class UserUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    department: str = Field(min_length=1, max_length=80)
    plant: str = Field(max_length=20)
    role: str = Field(pattern="^(EMPLOYEE|HOD|QA|ADMIN|IT)$")


# ---------- Equipment ----------

class EquipmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    type: str = Field(default="Hardware", max_length=40)
    location: str = Field(min_length=1, max_length=80)
    plant: str = Field(default="P1", max_length=20)
    allowed_roles: list[str] = Field(min_length=1)
    validation_date: date

    @field_validator("allowed_roles")
    @classmethod
    def strip_roles(cls, v: list[str]) -> list[str]:
        cleaned = [r.strip() for r in v if r.strip()]
        if not cleaned:
            raise ValueError("At least one allowed role is required")
        return cleaned


class EquipmentUpdate(EquipmentCreate):
    pass


class EquipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    equipment_code: str
    name: str
    type: str
    location: str
    plant: str
    allowed_roles: list[str]
    validation_date: date
    active: bool
    created_at: datetime
    created_by: str

    @field_validator("allowed_roles", mode="before")
    @classmethod
    def split_roles(cls, v):
        if isinstance(v, str):
            return [r.strip() for r in v.split(",") if r.strip()]
        return v


# ---------- Approvers ----------

class ApproverCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str = Field(pattern="^(HOD|QA)$")
    department: str = Field(min_length=1, max_length=80)
    email: EmailStr


class ApproverUpdate(ApproverCreate):
    pass


class ApproverOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    approver_code: str
    name: str
    type: str
    department: str
    email: str
    active: bool
    created_at: datetime


class StatusToggle(BaseModel):
    active: bool


# ---------- Access Requests ----------

class RequestCreate(BaseModel):
    equipment_code: str
    requested_role: str
    hod_id: str
    qa_id: str
    reason: str = Field(min_length=1, max_length=2000)


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    request_code: str
    employee_id: str
    employee_name: str
    employee_email: str
    employee_department: str
    equipment_code: str
    equipment_name: str
    requested_role: str
    hod_id: str
    hod_name: str
    hod_email: str
    qa_id: str
    qa_name: str
    qa_email: str
    reason: str
    status: str
    rejection_reason: Optional[str] = None
    rejected_stage: Optional[str] = None

    user_login_id: Optional[str] = None
    temporary_password: Optional[str] = None
    it_submitted_at: Optional[datetime] = None
    user_acknowledged: bool
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class RejectRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)
    pin: str = Field(min_length=1, max_length=10)


class ActionPin(BaseModel):
    pin: str = Field(min_length=1, max_length=10)


class ActionAuth(BaseModel):
    username: str = Field(min_length=1, max_length=20)
    pin: str = Field(min_length=1, max_length=10)


class ITGrantAccess(BaseModel):
    user_login_id: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=2000)
    pin: str = Field(min_length=1, max_length=10)


class UserAcknowledge(BaseModel):
    username: str = Field(min_length=1, max_length=20)
    pin: str = Field(min_length=1, max_length=10)


# ---------- Audit ----------

class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    request_code: Optional[str] = None
    user_employee_id: str
    user_name: str
    action: str
    description: str
    timestamp: datetime


# ---------- Notifications ----------

class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    request_code: str
    recipient_name: str
    recipient_email: str
    subject: str
    body: str
    type: str
    status: str
    created_at: datetime


# ---------- Dashboard ----------

class DashboardSummary(BaseModel):
    total_equipment: int
    active_equipment: int
    pending_hod: int
    pending_qa: int
    approved_requests: int
    it_pending: int
    recent_requests: list[RequestOut]
