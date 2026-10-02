"""Seed / reset demo data."""

from datetime import date

from sqlalchemy.orm import Session

from app.constants import (
    ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_HOD, ROLE_IT, ROLE_QA,
    ASSET_STATUS_CREATED,
)
from app.models import (
    AccessRequest, Approver, AssetCreationRequest, AuditLog,
    Equipment, Notification, User,
)
from app.auth import get_password_hash


def run_seed(db: Session) -> None:
    db.query(Notification).delete()
    db.query(AuditLog).delete()
    db.query(AccessRequest).delete()
    db.query(AssetCreationRequest).delete()
    db.query(Approver).delete()
    db.query(Equipment).delete()
    db.query(User).delete()
    db.commit()

    default_pwd = get_password_hash("password123")

    users = [
        User(employee_id="EMP001", name="Yash Agrawal", email="yash@company.com",
             department="R&D", plant="P1", plants="P1,P2", role=ROLE_EMPLOYEE,
             action_pin="1111", active=True, hashed_password=default_pwd),
        User(employee_id="HOD001", name="Amit Sharma", email="amit.sharma@company.com",
             department="Production", plant="P1", role=ROLE_HOD,
             action_pin="2222", active=True, hashed_password=default_pwd),
        User(employee_id="HOD002", name="Rahul Mehta", email="rahul.mehta@company.com",
             department="Engineering", plant="P2", role=ROLE_HOD,
             action_pin="3333", active=True, hashed_password=default_pwd),
        User(employee_id="HOD003", name="Neha Patel", email="neha.patel@company.com",
             department="QC", plant="P1", role=ROLE_HOD,
             action_pin="4444", active=True, hashed_password=default_pwd),
        User(employee_id="QA001", name="Priya Shah", email="priya.shah@company.com",
             department="Quality", plant="P1", role=ROLE_QA,
             action_pin="5555", active=True, hashed_password=default_pwd),
        User(employee_id="QA002", name="Ankit Kumar", email="ankit.kumar@company.com",
             department="Quality", plant="P2", role=ROLE_QA,
             action_pin="6666", active=True, hashed_password=default_pwd),
        User(employee_id="ADM001", name="System Admin", email="admin@company.com",
             department="IT", plant="P1", plants="P1,P2", role=ROLE_ADMIN,
             action_pin="9999", active=True, hashed_password=default_pwd),
        User(employee_id="IT001", name="IT Support", email="it.support@company.com",
             department="IT", plant="P1", role=ROLE_IT,
             action_pin="7777", active=True, hashed_password=default_pwd),
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
        Equipment(
            equipment_code="EQ-001", name="HPLC System", type="Instrument",
            location="QC Lab", plant="P1",
            allowed_roles="Analyst,Senior Analyst,Scientist",
            validation_date=date(2027, 3, 31), active=True, created_by="System Admin",
            system_type="Software", make="Agilent", model_name="1260 Infinity II",
            application_name="OpenLAB CDS", gamp_category="4",
            usp_classification="Category 3", validation_status="validated",
            initial_validation_date=date(2022, 3, 1),
            latest_validation_date=date(2024, 3, 1),
            periodic_review_frequency=12, backup_include=True,
            computer_system_id="CS-001",
        ),
        Equipment(
            equipment_code="EQ-002", name="Dissolution Tester", type="Instrument",
            location="Lab A", plant="P1",
            allowed_roles="Analyst,Operator",
            validation_date=date(2027, 6, 30), active=True, created_by="System Admin",
            system_type="HMI", make="Agilent", gamp_category="3",
            validation_status="validated",
            latest_validation_date=date(2024, 6, 1),
            periodic_review_frequency=12, backup_include=False,
        ),
        Equipment(
            equipment_code="EQ-003", name="UV Spectrophotometer", type="Instrument",
            location="Lab B", plant="P2",
            allowed_roles="Analyst,Scientist",
            validation_date=date(2027, 1, 31), active=True, created_by="System Admin",
            system_type="Software", make="Shimadzu", model_name="UV-1900",
            gamp_category="4", validation_status="under_validation",
            initial_validation_date=date(2024, 1, 1),
            periodic_review_frequency=24,
        ),
        Equipment(
            equipment_code="EQ-004", name="Stability Chamber", type="Equipment",
            location="R&D Lab", plant="P1",
            allowed_roles="Scientist,Supervisor",
            validation_date=date(2027, 9, 30), active=True, created_by="System Admin",
            system_type="Data Logger", make="Binder", gamp_category="4",
            validation_status="validated",
            latest_validation_date=date(2023, 9, 1),
            periodic_review_frequency=12, backup_include=True,
        ),
        Equipment(
            equipment_code="EQ-005", name="GC System", type="Instrument",
            location="QC Lab", plant="P1",
            allowed_roles="Analyst,Senior Analyst,Scientist",
            validation_date=date(2026, 11, 30), active=False, created_by="System Admin",
            system_type="Software", make="Waters", gamp_category="4",
            validation_status="under_validation",
        ),
        Equipment(
            equipment_code="SW-001", name="SAP ERP", type="Software",
            location="Server Room", plant="P1",
            allowed_roles="Finance,Production,Analyst",
            validation_date=date(2028, 12, 31), active=True, created_by="System Admin",
            system_type="Software", make="SAP SE", model_name="SAP S/4HANA",
            application_name="SAP ERP", gamp_category="4",
            usp_classification="Category 4",
            validation_status="validated",
            initial_validation_date=date(2020, 1, 1),
            latest_validation_date=date(2024, 1, 1),
            periodic_review_frequency=24, backup_include=True,
            computer_system_id="CS-SW-001",
        ),
    ]
    db.add_all(equipment)

    # Demo asset creation request
    asset_req = AssetCreationRequest(
        request_code="ACR-0001",
        employee_id="EMP001",
        employee_name="Yash Agrawal",
        employee_email="yash@company.com",
        system_name="New LIMS System",
        system_type="Software",
        make="LabVantage",
        model_name="LIMS 8.7",
        application_name="LabVantage LIMS",
        gamp_category="4",
        department="R&D",
        location="Lab A",
        reviewer_id="HOD001",
        it_executor_id="IT001",
        qa_approver_id="QA001",
        plant="P1",
        status=ASSET_STATUS_CREATED,
    )
    db.add(asset_req)

    db.commit()
