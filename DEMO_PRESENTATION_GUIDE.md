# UAM Workflow — What Was Requested vs What Was Built

## Demo Presentation Guide

**Local URLs for Demo:**
- Frontend: http://localhost:5174/
- Backend: http://localhost:8000

**How to start:**
```bash
# Terminal 1 — Backend
cd source_code/backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd source_code/frontend
npm run dev
```

Then open http://localhost:5174/ in Chrome.

---

## SECTION 1: Core MVP (From Build MVP Document)

### Equipment Master

| Requested | Status | Notes |
|-----------|--------|-------|
| Admin creates equipment | IMPLEMENTED | Equipment Master page |
| Auto-generated Equipment ID (EQ-001, EQ-002) | IMPLEMENTED | Sequential auto-ID |
| Equipment Name, Location, Allowed Roles, Validation Date | IMPLEMENTED | All fields present |
| Active / Inactive toggle | IMPLEMENTED | Toggle without delete |
| Searchable table with Edit/Activate/Deactivate | IMPLEMENTED | Full CRUD table |
| Inactive equipment hidden from Create Request | IMPLEMENTED | Only active shown in dropdown |
| **Type field** (Hardware/Software/Instrument/Equipment) | **ADDED** | UAM Workflow requirement |
| **Plant field** (P1/P2/P3) | **ADDED** | UAM Workflow requirement |
| Backend filtering by type, plant, active | IMPLEMENTED | Query params supported |

**Demo Script:**
1. Login as **System Admin (ADM001)**
2. Go to **Equipment Master**
3. Click **Add Equipment** → fill Name, Type (Software), Location, Plant (P3), Allowed Roles, Validation Date
4. Save → see it appear in table with EQ-00X code
5. Click **Deactivate** on any equipment
6. Switch to Employee → Create Request → deactivated equipment does NOT appear

---

### User / Employee Management

| Requested | Status | Notes |
|-----------|--------|-------|
| Demo login with user switcher | IMPLEMENTED | Login screen with all users |
| No password required | IMPLEMENTED | Click to login |
| Role-based access (Employee, HOD, QA, IT, Admin) | IMPLEMENTED | Enforced backend + frontend |
| Employee info auto-populated in request | IMPLEMENTED | Read-only fields |

| **UAM Workflow Additions** | | |
| **User Management page** (Admin only) | **IMPLEMENTED** | `/users` route |
| **Create new users** | **IMPLEMENTED** | With employee_id, name, email, dept, plant, role |
| **Edit existing users** | **IMPLEMENTED** | All fields editable |
| **Activate / Deactivate users** | **IMPLEMENTED** | Toggle status without delete |
| **Plant assignment** (P1/P2/P3) | **IMPLEMENTED** | Plant field on all users |
| **Role assignment** (5 roles) | **IMPLEMENTED** | Dropdown in form |
| **Filter users** by role, plant, active status | **IMPLEMENTED** | Backend query filters |

**Demo Script:**
1. Login as **System Admin**
2. Go to **User Management**
3. Click **+ Add User** → create EMP010 / Test User / QC / P2 / EMPLOYEE
4. See them in the table
5. Click **Edit** → change plant to P3
6. Click **Deactivate** → user goes inactive
7. Filter by "Plant = P2" → only P2 users show

---

### Approver Master

| Requested | Status | Notes |
|-----------|--------|-------|
| Admin manages HODs and QAs | IMPLEMENTED | Approver Master page |
| Fields: approver_id, name, type, department, email | IMPLEMENTED | All present |
| Active/inactive toggle | IMPLEMENTED | Without delete |
| Only active HODs/QAs shown in request form | IMPLEMENTED | Dropdown filters active only |

**Demo Script:**
1. Admin → **Approver Master**
2. Add new HOD or QA
3. Toggle one inactive
4. Employee → Create Request → inactive approver does NOT appear

---

### Create Access Request

| Requested | Status | Notes |
|-----------|--------|-------|
| Select Equipment (only active) | IMPLEMENTED | Dropdown with active equipment |
| Dynamic Role dropdown based on equipment | IMPLEMENTED | Roles filtered by equipment config |
| Employee info auto-filled (read-only) | IMPLEMENTED | Name, ID, Email, Department |
| Select HOD (only active) | IMPLEMENTED | Dropdown filtered |
| Select QA (only active) | IMPLEMENTED | Dropdown filtered |
| Reason for Access (required textarea) | IMPLEMENTED | Validated |
| Submit → generates Request ID (REQ-0001) | IMPLEMENTED | Auto-sequential ID |
| Status becomes "Pending HOD" | IMPLEMENTED | Correct workflow state |

**Demo Script:**
1. Login as **Yash Agrawal (EMP001)**
2. **Create Request**
3. Select **HPLC System** → Role dropdown shows Analyst, Senior Analyst, Scientist
4. Select **Analyst**
5. Select HOD: **Rahul Mehta**
6. Select QA: **Priya Shah**
7. Enter reason: "Required for analytical testing"
8. Submit → see **REQ-000X** created, status = PENDING_HOD

---

### Request Workflow

| Requested | Status | Notes |
|-----------|--------|-------|
| Status: Draft → Pending HOD → Pending QA → Approved → IT Pending → IT Completed | IMPLEMENTED | Full state machine |
| HOD approves → Pending QA | IMPLEMENTED | With validation |
| HOD rejects → Rejected (with reason) | IMPLEMENTED | Audit + notification logged |
| QA approves → IT Pending | IMPLEMENTED | With validation |
| QA rejects → Rejected (with reason) | IMPLEMENTED | Audit + notification logged |
| IT completes → IT Completed | IMPLEMENTED | Final state |
| Cannot skip stages | IMPLEMENTED | Backend enforced |
| Only assigned HOD can approve their request | IMPLEMENTED | 403 if wrong HOD |
| Only assigned QA can approve their request | IMPLEMENTED | 403 if wrong QA |
| Rejection reason required | IMPLEMENTED | Modal with textarea |

**Demo Script — Happy Path:**
1. EMP001 creates request → PENDING_HOD
2. Switch to **Rahul Mehta (HOD002)** → **Approvals** → Approve → PENDING_QA
3. Switch to **Priya Shah (QA001)** → **Approvals** → Approve → IT_PENDING
4. Switch to **IT Support (IT001)** → **IT Requests** → Mark Access Granted → IT_COMPLETED

**Demo Script — Rejection Path:**
1. EMP001 creates request → PENDING_HOD
2. HOD002 → **Reject** → enter "Not authorized" → REJECTED
3. EMP001 → **My Requests** → see REJECTED with reason

---

### Approver Snapshot

| Requested | Status | Notes |
|-----------|--------|-------|
| HOD/QA details stored INSIDE request at submission | IMPLEMENTED | hod_id, hod_name, hod_email, qa_id, qa_name, qa_email all snapshotted |
| Changes to Approver Master do NOT affect past requests | IMPLEMENTED | Request preserves original approver info |

**Demo Script:**
1. Create a request with HOD002
2. Admin edits HOD002's name in Approver Master
3. Open the original request → still shows OLD HOD name (snapshot preserved)

---

### Notification System (Mock)

| Requested | Status | Notes |
|-----------|--------|-------|
| Mock notification service (no SMTP) | IMPLEMENTED | Writes to DB table |
| HOD notified on submit | IMPLEMENTED | Notification record created |
| QA notified on HOD approval | IMPLEMENTED | Notification record created |
| Employee + IT notified on QA approval | IMPLEMENTED | Both records created |
| Notification history page | IMPLEMENTED | /notifications route |
| Notification table: Date, Recipient, Email, Subject, Type, Status | IMPLEMENTED | Full table |

**Demo Script:**
1. After completing the happy path workflow above
2. Go to **Notifications** (any user)
3. See 4 notifications:
   - HOD: "REQ-000X Requires Your Approval"
   - QA: "Requires QA Approval"
   - Employee: "Your request has been approved"
   - IT: "Request ready for provisioning"

---

### Audit Trail

| Requested | Status | Notes |
|-----------|--------|-------|
| Every action creates audit record | IMPLEMENTED | All workflow transitions logged |
| Fields: request_id, user_id, user_name, action, description, timestamp | IMPLEMENTED | Complete |
| Filter by Request ID, User, Action, Date | IMPLEMENTED | Query params supported |
| Audit records read-only | IMPLEMENTED | No edit/delete |

**Demo Script:**
1. Complete happy path workflow
2. Go to **Audit Trail**
3. Filter by request code → see:
   - REQUEST_SUBMITTED by Yash Agrawal
   - HOD_APPROVED by Rahul Mehta
   - QA_APPROVED by Priya Shah
   - IT_COMPLETED by IT Support

---

### Dashboard

| Requested | Status | Notes |
|-----------|--------|-------|
| KPI Cards: Total Equipment, Active, Pending HOD, Pending QA, Approved, IT Pending | IMPLEMENTED | All 6 cards |
| Recent Requests table | IMPLEMENTED | Latest requests with status badges |

**Demo Script:**
1. Login as any user → **Dashboard**
2. See live counts updating as workflow progresses
3. Recent requests table shows latest activity

---

### Request Detail Page

| Requested | Status | Notes |
|-----------|--------|-------|
| Visual workflow timeline/stepper | IMPLEMENTED | Status stepper with checkmarks |
| Employee, Equipment, Role, HOD, QA, Reason displayed | IMPLEMENTED | All fields shown |
| Audit History section | IMPLEMENTED | Inline on detail page |
| Notification History section | IMPLEMENTED | Inline on detail page |
| Role-appropriate action buttons | IMPLEMENTED | Approve/Reject/Complete based on user + status |

**Demo Script:**
1. Open any request from My Requests or Approvals
2. See visual timeline at top
3. Scroll to Audit History → all actions logged
4. Scroll to Notification History → all emails logged

---

### IT Requests Page

| Requested | Status | Notes |
|-----------|--------|-------|
| IT sees IT Pending requests | IMPLEMENTED | /it-queue route |
| Mark Access Completed button | IMPLEMENTED | Changes status to IT_COMPLETED |

**Demo Script:**
1. After QA approves, login as IT001
2. **IT Requests** → see request
3. Click **Mark Access Granted** → status updates

---

### My Requests Page

| Requested | Status | Notes |
|-----------|--------|-------|
| Employee sees only their requests | IMPLEMENTED | /requests/mine route |
| Table with Request ID, Equipment, Role, HOD, QA, Status, Date | IMPLEMENTED | Full table |

**Demo Script:**
1. Login as EMP001 → **My Requests**
2. See all requests submitted by Yash Agrawal
3. Click any to see detail page

---

### Admin Features

| Requested | Status | Notes |
|-----------|--------|-------|
| Equipment Master (Admin only) | IMPLEMENTED | Route protected |
| Approver Master (Admin only) | IMPLEMENTED | Route protected |
| **User Management (Admin only)** | **IMPLEMENTED** | `/users` — UAM addition |
| **Inventory Report (Admin only)** | **IMPLEMENTED** | `/inventory` — UAM addition |
| Reset Demo Data | IMPLEMENTED | Admin top-bar button |

**Demo Script:**
1. Login as System Admin
2. See all admin pages in sidebar
3. Click **Reset Demo Data** → wipes requests, audit, notifications, reloads seed

---

## SECTION 2: UAM Workflow Additions (Beyond MVP Spec)

These were NOT in the original MVP document but were added per the UAM Workflow requirements:

### Plant-Based Access Control

| Feature | Status |
|---------|--------|
| Plant field on Users (P1/P2/P3) | IMPLEMENTED |
| Plant field on Equipment (P1/P2/P3) | IMPLEMENTED |
| Filter users by plant | IMPLEMENTED |
| Filter equipment by plant | IMPLEMENTED |

### Equipment Type Classification

| Feature | Status |
|---------|--------|
| Type field on Equipment (Hardware/Software/Instrument/Equipment) | IMPLEMENTED |
| Filter equipment by type | IMPLEMENTED |

### Inventory Report

| Feature | Status |
|---------|--------|
| Page: `/inventory` (Admin only) | IMPLEMENTED |
| Total / Active / Retired count cards | IMPLEMENTED |
| Filter by status (All/Active/Retired) | IMPLEMENTED |
| Filter by plant (P1/P2/P3) | IMPLEMENTED |
| Filter by type (Hardware/Software/Instrument/Equipment) | IMPLEMENTED |
| CSV Export | IMPLEMENTED |

**Demo Script:**
1. Admin → **Inventory Report**
2. See counts: Total 8, Active 7, Retired 1
3. Filter by Plant = P1 → only P1 equipment shown
4. Filter by Type = Instrument → only instruments shown
5. Click **Export CSV** → downloads file

---

## SECTION 3: What's NOT Yet Implemented

These are documented gaps for future phases:

| Feature | Status | Reason |
|---------|--------|--------|
| Real authentication (SSO/AD/OAuth) | NOT IMPLEMENTED | MVP simplification — demo login only |
| Real email (SMTP) | NOT IMPLEMENTED | Mock notifications used instead |
| Active Directory sync | NOT IMPLEMENTED | Out of MVP scope |
| Folder Request workflow (separate from Equipment) | NOT IMPLEMENTED | UAM doc mentions this — needs separate module |
| Asset Modification/Retirement Request workflow | NOT IMPLEMENTED | UAM doc mentions formal request for changes |
| Enterprise-level vs Plant-level Equipment Lists | NOT IMPLEMENTED | Currently all equipment in one list |
| Module Access filtering | NOT IMPLEMENTED | UAM doc mentions filtering by module access |
| Auto-scheduled Inventory Reports | NOT IMPLEMENTED | Only on-demand CSV export |
| 21 CFR Part 11 / Electronic signatures | NOT IMPLEMENTED | Compliance — future phase |
| PDF generation | NOT IMPLEMENTED | Future enhancement |
| Equipment reservation/scheduling | NOT IMPLEMENTED | Out of scope |
| Multi-level HOD approval | NOT IMPLEMENTED | Single HOD per request |
| Pagination on large tables | NOT IMPLEMENTED | MVP — small dataset |
| Postgres (instead of SQLite) | NOT IMPLEMENTED | Demo-grade only |

---

## SECTION 4: Demo Checklist (Print This)

### Pre-Demo Setup
- [ ] Backend running on http://localhost:8000
- [ ] Frontend running on http://localhost:5174
- [ ] Open browser in Incognito mode (no cached state)

### Demo Flow (15-20 minutes)

**1. Introduction (2 min)**
- Open login page
- Explain: "This is a demo-mode login — no passwords, just pick a role"

**2. Admin — Setup (3 min)**
- Login as **System Admin**
- Show **Dashboard** with live KPIs
- Go to **Equipment Master** → show Type and Plant columns
- Add a new piece of equipment (show auto-ID generation)
- Go to **User Management** → create a new user, show plant assignment
- Go to **Inventory Report** → show counts, filters, CSV export

**3. Employee — Create Request (3 min)**
- Switch to **Yash Agrawal (EMP001)**
- **Create Request**
- Select HPLC System → watch Role dropdown dynamically update
- Select Analyst, HOD (Rahul), QA (Priya), enter reason
- Submit → note REQ-000X and PENDING_HOD status
- Show **My Requests** page

**4. HOD — Approval (2 min)**
- Switch to **Rahul Mehta (HOD002)**
- **Approvals** → see the request
- Open detail → show timeline, audit section
- Click **Approve** → status becomes PENDING_QA

**5. QA — Approval (2 min)**
- Switch to **Priya Shah (QA001)**
- **Approvals** → see the request
- Click **Approve** → status becomes IT_PENDING

**6. IT — Completion (2 min)**
- Switch to **IT Support (IT001)**
- **IT Requests** → see the request
- Click **Mark Access Granted** → IT_COMPLETED

**7. Verification (3 min)**
- Switch back to **Yash Agrawal**
- **My Requests** → see IT_COMPLETED
- Open request detail → show full timeline
- Go to **Audit Trail** → show complete action log
- Go to **Notifications** → show mock email trail

**8. Rejection Demo (2 min)**
- Create another request
- As HOD, click **Reject** → enter reason
- Show EMP001's **My Requests** → REJECTED with reason visible

**9. Admin — Reset (1 min)**
- Switch to **System Admin**
- Click **Reset Demo Data** → all clean for next demo

---

## SECTION 5: Technical Summary for Q&A

**Stack:** React + TypeScript + Tailwind (Frontend) | FastAPI + SQLAlchemy + SQLite (Backend)

**Authentication:** Demo mode only — X-Demo-User header, no passwords

**Database:** SQLite, auto-seeded on first run

**API Style:** REST JSON, all business logic server-side

**State Management:** React Context for auth, React Query-style fetch in api.ts

**Deployment:** Vercel (frontend) + Vercel Serverless (backend)

**Plant/Type Fields:** Added per UAM Workflow — backend filtering via query params

**User Management & Inventory:** Added per UAM Workflow — Admin-only pages

---

*Document generated for demo presentation. All implemented features tested locally.*
