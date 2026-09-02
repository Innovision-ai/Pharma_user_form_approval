# Build MVP: Pharmaceutical Equipment Access Management System

## 1. Project Overview

Build a working MVP web application for a **Pharmaceutical Equipment Access Management System**.

The purpose of this application is to replace a manual process where employees need to go through multiple steps to request access to pharmaceutical/laboratory equipment.

The MVP should demonstrate this complete workflow:

**Admin creates equipment → Employee requests equipment access → Employee selects User Role → Employee selects HOD → Employee selects QA → HOD approves → QA approves → IT + Employee receive approval notification → Audit trail records every action**

The priority is **functionality and a polished, professional UI**, not production-level compliance.

Do NOT over-engineer the application.

---

# 2. MVP Objectives

The application must demonstrate:

1. Equipment management
2. Approver management
3. Employee access request creation
4. Dynamic role selection based on equipment
5. HOD selection from predefined HOD list
6. QA selection from predefined QA list
7. Sequential approval workflow
8. Email notification simulation
9. Request tracking
10. Audit trail

The application should be easy to run locally.

---

# 3. Recommended Technology

Use the following stack unless there is a strong technical reason to change it:

### Frontend

- React
- TypeScript
- Tailwind CSS
- shadcn/ui or another modern component library

### Backend

- Python
- FastAPI

### Database

For MVP:

- SQLite

Use SQLAlchemy or SQLModel for database access.

### Authentication

Do NOT implement complex authentication for the MVP.

Create a simple **Demo User Login / User Switcher** so the workflow can be demonstrated easily.

The application should support these user types:

- Employee
- HOD
- QA
- Admin
- IT

The user can switch between demo accounts from the UI.

---

# 4. Application Layout

Create a modern enterprise dashboard.

The UI should look appropriate for a **pharmaceutical / laboratory / enterprise environment**.

Do not make it look like a generic e-commerce dashboard.

Use:

- Clean white/light background
- Professional blue/indigo accent
- Cards
- Tables
- Status badges
- Clean forms
- Responsive layout
- Sidebar navigation
- Top header
- User profile/demo-user selector

Avoid excessive animations.

Focus on usability.

---

# 5. Main Navigation

The sidebar should contain:

### Dashboard

Overview of equipment and requests.

### Equipment Master

Admin can create and manage equipment.

### Approver Master

Admin can manage HODs and QAs.

### Create Request

Employee creates a new equipment access request.

### My Requests

Employee can see requests created by them.

### Approvals

HOD and QA can see requests waiting for their approval.

### IT Requests

IT can see requests that have completed HOD + QA approval.

### Audit Trail

Display system activity.

---

# 6. Dashboard

Create a simple dashboard.

Do NOT build complicated analytics for the MVP.

Display KPI cards:

### Total Equipment

Example:

25

### Active Equipment

Example:

21

### Pending HOD Approval

Example:

5

### Pending QA Approval

Example:

3

### Approved Requests

Example:

17

### IT Pending

Example:

2

Below the KPI cards display:

## Recent Requests

Table:

| Request ID | Employee | Equipment | Role | Status | Created |
|---|---|---|---|---|---|

Use status badges:

- Draft
- Pending HOD
- Pending QA
- Approved
- Rejected
- IT Completed

---

# 7. Equipment Master

This is an Admin-only module.

The purpose is to maintain the list of equipment that employees can request access to.

## Equipment fields

Each equipment record should contain:

```text
equipment_id
equipment_name
location
allowed_roles
validation_date
active
created_at
created_by
```

### Equipment ID

Automatically generate a unique ID.

Example:

```text
EQ-001
EQ-002
EQ-003
```

Do not allow duplicate Equipment IDs.

### Equipment Name

Example:

```text
HPLC System
Dissolution Tester
UV Spectrophotometer
Stability Chamber
GC System
```

### Location

Dropdown.

Example:

```text
Lab A
Lab B
QC Lab
Production Lab
R&D Lab
```

### Allowed Roles

This must be a multi-select field.

Example:

```text
Analyst
Senior Analyst
Scientist
Operator
Supervisor
```

Important:

The selected roles belong specifically to that equipment.

Example:

HPLC:

```text
Analyst
Senior Analyst
Scientist
```

Dissolution Tester:

```text
Analyst
Operator
Supervisor
```

### Validation Date

Date field.

### Active / Inactive

Toggle.

If equipment is inactive:

- Employees should NOT see it in Create Request.
- Existing requests should remain visible.

Do NOT delete equipment from the database.

---

# 8. Equipment Master UI

Create:

### Add Equipment button

Clicking this opens a modal or dedicated form.

Form:

```text
Equipment Name
Location
Allowed Roles
Last Validation Date
Active
```

Button:

```text
Save Equipment
```

After saving:

Show:

```text
Equipment created successfully.
```

Display equipment in a searchable table.

Table columns:

```text
Equipment ID
Equipment Name
Location
Allowed Roles
Validation Date
Status
Actions
```

Actions:

```text
Edit
Activate/Deactivate
View
```

---

# 9. Approver Master

Create an Admin module called:

**Approver Master**

This contains the predefined HOD and QA list.

## Fields

```text
approver_id
name
type
department
email
active
created_at
```

### Type

Dropdown:

```text
HOD
QA
```

### Example data

```text
HOD001 | Amit Sharma | HOD | Production | amit@company.com
HOD002 | Rahul Mehta | HOD | Engineering | rahul@company.com
HOD003 | Neha Patel | HOD | QC | neha@company.com

QA001 | Priya Shah | QA | Quality | priya@company.com
QA002 | Ankit Kumar | QA | Quality | ankit@company.com
QA003 | Sneha Verma | QA | Quality | sneha@company.com
```

### Approver Master UI

Table:

```text
Approver ID
Name
Type
Department
Email
Status
Actions
```

Admin should be able to:

- Add approver
- Edit approver
- Activate/deactivate approver

Do NOT permanently delete approvers.

---

# 10. Create Access Request

This is one of the most important screens.

The employee should have a simple form.

## Step 1 — Select Equipment

Dropdown containing only:

```text
Active Equipment
```

Inactive equipment must not appear.

Example:

```text
Select Equipment
    ↓
HPLC System - EQ-001
Dissolution Tester - EQ-002
UV Spectrophotometer - EQ-003
```

---

# 11. Dynamic User Role

Once equipment is selected:

Load the allowed roles for that equipment.

Example:

If employee selects:

```text
HPLC System
```

The role dropdown should dynamically display:

```text
Analyst
Senior Analyst
Scientist
```

Do NOT display roles that are not allowed for that equipment.

---

# 12. Employee Information

Employee information should be automatically populated from the currently logged-in demo user.

Display:

```text
Employee Name
Employee ID
Employee Email
Department
```

These fields should be read-only.

Example:

```text
Employee Name: Yash Agrawal
Employee ID: EMP001
Email: yash@company.com
Department: R&D
```

---

# 13. Select HOD

Create a dropdown:

```text
Select HOD
```

Populate it from Approver Master where:

```text
type = HOD
active = true
```

Example:

```text
Amit Sharma - Production
Rahul Mehta - Engineering
Neha Patel - QC
```

The employee chooses which HOD should receive the request.

---

# 14. Select QA

Create another dropdown:

```text
Select QA
```

Populate it from Approver Master where:

```text
type = QA
active = true
```

Example:

```text
Priya Shah - QA
Ankit Kumar - QA
Sneha Verma - QA
```

The employee chooses which QA should receive the request.

---

# 15. Reason for Access

Add:

```text
Reason for Access
```

Textarea.

This is required.

Example:

```text
Required for analytical testing activities.
```

---

# 16. Submit Request

Button:

```text
Submit Request
```

When submitted:

Generate a unique Request ID.

Example:

```text
REQ-0001
REQ-0002
REQ-0003
```

The request status becomes:

```text
Pending HOD
```

---

# 17. IMPORTANT — Approver Snapshot

When the employee submits the request, store the selected HOD and QA details directly inside the request.

For example:

```text
hod_id
hod_name
hod_email

qa_id
qa_name
qa_email
```

Do NOT only store the approver ID.

The request should preserve the approver information at the time the request was created.

Example:

```text
Request REQ-0001

HOD:
Rahul Mehta
rahul@company.com

QA:
Priya Shah
priya@company.com
```

This is important because the Approver Master could change later.

---

# 18. Access Request Database Model

Create a request table with approximately:

```text
request_id

employee_id
employee_name
employee_email
employee_department

equipment_id
equipment_name

requested_role

hod_id
hod_name
hod_email

qa_id
qa_name
qa_email

reason

status

created_at
updated_at
```

---

# 19. Request Status Workflow

Implement exactly this workflow:

```text
Draft
   ↓
Pending HOD
   ↓
Pending QA
   ↓
Approved
   ↓
IT Pending
   ↓
IT Completed
```

Rejected requests:

```text
Pending HOD → Rejected

Pending QA → Rejected
```

Once rejected, the request should not automatically continue to the next stage.

---

# 20. HOD Approval Screen

When the current demo user is an HOD:

Show requests where:

```text
status = Pending HOD
AND hod_id = current_user.id
```

Display a table:

```text
Request ID
Employee
Equipment
Requested Role
Reason
Submitted Date
Status
Action
```

Action:

```text
View
```

When opened, display the complete request.

Buttons:

```text
Approve
Reject
```

If HOD approves:

```text
status = Pending QA
```

If HOD rejects:

```text
status = Rejected
```

Require a rejection comment when rejecting.

---

# 21. QA Approval Screen

When the current demo user is QA:

Show requests where:

```text
status = Pending QA
AND qa_id = current_user.id
```

Display:

```text
Request ID
Employee
Equipment
Role
Selected HOD
Reason
Submitted Date
Status
```

Actions:

```text
View
Approve
Reject
```

If QA approves:

```text
status = IT Pending
```

If QA rejects:

```text
status = Rejected
```

Require rejection reason.

---

# 22. IT Screen

Create:

**IT Requests**

IT users see:

```text
status = IT Pending
```

Display:

```text
Request ID
Employee
Equipment
Role
HOD
QA
Approved Date
Status
```

Provide button:

```text
Mark Access Completed
```

When clicked:

```text
status = IT Completed
```

This represents the IT team actually provisioning access.

After this, the employee should see:

```text
Access Granted
```

---

# 23. Notification System

For the MVP, do NOT depend on a real email server.

Implement a **Mock Notification Service**.

Whenever an event happens, create a notification record.

Examples:

### Request submitted

Send to selected HOD:

```text
To: rahul@company.com

Subject:
Equipment Access Request REQ-0001 Requires Your Approval

Employee:
Yash Agrawal

Equipment:
HPLC System

Role:
Analyst

Please review the request.
```

### HOD approves

Send to selected QA:

```text
To: priya@company.com

Subject:
Equipment Access Request REQ-0001 Requires QA Approval
```

### QA approves

Send to:

```text
Employee email
IT team email
```

Employee notification:

```text
Your equipment access request REQ-0001 has been approved.
```

IT notification:

```text
Equipment access request REQ-0001 is ready for provisioning.
```

---

# 24. Notification Center

Create a simple page or panel called:

**Notifications**

Display all generated mock notifications.

Columns:

```text
Date
Recipient
Email
Subject
Type
Status
```

Example:

```text
20 Aug | Rahul Mehta | rahul@company.com | Request REQ-001 requires approval | HOD | Sent
20 Aug | Priya Shah | priya@company.com | Request REQ-001 requires QA approval | QA | Sent
20 Aug | Yash Agrawal | yash@company.com | Request approved | Employee | Sent
20 Aug | IT Team | it@company.com | Request ready for provisioning | IT | Sent
```

This allows the MVP demo to show that notifications are working without configuring SMTP.

---

# 25. Audit Trail

Create an Audit Trail table.

Every major action must create an audit record.

Fields:

```text
audit_id
request_id
user_id
user_name
action
description
timestamp
```

Examples:

```text
REQ-0001 | Yash Agrawal | CREATE_REQUEST | Request created | timestamp

REQ-0001 | System | NOTIFICATION_SENT | HOD notification sent | timestamp

REQ-0001 | Rahul Mehta | HOD_APPROVED | HOD approved request | timestamp

REQ-0001 | System | NOTIFICATION_SENT | QA notification sent | timestamp

REQ-0001 | Priya Shah | QA_APPROVED | QA approved request | timestamp

REQ-0001 | System | NOTIFICATION_SENT | IT notification sent | timestamp
```

Display audit trail in a table.

Add filters:

```text
Request ID
User
Action
Date
```

For MVP, audit records should not have an edit or delete button.

---

# 26. My Requests

Employees should have a page:

**My Requests**

Show only requests created by the current employee.

Table:

```text
Request ID
Equipment
Role
HOD
QA
Status
Created Date
```

Clicking a request should open a detail page.

---

# 27. Request Detail Page

Create a clean request detail view.

At the top:

```text
REQ-0001
Equipment Access Request
```

Show a visual workflow:

```text
Submitted
   ✓
   
HOD Approval
   ✓

QA Approval
   ✓

IT Provisioning
   ● Pending
```

Use a timeline/status stepper.

Below it display:

### Employee Information

### Equipment Information

### Requested Role

### HOD

### QA

### Reason

### Current Status

### Activity / Audit History

This should be one of the most visually impressive parts of the MVP.

---

# 28. Database Tables

Use these tables:

## users

```text
id
employee_id
name
email
department
role
active
```

Role values:

```text
EMPLOYEE
HOD
QA
ADMIN
IT
```

## equipment

```text
id
equipment_id
name
location
allowed_roles
validation_date
active
created_by
created_at
updated_at
```

For MVP, allowed_roles can be stored as JSON.

## approvers

```text
id
approver_id
name
type
department
email
active
created_at
```

## access_requests

```text
id
request_id

employee_id
employee_name
employee_email
employee_department

equipment_id
equipment_name

requested_role

hod_id
hod_name
hod_email

qa_id
qa_name
qa_email

reason

status

created_at
updated_at
```

## audit_logs

```text
id
request_id
user_id
user_name
action
description
timestamp
```

## notifications

```text
id
request_id
recipient_name
recipient_email
notification_type
subject
message
status
created_at
```

---

# 29. Demo Data

Seed the database automatically on first startup.

Create demo users.

### Employee

```text
EMP001
Yash Agrawal
yash@company.com
R&D
EMPLOYEE
```

### HODs

```text
HOD001
Amit Sharma
amit@company.com
Production
HOD

HOD002
Rahul Mehta
rahul@company.com
Engineering
HOD

HOD003
Neha Patel
neha@company.com
QC
HOD
```

### QAs

```text
QA001
Priya Shah
priya@company.com
Quality
QA

QA002
Ankit Kumar
ankit@company.com
Quality
QA
```

### Admin

```text
ADM001
System Admin
admin@company.com
IT
ADMIN
```

### IT

```text
IT001
IT Support
it@company.com
IT
IT
```

---

# 30. Demo Equipment

Seed at least 5 equipment records.

Example:

```text
EQ-001
HPLC System
QC Lab
Roles:
Analyst
Senior Analyst
Scientist

EQ-002
Dissolution Tester
Lab A
Roles:
Analyst
Operator

EQ-003
UV Spectrophotometer
Lab B
Roles:
Analyst
Scientist

EQ-004
Stability Chamber
R&D Lab
Roles:
Scientist
Supervisor

EQ-005
GC System
QC Lab
Roles:
Analyst
Senior Analyst
Scientist
```

Make at least one equipment inactive so that the inactive behavior can be demonstrated.

---

# 31. Demo Login

Create a simple login/demo-user selection screen.

Example:

```text
Login as:

[ Employee - Yash Agrawal ]

[ HOD - Rahul Mehta ]

[ QA - Priya Shah ]

[ Admin - System Admin ]

[ IT - IT Support ]
```

When selected, the application behaves according to that user's role.

This is only for MVP demonstration.

No password authentication is required.

---

# 32. Important Business Rules

Implement these rules.

### Rule 1

Inactive equipment cannot be selected for a new request.

### Rule 2

Only roles configured for the selected equipment appear in the Role dropdown.

### Rule 3

Only active HODs appear in HOD dropdown.

### Rule 4

Only active QAs appear in QA dropdown.

### Rule 5

Employee cannot submit without selecting:

```text
Equipment
Role
HOD
QA
Reason
```

### Rule 6

HOD can only approve requests assigned to that HOD.

### Rule 7

QA can only approve requests assigned to that QA.

### Rule 8

QA cannot approve until HOD approval is completed.

### Rule 9

IT cannot process until QA approval is completed.

### Rule 10

Every workflow action creates an audit record.

### Rule 11

Every notification creates a notification record.

### Rule 12

Approver details are snapshotted into the request at submission time.

---

# 33. Validation

Add basic frontend and backend validation.

Examples:

- Required fields
- Valid email format
- Unique equipment ID
- Unique employee ID
- Unique approver ID
- Cannot select inactive equipment
- Cannot select inactive HOD/QA
- Cannot approve already processed request
- Cannot skip workflow stages

Backend validation is mandatory. Do not rely only on frontend validation.

---

# 34. Error Handling

Display user-friendly errors.

Examples:

```text
Unable to create equipment.
Please try again.
```

```text
This equipment is currently inactive.
```

```text
This request has already been approved.
```

```text
You are not authorized to approve this request.
```

Do not expose raw backend stack traces to the UI.

---

# 35. UI Requirements

Make the UI polished enough for an MVP presentation.

Use:

- Sidebar
- Top navigation
- Breadcrumbs
- Cards
- Tables
- Search
- Filters
- Status badges
- Modals
- Confirmation dialogs
- Toast notifications
- Loading states
- Empty states

Status colors can be intuitive:

```text
Pending → Yellow
Approved → Green
Rejected → Red
IT Pending → Blue
Completed → Green
Inactive → Gray
```

---

# 36. Responsive Design

The application should work on:

- Desktop
- Laptop
- Tablet

Desktop is the primary target.

---

# 37. API Design

Create clean REST APIs.

Example:

### Equipment

```text
GET    /api/equipment
POST   /api/equipment
GET    /api/equipment/{id}
PUT    /api/equipment/{id}
PATCH  /api/equipment/{id}/status
```

### Approvers

```text
GET    /api/approvers
POST   /api/approvers
PUT    /api/approvers/{id}
PATCH  /api/approvers/{id}/status
```

### Requests

```text
GET    /api/requests
POST   /api/requests
GET    /api/requests/{id}
POST   /api/requests/{id}/approve
POST   /api/requests/{id}/reject
```

### IT

```text
POST   /api/requests/{id}/complete
```

### Audit

```text
GET /api/audit
GET /api/audit/{request_id}
```

### Notifications

```text
GET /api/notifications
```

---

# 38. Architecture

Keep the architecture simple.

```text
React Frontend
       │
       │ REST API
       ▼
FastAPI Backend
       │
       ▼
SQLite Database
```

Backend structure:

```text
backend/
    app/
        main.py
        database.py
        models/
        schemas/
        routers/
        services/
        seed.py
```

Frontend:

```text
frontend/
    src/
        components/
        pages/
        layouts/
        services/
        hooks/
        types/
```

Keep business logic in backend services rather than putting workflow logic directly into React.

---

# 39. Notification Service

Create:

```text
notification_service.py
```

with functions such as:

```text
send_hod_notification(request)
send_qa_notification(request)
send_employee_notification(request)
send_it_notification(request)
```

For MVP these functions should:

1. Create notification record
2. Print/log the email
3. Mark notification as `Sent`

Structure the service so SMTP/email provider can be added later without changing the workflow logic.

---

# 40. Workflow Service

Create a dedicated workflow service.

For example:

```text
submit_request()
approve_by_hod()
reject_by_hod()
approve_by_qa()
reject_by_qa()
complete_by_it()
```

Each function should:

1. Validate current status
2. Validate current user
3. Update status
4. Create audit record
5. Trigger notification

This keeps the workflow maintainable.

---

# 41. MVP Demo Flow

The application must make this exact demo possible:

### Step 1

Login as:

```text
Employee - Yash Agrawal
```

Go to:

```text
Create Request
```

### Step 2

Select:

```text
Equipment:
HPLC System
```

Role dropdown automatically displays:

```text
Analyst
Senior Analyst
Scientist
```

Select:

```text
Analyst
```

### Step 3

Select:

```text
HOD:
Rahul Mehta
```

Select:

```text
QA:
Priya Shah
```

Enter:

```text
Reason:
Required for analytical testing activities.
```

Click:

```text
Submit Request
```

System generates:

```text
REQ-0001
```

Status:

```text
Pending HOD
```

Notification created for:

```text
rahul@company.com
```

Audit record created.

---

### Step 4

Switch user to:

```text
HOD - Rahul Mehta
```

Open:

```text
Approvals
```

REQ-0001 should appear.

Click:

```text
Approve
```

Status becomes:

```text
Pending QA
```

Notification created for:

```text
priya@company.com
```

Audit trail updated.

---

### Step 5

Switch user to:

```text
QA - Priya Shah
```

Open:

```text
Approvals
```

REQ-0001 appears.

Click:

```text
Approve
```

Status becomes:

```text
IT Pending
```

Two notifications created:

```text
Yash
IT Team
```

---

### Step 6

Switch user to:

```text
IT Support
```

Open:

```text
IT Requests
```

REQ-0001 appears.

Click:

```text
Mark Access Completed
```

Status becomes:

```text
IT Completed
```

Employee notification should show:

```text
Equipment access has been successfully provisioned.
```

---

# 42. Rejection Demo

The system must also support:

```text
Employee
   ↓
HOD
   ↓
Reject
```

Status:

```text
Rejected
```

Employee can see:

```text
Rejected
Reason:
Access not required for current assignment.
```

Similarly:

```text
HOD Approved
      ↓
QA
      ↓
Reject
```

Status becomes:

```text
Rejected
```

The employee should receive a notification.

---

# 43. Important MVP Simplifications

Do NOT implement the following yet:

- Real Microsoft/Google authentication
- Active Directory integration
- Real SMTP configuration
- Microsoft Teams integration
- Electronic signatures
- 21 CFR Part 11 implementation
- Complex RBAC
- SSO
- Digital certificates
- PDF generation
- Advanced analytics
- QR codes
- Equipment maintenance
- Equipment reservation/scheduling
- Complex validation management
- Multi-level HOD approval
- Multiple QA approval levels

The purpose is to demonstrate the core workflow.

---

# 44. Seed / Reset Demo Data

Add a convenient development feature:

```text
Reset Demo Data
```

Only show it to Admin.

When clicked, restore the seeded demo database.

This makes it easy to repeatedly demonstrate the workflow.

---

# 45. README

Create a complete README containing:

## Requirements

```text
Python
Node.js
npm
```

## Backend setup

Commands required to:

```text
create virtual environment
install dependencies
start FastAPI
```

## Frontend setup

Commands required to:

```text
install dependencies
start React application
```

## Database

Explain:

```text
SQLite
automatic table creation
automatic seed data
```

## Demo Users

Document all demo accounts.

## Demo Workflow

Explain how to demonstrate:

```text
Employee → HOD → QA → IT
```

---

# 46. Environment Configuration

Create:

```text
.env.example
```

Include future-ready placeholders:

```text
DATABASE_URL=
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
IT_EMAIL=
```

Do not require SMTP for the MVP.

---

# 47. Code Quality

Even though this is an MVP:

- Use TypeScript properly
- Use Pydantic schemas
- Separate API routes from business logic
- Use database models
- Avoid duplicated code
- Use reusable React components
- Handle API errors
- Add loading states
- Add empty states
- Add basic comments for complex workflow logic

Do not create a single giant React component or single giant Python file.

---

# 48. Final Acceptance Criteria

The MVP is considered complete only when all of these work:

### Equipment

- [ ] Admin can create equipment
- [ ] Equipment gets unique ID
- [ ] Admin can activate/deactivate equipment
- [ ] Allowed roles can be configured
- [ ] Employees cannot select inactive equipment

### Approvers

- [ ] Admin can create HOD
- [ ] Admin can create QA
- [ ] Email is stored
- [ ] Active/inactive supported
- [ ] Employee can select HOD
- [ ] Employee can select QA

### Request

- [ ] Employee information automatically populated
- [ ] Equipment selectable
- [ ] Roles dynamically loaded
- [ ] HOD selectable
- [ ] QA selectable
- [ ] Reason required
- [ ] Request ID generated
- [ ] Request stored

### Workflow

- [ ] Submit → Pending HOD
- [ ] HOD approves → Pending QA
- [ ] HOD rejects → Rejected
- [ ] QA approves → IT Pending
- [ ] QA rejects → Rejected
- [ ] IT completes → IT Completed

### Notifications

- [ ] HOD notification generated
- [ ] QA notification generated
- [ ] Employee notification generated
- [ ] IT notification generated
- [ ] Notification history visible

### Audit

- [ ] Request creation logged
- [ ] HOD approval logged
- [ ] QA approval logged
- [ ] Rejection logged
- [ ] IT completion logged
- [ ] Notifications logged

### Demo

The complete flow:

```text
Employee
   ↓
Create Request
   ↓
Select Equipment
   ↓
Select Role
   ↓
Select HOD
   ↓
Select QA
   ↓
Submit
   ↓
HOD Approval
   ↓
QA Approval
   ↓
IT
   ↓
Access Completed
```

must work end-to-end without manually editing the database.

---

# 49. Development Approach

Build this incrementally.

### Phase 1

Set up:

- Backend
- Frontend
- SQLite
- Database models
- Seed data

### Phase 2

Build:

- Login/demo user switching
- Dashboard
- Equipment Master
- Approver Master

### Phase 3

Build:

- Create Request
- Dynamic equipment roles
- HOD selection
- QA selection

### Phase 4

Build:

- HOD approval
- QA approval
- IT workflow

### Phase 5

Build:

- Notifications
- Audit Trail
- Request tracking

### Phase 6

Polish:

- UI
- Error handling
- Loading states
- Empty states
- Responsive design
- README

After each phase, test the existing functionality before moving to the next phase.

---

# 50. MOST IMPORTANT INSTRUCTION

Do not just create static screens/mockups.

This must be a **functional MVP**.

The following must actually work through the database and APIs:

```text
Create Equipment
        ↓
Create Request
        ↓
Generate Request ID
        ↓
Assign HOD
        ↓
Assign QA
        ↓
HOD Approval
        ↓
QA Approval
        ↓
IT Notification
        ↓
Employee Notification
        ↓
IT Completion
        ↓
Audit Trail
```

Every workflow transition must be persisted in the database.

Use seeded demo data so the entire workflow can be demonstrated immediately after starting the application.

Before considering the implementation complete, test the full Employee → HOD → QA → IT workflow end-to-end.