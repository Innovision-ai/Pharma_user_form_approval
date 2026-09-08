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
             department="R&D", plant="P1", role=ROLE_EMPLOYEE, action_pin="1111", active=True),
        User(employee_id="HOD001", name="Amit Sharma", email="amit.sharma@company.com",
             department="Production", plant="P1", role=ROLE_HOD, action_pin="2222", active=True),
        User(employee_id="HOD002", name="Rahul Mehta", email="rahul.mehta@company.com",
             department="Engineering", plant="P2", role=ROLE_HOD, action_pin="3333", active=True),
        User(employee_id="HOD003", name="Neha Patel", email="neha.patel@company.com",
             department="QC", plant="P1", role=ROLE_HOD, action_pin="4444", active=True),
        User(employee_id="QA001", name="Priya Shah", email="priya.shah@company.com",
             department="Quality", plant="P1", role=ROLE_QA, action_pin="5555", active=True),
        User(employee_id="QA002", name="Ankit Kumar", email="ankit.kumar@company.com",
             department="Quality", plant="P2", role=ROLE_QA, action_pin="6666", active=True),
        User(employee_id="ADM001", name="System Admin", email="admin@company.com",
             department="IT", plant="P1", role=ROLE_ADMIN, action_pin="9999", active=True),
        User(employee_id="IT001", name="IT Support", email="it.support@company.com",
             department="IT", plant="P1", role=ROLE_IT, action_pin="7777", active=True),
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
        Equipment(equipment_code="EQ-001", name="HPLC System", type="Instrument",
                  location="QC Lab", plant="P1",
                  allowed_roles="Analyst,Senior Analyst,Scientist",
                  validation_date=date(2027, 3, 31), active=True,
                  created_by="System Admin"),
        Equipment(equipment_code="EQ-002", name="Dissolution Tester", type="Instrument",
                  location="Lab A", plant="P1",
                  allowed_roles="Analyst,Operator",
                  validation_date=date(2027, 6, 30), active=True,
                  created_by="System Admin"),
        Equipment(equipment_code="EQ-003", name="UV Spectrophotometer", type="Instrument",
                  location="Lab B", plant="P2",
                  allowed_roles="Analyst,Scientist",
                  validation_date=date(2027, 1, 31), active=True,
                  created_by="System Admin"),
        Equipment(equipment_code="EQ-004", name="Stability Chamber", type="Equipment",
                  location="R&D Lab", plant="P1",
                  allowed_roles="Scientist,Supervisor",
                  validation_date=date(2027, 9, 30), active=True,
                  created_by="System Admin"),
        Equipment(equipment_code="EQ-005", name="GC System", type="Instrument",
                  location="QC Lab", plant="P1",
                  allowed_roles="Analyst,Senior Analyst,Scientist",
                  validation_date=date(2026, 11, 30), active=False,
                  created_by="System Admin"),
    ]
    db.add_all(equipment)

    db.commit()
