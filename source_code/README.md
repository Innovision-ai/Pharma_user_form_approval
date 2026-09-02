# Pharmaceutical Equipment Access Management System — MVP

A working full-stack implementation of the access-request workflow described in
`Build MVP_ Pharmaceutical Equipment Access Management System.md` and the
client-facing spec (`mvp-spec.html`): an employee requests access to a piece of
lab/production equipment, the request is routed sequentially to a Head of
Department and then a QA approver, and once both approve, IT provisions access
and marks the request complete. Every step is logged to an audit trail, and a
mock notification is generated at each stage instead of sending real email.

This is a demo-grade MVP, not a production system — see [Known limitations](#known-limitations-by-design).

## Architecture

```
┌─────────────────────┐         HTTP (JSON)         ┌──────────────────────┐
│  React + TS + Vite   │ ───────────────────────────▶│   FastAPI backend    │
│  (source_code/       │  X-Demo-User: <employee_id> │   (source_code/      │
│   frontend)          │ ◀─────────────────────────── │    backend)          │
└─────────────────────┘                              └──────────┬───────────┘
                                                                  │
                                                                  ▼
                                                         SQLite (app.db)
```

- **Backend**: FastAPI + SQLAlchemy 2.0 + SQLite + Pydantic v2. All business
  rules (workflow sequencing, role checks, assignment checks) are enforced
  server-side — the frontend only hides UI it knows the user can't use.
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS, with a small
  hand-rolled UI kit (no external component library).
- **No real authentication.** There are no passwords. A "Demo User Switcher"
  on the login screen lets you pick any seeded identity; every subsequent API
  call sends that identity's employee ID in an `X-Demo-User` header, and the
  backend resolves it to a `User` row and enforces that user's role/permissions.
  This is a deliberate simplification for a demo — see [Known limitations](#known-limitations-by-design).

## Folder structure

```
source_code/
├── backend/
│   ├── app/
│   │   ├── main.py          FastAPI app, CORS, startup seeding, router registration
│   │   ├── config.py        Env-driven settings (DB URL, CORS origins, IT mailbox)
│   │   ├── constants.py     Role names and workflow status constants
│   │   ├── database.py      SQLAlchemy engine/session/Base
│   │   ├── models.py        ORM models: User, Equipment, Approver, AccessRequest,
│   │   │                    AuditLog, Notification
│   │   ├── schemas.py       Pydantic request/response schemas
│   │   ├── deps.py          get_current_user / require_role dependencies
│   │   ├── seed.py          Seeds (and resets) the fixed demo dataset
│   │   ├── routers/         One router per resource (users, equipment, approvers,
│   │   │                    requests, audit, notifications, dashboard, admin)
│   │   └── services/
│   │       ├── workflow.py       Core state machine: submit/approve/reject/complete
│   │       └── notifications.py  Writes mock notification rows
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── main.tsx / App.tsx        Entry point and route table
    │   ├── context/AuthContext.tsx   Demo-login state (persisted to localStorage)
    │   ├── lib/api.ts                Typed fetch client for every backend endpoint
    │   ├── components/                UI primitives, layout shell, status/timeline widgets
    │   └── pages/                     One file per screen (see "Pages" below)
    └── package.json
```

## Prerequisites

- Python 3.10+ (tested on 3.14)
- Node.js 18+ and npm

## Running the backend

```bash
cd source_code/backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # defaults work as-is; edit if you need to
uvicorn app.main:app --reload
```

The API is now on **http://localhost:8000**. On first startup (empty database)
it automatically seeds the demo dataset — you don't need to run anything else.
Interactive API docs are available at `http://localhost:8000/docs`.

## Running the frontend

In a second terminal:

```bash
cd source_code/frontend
npm install

cp .env.example .env             # points the app at http://localhost:8000
npm run dev
```

Open **http://localhost:5173**. If you're running the backend on a different
host/port, edit `VITE_API_BASE_URL` in `frontend/.env` and add that origin to
`CORS_ORIGINS` in `backend/.env`.

## The Demo User Switcher

The login screen lists every seeded user. Click one to "sign in" as them — no
password. The app remembers your choice in `localStorage`, and a **Switch
User** button in the top bar returns you to the login screen at any time. An
**Admin** user also gets a **Reset Demo Data** button in the top bar, which
wipes all requests/audit logs/notifications and reloads the fixed seed set
(same as restarting the backend against an empty database).

## Guided walkthrough

The seed data (`backend/app/seed.py`) includes these identities:

| Employee ID | Name | Role | Department |
|---|---|---|---|
| EMP001 | Yash Agrawal | Employee | R&D |
| HOD001 | Amit Sharma | HOD | Production |
| HOD002 | Rahul Mehta | HOD | Engineering |
| HOD003 | Neha Patel | HOD | QC |
| QA001 | Priya Shah | QA | Quality |
| QA002 | Ankit Kumar | QA | Quality |
| ADM001 | System Admin | Admin | IT |
| IT001 | IT Support | IT | IT |

Plus one QA **approver** with no login of their own (QA003, Sneha Verma) —
this shows that the "Approver Master" list (who can be picked as a reviewer)
is intentionally separate from the "Users" list (who can log in).

**Happy path:**
1. Log in as **Yash Agrawal (EMP001)** → *Create Request* → choose equipment
   `EQ-001 HPLC System`, role `Analyst`, HOD `Rahul Mehta`, QA `Priya Shah`,
   enter a reason, submit. Status starts at `PENDING_HOD`.
2. Switch user to **Rahul Mehta (HOD002)** → *Approvals* → open the request →
   **Approve**. Status moves to `PENDING_QA`. (Only Rahul can approve this
   request — try switching to Amit Sharma or Neha Patel first and you'll get
   a 403 / disabled action, because the request is assigned specifically to
   the HOD Yash selected.)
3. Switch user to **Priya Shah (QA001)** → *Approvals* → **Approve**. Status
   moves to `IT_PENDING`, and a mock notification is generated addressed to
   IT.
4. Switch user to **IT Support (IT001)** → *IT Requests* → **Mark Access
   Granted**. Status becomes `IT_COMPLETED`.
5. Check *Audit Trail* (as any user — everyone can see it) to see the full
   `REQUEST_SUBMITTED → HOD_APPROVED → QA_APPROVED → IT_COMPLETED` trail, and
   *Notifications* to see the mock emails generated at each step.

**Rejection path:** repeat step 1, then at step 2 click **Reject** instead and
enter a reason. The request's status becomes `REJECTED` and stops there — QA
and IT never see it. The rejection reason and the stage it was rejected at are
shown on the request detail page.

**Admin screens:** log in as **System Admin (ADM001)** to reach *Equipment
Master* and *Approver Master* — create/edit records and toggle them
active/inactive (records are never hard-deleted, only deactivated, so history
stays intact). Try deactivating `EQ-005 GC System` (already inactive in the
seed) or creating a new HOD/QA approver, then use them in a new request.

## Pages

| Route | Who sees it | Purpose |
|---|---|---|
| `/login` | everyone | Demo user switcher |
| `/dashboard` | everyone | Counts + recent requests |
| `/equipment` | Admin | Equipment master CRUD + activate/deactivate |
| `/approvers` | Admin | Approver master CRUD + activate/deactivate |
| `/requests/new` | Employee | Submit a new access request |
| `/requests/mine` | Employee | Requests you've submitted |
| `/requests/:code` | everyone | Full detail, timeline, and role-appropriate actions |
| `/approvals` | HOD, QA | Requests currently assigned to you |
| `/it-queue` | IT | Approved requests awaiting/after provisioning |
| `/audit` | everyone | Filterable audit log |
| `/notifications` | everyone | Mock notification history |

## Known limitations (by design)

This MVP intentionally simplifies things that a production rollout would need
to revisit:

- **No real authentication** — the demo user switcher is a stand-in for SSO/
  login. There is no password, session token, or way to prove identity beyond
  trusting the `X-Demo-User` header.
- **No real email** — `services/notifications.py` writes a row to a
  `notifications` table instead of calling an SMTP server (the `.env.example`
  has placeholder SMTP settings for a future phase, unused today).
- **SQLite** — fine for a demo; a real deployment would move to Postgres.
- **Single-tenant, single-instance** — no multi-org support, no background
  jobs, no pagination beyond simple `limit` params.
