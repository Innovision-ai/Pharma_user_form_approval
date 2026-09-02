"""Seed / reset demo data - see the client-facing spec, Section 15 (Demo Data).

Deletes everything and reinserts the same fixed demo dataset, so the app can
be reset to a clean state between live demos (Section 14, "Reset Demo Data").
"""

from datetime import date

from sqlalchemy.orm import Session

from app.constants import (
    ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_HOD, ROLE_IT, ROLE_QA,
)
from app.models import AccessRequest, Approver, AuditLog, Equipment, Notification, User


def run_seed(db: Session) -> None:
    db.query(Notification).delete()
    db.query(AuditLog).delete()
    db.query(AccessRequest).delete()
    db.query(Approver).delete()
    db.query(Equipment).delete()
    db.query(User).delete()
    db.commit()

    users = [
        User(employee_id="EMP001", name="Yash Agrawal", email="yash@company.com",
             department="R&D", role=ROLE_EMPLOYEE, active=True),
        User(employee_id="HOD001", name="Amit Sharma", email="amit.sharma@company.com",
             department="Production", role=ROLE_HOD, active=True),
        User(employee_id="HOD002", name="Rahul Mehta", email="rahul.mehta@company.com",
             department="Engineering", role=ROLE_HOD, active=True),
        User(employee_id="HOD003", name="Neha Patel", email="neha.patel@company.com",
             department="QC", role=ROLE_HOD, active=True),
        User(employee_id="QA001", name="Priya Shah", email="priya.shah@company.com",
             department="Quality", role=ROLE_QA, active=True),
        User(employee_id="QA002", name="Ankit Kumar", email="ankit.kumar@company.com",
             department="Quality", role=ROLE_QA, active=True),
        User(employee_id="ADM001", name="System Admin", email="admin@company.com",
             department="IT", role=ROLE_ADMIN, active=True),
        User(employee_id="IT001", name="IT Support", email="it.support@company.com",
             department="IT", role=ROLE_IT, active=True),
    ]
    db.add_all(users)

    approvers = [
        Approver(approver_code="HOD001", name="Amit Sharma", type="HOD",
                  department="Production", email="amit.sharma@company.com", active=True),
        Approver(approver_code="HOD002", name="Rahul Mehta", type="HOD",
                  department="Engineering", email="rahul.mehta@company.com", active=True),
        Approver(approver_code="HOD003", name="Neha Patel", type="HOD",
                  department="QC", email="neha.patel@company.com", active=True),
        Approver(approver_code="QA001", name="Priya Shah", type="QA",
                  department="Quality", email="priya.shah@company.com", active=True),
        Approver(approver_code="QA002", name="Ankit Kumar", type="QA",
                  department="Quality", email="ankit.kumar@company.com", active=True),
        Approver(approver_code="QA003", name="Sneha Verma", type="QA",
                  department="Quality", email="sneha.verma@company.com", active=True),
    ]
    db.add_all(approvers)

    equipment = [
        Equipment(equipment_code="EQ-001", name="HPLC System", location="QC Lab",
                  allowed_roles="Analyst,Senior Analyst,Scientist",
                  validation_date=date(2027, 3, 31), active=True,
                  created_by="System Admin"),
        Equipment(equipment_code="EQ-002", name="Dissolution Tester", location="Lab A",
                  allowed_roles="Analyst,Operator",
                  validation_date=date(2027, 6, 30), active=True,
                  created_by="System Admin"),
        Equipment(equipment_code="EQ-003", name="UV Spectrophotometer", location="Lab B",
                  allowed_roles="Analyst,Scientist",
                  validation_date=date(2027, 1, 31), active=True,
                  created_by="System Admin"),
        Equipment(equipment_code="EQ-004", name="Stability Chamber", location="R&D Lab",
                  allowed_roles="Scientist,Supervisor",
                  validation_date=date(2027, 9, 30), active=True,
                  created_by="System Admin"),
        Equipment(equipment_code="EQ-005", name="GC System", location="QC Lab",
                  allowed_roles="Analyst,Senior Analyst,Scientist",
                  validation_date=date(2026, 11, 30), active=False,
                  created_by="System Admin"),
    ]
    db.add_all(equipment)

    db.commit()
