"""End-to-end workflow test for the UAM Testing Observations sheet.

    python e2e_test.py                 # local throw-away SQLite DB
    python e2e_test.py https://host    # deployed backend (creates test records)

Each check prints PASS/FAIL with the sheet row it covers.
"""
import os
import sys
import uuid
from datetime import date, timedelta

BASE = sys.argv[1] if len(sys.argv) > 1 else None
if BASE is None:
    db_file = "./_e2e.db"
    if os.path.exists(db_file):
        os.remove(db_file)
    os.environ["DATABASE_URL"] = f"sqlite:///{db_file}"
    from fastapi.testclient import TestClient
    from app.main import app
    _ctx = TestClient(app)
    _ctx.__enter__()
    client = _ctx
else:
    import httpx
    client = httpx.Client(base_url=BASE, timeout=90)

PW = "password123"
TAG = uuid.uuid4().hex[:6].upper()
results = []


def check(row, label, cond, detail=""):
    results.append((row, label, bool(cond)))
    print(f"{'PASS' if cond else 'FAIL'}  row {row:<6} {label}" + ("" if cond else f"  -> {detail}"))


def token(user, plant="P1"):
    r = client.post("/api/auth/login", data={"username": user, "password": PW, "plant": plant})
    assert r.status_code == 200, (user, r.text)
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def esign(extra=None, reason="E2E test"):
    d = {"auth_password": PW, "auth_reason": reason}
    d.update(extra or {})
    return d


# ---------- Login / plant (row 2, 24) ----------
r = client.post("/api/auth/login", data={"username": "HOD002", "password": PW, "plant": "P1"})
check(24, "login refused for a plant the user lacks", r.status_code == 403, r.text)
r = client.get("/api/auth/plants", params={"employee_id": "EMP001"})
check(24, "login plant list for user", set(r.json()["plants"]) >= {"P1", "P2"}, r.text)
ADM, EMP, HOD, QA, IT = (token(u) for u in ("ADM001", "EMP001", "HOD001", "QA001", "IT001"))
me = client.get("/api/users/me", headers=ADM).json()
check(24, "selected plant returned by /me", me.get("selected_plant") == "P1", me)
adm_p2 = token("ADM001", "P2")
eq_p2 = client.get("/api/equipment", headers=adm_p2).json()
check(24, "equipment scoped to login plant", eq_p2 and all(e["plant"] == "P2" for e in eq_p2), [e["plant"] for e in eq_p2])
users_p2 = client.get("/api/users", headers=adm_p2).json()
check(24, "users scoped to login plant", all("P2" in u["plants"] or u["plant"] == "P2" for u in users_p2))

# ---------- Demo reset (row 7) ----------
r = client.post("/api/admin/reset", headers=ADM)
check(7, "demo reset endpoint disabled", r.status_code == 403, r.status_code)

# ---------- Equipment (rows 11, 16, 18, 21, 25, 44, 45, 71) ----------
eq_body = {
    "name": f"E2E HPLC {TAG}", "type": "Instrument", "location": "R&D", "plant": "P1",
    "allowed_roles": ["Analyst", "Reviewer"], "validation_date": str(date.today()),
    "system_type": "Software", "gamp_category": "4", "computer_system_id": f"CS-{TAG}",
    "validation_status": "validated", "backup_include": True, "periodic_review_frequency": 12,
}
r = client.post("/api/equipment", json=eq_body, headers=ADM)
check(25, "new equipment cannot be created as Validated", r.status_code == 422, r.status_code)
eq_body["validation_status"] = "under_validation"
r = client.post("/api/equipment", json=eq_body, headers=ADM)
eq = r.json()
code = eq.get("equipment_code", "")
check(11, "equipment code is numeric", r.status_code == 201 and code.isdigit(), code)

reqs = client.get("/api/asset-requests", params={"equipment_code": code}, headers=ADM).json()
create_req = next((x for x in reqs if x["request_type"] == "CREATE"), None)
check(45, "asset creation request auto-raised for new equipment", create_req is not None, reqs)
check(72, "asset request numbered AST-YY-NNNNNN",
      create_req and create_req["request_code"].startswith(f"AST-{date.today():%y}-"), create_req and create_req["request_code"])

r = client.put(f"/api/equipment/{code}", json={**eq_body, "validation_status": "validated"}, headers=ADM)
check(25, "cannot validate before asset request approved", r.status_code == 422, r.status_code)

ac = create_req["request_code"]
r1 = client.post(f"/api/asset-requests/{ac}/review-complete", json={}, headers=HOD)
r2 = client.post(f"/api/asset-requests/{ac}/it-review-complete", json={}, headers=IT)
r3 = client.post(f"/api/asset-requests/{ac}/qa-approve", json={}, headers=QA)
check(45, "asset request reviewer -> IT -> QA approval", r3.status_code == 200 and r3.json()["status"] == "APPROVED",
      (r1.text[:100], r2.text[:100], r3.text[:100]))
r = client.put(f"/api/equipment/{code}", json={**eq_body, "validation_status": "validated", "make": "Agilent"}, headers=ADM)
check(71, "validation allowed after asset creation approved", r.status_code == 200, r.text[:200])

audit = client.get("/api/audit", params={"limit": 50}, headers=ADM).json()
changed = {a["field_name"]: (a["old_value"], a["new_value"]) for a in audit if a.get("entity") == f"Equipment {code}"}
check(21, "audit records each changed field", "Make" in changed and "Validation Status" in changed, changed)
check(16, "audit old/new value captured", changed.get("Validation Status") == ("under_validation", "validated"), changed)

r = client.patch(f"/api/equipment/{code}/status", json={"active": False}, headers=ADM)
check(44, "cannot retire without approved retire request", r.status_code == 422, r.status_code)

r = client.post("/api/asset-requests", json={"request_type": "RETIRE", "equipment_code": code, "plant": "P1",
                                             "reviewer_id": "HOD001", "it_executor_id": "IT001", "qa_approver_id": "QA001"},
                headers=EMP)
rr = r.json()
check(45, "retire request raised for approved equipment", r.status_code == 201 and rr["request_type"] == "RETIRE", r.text[:200])
r = client.post("/api/asset-requests", json={"request_type": "RETIRE", "equipment_code": code, "plant": "P1"}, headers=EMP)
check(45, "duplicate open retire request blocked", r.status_code == 409, r.status_code)

# ---------- Operational modules while equipment is active ----------
pm_rows = client.get("/api/preventive-maintenance", headers=ADM).json()
check(18, "Computer System ID puts equipment on PM planner", any(p["equipment_code"] == code for p in pm_rows))
check(50, "PM rows carry Computer System ID", any(p.get("computer_system_id") == f"CS-{TAG}" for p in pm_rows))
r = client.put(f"/api/preventive-maintenance/{code}/update-done", json={"last_pm_date": str(date.today()), "frequency_months": 6}, headers=ADM)
check(64, "PM update needs password", r.status_code == 401, r.status_code)
r = client.put(f"/api/preventive-maintenance/{code}/update-done",
               json={"last_pm_date": str(date.today()), "frequency_months": 6, "auth_password": PW}, headers=ADM)
check(53, "PM update with e-signature", r.status_code == 200, r.text[:200])
hist = client.get(f"/api/preventive-maintenance/history/{code}", headers=ADM).json()
check(55, "PM history recorded", len(hist) >= 1, hist)
r = client.post("/api/preventive-maintenance/additional",
                json={"system_name": f"Server {TAG}", "system_id": "SRV-1", "computer_system_id": "CS-SRV", "frequency_months": 3},
                headers=ADM)
add = r.json()
check(52, "additional PM system added", r.status_code == 201 and add.get("plant") == "P1", r.text[:200])
r = client.put(f"/api/preventive-maintenance/{add['equipment_code']}/update-done",
               json={"last_pm_date": str(date.today()), "auth_password": PW}, headers=ADM)
check(52, "additional PM system can be marked done", r.status_code == 200 and r.json().get("last_pm_date"), r.text[:200])
planner = client.get("/api/preventive-maintenance/planner", params={"year": date.today().year + 1}, headers=ADM).json()
check(51, "PM planner returns rows for a year", isinstance(planner, list))

r = client.put(f"/api/backup-schedule/{code}/update-done",
               json={"last_backup_date": str(date.today()), "frequency_days": 7, "backup_path": r"D:\Backup\E2E", "auth_password": PW},
               headers=ADM)
row = r.json()
check(58, "backup path saved", r.status_code == 200 and row.get("backup_path") == r"D:\Backup\E2E", r.text[:200])
check(57, "backup frequency updated", row.get("frequency_days") == 7, row)
check(56, "backup rows have no last/next backup", "last_backup_date" not in row and "next_backup_date" not in row, row.keys())
r = client.put(f"/api/periodic-review/{code}/update-done", json={"last_review_date": str(date.today())}, headers=ADM)
check(64, "periodic review update needs password", r.status_code == 401, r.status_code)
r = client.put(f"/api/periodic-review/{code}/update-done", json={"last_review_date": str(date.today()), "auth_password": PW}, headers=ADM)
check(70, "periodic review update with e-signature", r.status_code == 200, r.text[:200])
pr = client.get("/api/periodic-review", headers=ADM).json()
check(65, "under-validation systems excluded from periodic review", all(p["validation_status"] != "under_validation" for p in pr))

# ---------- Retire approval auto-retires (rows 45, 63, 71) ----------
rc = rr["request_code"]
for path, h in (("review-complete", HOD), ("it-review-complete", IT), ("qa-approve", QA)):
    client.post(f"/api/asset-requests/{rc}/{path}", json={}, headers=h)
eq_now = client.get(f"/api/equipment/{code}", headers=ADM).json()
check(45, "approved retire request retires equipment", eq_now["active"] is False, eq_now["active"])
codes = lambda ep: {x["equipment_code"] for x in client.get(ep, headers=ADM).json()}  # noqa: E731
check(63, "retired system removed from PM / backup / periodic review",
      code not in codes("/api/preventive-maintenance") | codes("/api/backup-schedule") | codes("/api/periodic-review"))

# ---------- Requests (UAM) rows 72-80 ----------
eq2 = client.post("/api/equipment", json={**eq_body, "name": f"E2E Dissolution {TAG}", "computer_system_id": None,
                                          "validation_status": "under_validation"}, headers=ADM).json()
code2 = eq2["equipment_code"]
opts = client.get("/api/uam/requests/equipment-options", headers=EMP).json()
mine = next((o for o in opts if o["equipment_code"] == code2), None)
check(74, "equipment dropdown lists active equipment of the user's department",
      mine is not None and all(o["department"].lower() == "r&d" for o in opts), opts)
check(75, "roles come from the selected equipment", mine and mine["allowed_roles"] == ["Analyst", "Reviewer"], mine)

base = {"template": "MANUFACTURING", "asset_type": "EQUIPMENT", "asset_code": code2, "requested_role": "Analyst",
        "reason": "Need access", "plant": "P1", "reviewer_id": "HOD001", "qa_approver_id": "QA001", "it_executor_id": "ADM001"}
r = client.post("/api/uam/requests", json={**base, "action": "MODIFY", **esign()}, headers=EMP)
check(76, "non-create action blocked when user ID does not exist", r.status_code == 400 and "does not exist" in r.text, r.text[:200])
r = client.post("/api/uam/requests", json={**base, "action": "CREATE"}, headers=EMP)
check(78, "submit without password refused", r.status_code == 401, r.status_code)
r = client.post("/api/uam/requests", json={**base, "action": "CREATE", "auth_password": PW, "auth_reason": ""}, headers=EMP)
check(78, "submit without reason refused", r.status_code == 400, r.status_code)
r = client.post("/api/uam/requests", json={**base, "action": "CREATE", "auth_password": "wrong", "auth_reason": "x"}, headers=EMP)
check(78, "submit with wrong password refused", r.status_code == 401, r.status_code)
r = client.post("/api/uam/requests", json={**base, "action": "CREATE", **esign()}, headers=EMP)
uam = r.json()
uc = uam.get("request_code", "")
check(72, "request numbered YY-NNNNNN", r.status_code == 201 and uc.startswith(f"{date.today():%y}-") and len(uc) == 9, uc)

r = client.post(f"/api/uam/requests/{uc}/approve", json=esign(), headers=QA)
check(77, "user not assigned to the stage cannot act", r.status_code == 403, r.status_code)
r = client.post(f"/api/uam/requests/{uc}/approve", json={"comment": "ok"}, headers=HOD)
check(78, "review without password refused", r.status_code == 401, r.status_code)
r = client.post(f"/api/uam/requests/{uc}/approve", json=esign({"comment": "ok"}), headers=HOD)
check(78, "review with e-signature", r.status_code == 200 and r.json()["status"] == "PENDING_QA_APPROVAL", r.text[:200])
r = client.post(f"/api/uam/requests/{uc}/reject", json=esign({"comment": "late"}), headers=HOD)
check(80, "reviewer cannot reject after approving", r.status_code in (400, 403), r.status_code)
r = client.post(f"/api/uam/requests/{uc}/correction", json=esign({"comment": "late"}), headers=HOD)
check(80, "reviewer cannot send back after approving", r.status_code in (400, 403), r.status_code)
r = client.post(f"/api/uam/requests/{uc}/approve", json=esign(), headers=QA)
check(78, "QA approval with e-signature", r.status_code == 200 and r.json()["status"] == "PENDING_EXECUTION", r.text[:200])
r = client.post(f"/api/uam/requests/{uc}/execute", json=esign({"user_login_id": "yash.a", "password": "Temp@1234"}), headers=ADM)
check(31, "IT Executor (Admin) executes request", r.status_code == 200 and r.json()["status"] == "PENDING_INITIATOR_ACK", r.text[:200])
r = client.post(f"/api/uam/requests/{uc}/acknowledge", json={}, headers=EMP)
check(73, "initiator acknowledges and closes", r.status_code == 200 and r.json()["status"] == "COMPLETED", r.text[:200])
r = client.post("/api/uam/requests", json={**base, "action": "MODIFY", **esign()}, headers=EMP)
check(76, "non-create action allowed once user ID exists", r.status_code == 201, r.text[:200])

# correction -> resubmit
mc = r.json()["request_code"]
r = client.post(f"/api/uam/requests/{mc}/correction", json=esign({"comment": "fix reason"}), headers=HOD)
check(79, "correction by assigned reviewer", r.json().get("status") == "CORRECTION_REQUIRED", r.text[:200])
r = client.post(f"/api/uam/requests/{mc}/approve", json=esign(), headers=HOD)
check(79, "no further action once sent back", r.status_code in (400, 403), r.status_code)
r = client.post(f"/api/uam/requests/{mc}/resubmit", json=esign(), headers=EMP)
check(79, "initiator resubmits", r.json().get("status") == "PENDING_REVIEW", r.text[:200])

# folder / project template
r = client.post("/api/uam/requests", json={"template": "FOLDER_PROJECT", "asset_type": "FOLDER", "asset_code": f"QC Share {TAG}",
                                           "requested_role": "Read", "action": "CREATE", "reason": "Folder access",
                                           "plant": "P1", "reviewer_id": "HOD001", "it_executor_id": "ADM001",
                                           "form_data": {"folder_path": r"\\fileserver\qc"}, **esign()}, headers=EMP)
fc = r.json().get("request_code")
check(73, "folder / project request template", r.status_code == 201, r.text[:200])
r = client.post(f"/api/uam/requests/{fc}/approve", json=esign(), headers=HOD)
check(73, "non-manufacturing request goes straight to execution", r.json().get("status") == "PENDING_EXECUTION", r.text[:200])

lst = client.get("/api/uam/requests", headers=HOD).json()
check(77, "reviewer list holds only requests waiting on them",
      all(x["status"] == "PENDING_REVIEW" or x["employee_id"] == "HOD001" for x in lst), [x["status"] for x in lst])
dash = client.get("/api/dashboard/summary", headers=EMP).json()
check(4, "dashboard lists recent requests", len(dash.get("recent_uam_requests", [])) >= 1)

# ---------- Users (rows 28, 31, 38, 39) ----------
r = client.post("/api/users", json={"employee_id": f"U{TAG}", "name": "Weak", "email": "w@x.com", "department": "QC",
                                    "plant": "P1", "role": "EMPLOYEE", "password": "short"}, headers=ADM)
check(39, "password complexity enforced on create", r.status_code == 400, r.status_code)
r = client.post("/api/users", json={"employee_id": f"U{TAG}", "name": "Strong", "email": "s@x.com", "department": "QC",
                                    "plant": "P1", "role": "EMPLOYEE", "password": "Strong@123"}, headers=ADM)
check(38, "user created with password", r.status_code == 201, r.text[:200])
r = client.post("/api/auth/login", data={"username": f"U{TAG}", "password": "Strong@123", "plant": "P1"})
check(38, "new user can log in", r.status_code == 200, r.status_code)
for _ in range(3):
    client.post("/api/auth/login", data={"username": f"U{TAG}", "password": "bad", "plant": "P1"})
r = client.post("/api/auth/login", data={"username": f"U{TAG}", "password": "Strong@123", "plant": "P1"})
check(39, "account locks after 3 failed logins", r.status_code == 403, r.status_code)
client.post(f"/api/users/U{TAG}/unlock", headers=ADM)
r = client.post("/api/auth/login", data={"username": f"U{TAG}", "password": "Strong@123", "plant": "P1"})
check(39, "admin unlock restores login", r.status_code == 200, r.status_code)
r = client.post("/api/users/import", json={"users": [
    {"employee_id": f"AD{TAG}", "name": "AD User", "email": "ad@x.com", "department": "QC", "plant": "P1",
     "role": "HOD", "password": "Directory@1"}]}, headers=ADM)
check(28, "AD / ERP import creates user", r.status_code == 200 and r.json()["created"] == [f"AD{TAG}"], r.text[:200])

# ---------- Vault (rows 46-48) ----------
r = client.post("/api/vault", json={"equipment_code": code2, "equipment_name": "E2E", "password": "Old#1",
                                    "created_date": str(date.today() - timedelta(days=85)), "expiry_days": 90}, headers=EMP)
vid = r.json()["id"]
notes = client.get("/api/notifications", headers=EMP).json()
check(46, "notification 10 days before vault expiry",
      any(n["request_code"] == f"VAULT-{vid}-EXPIRY" and n["status"] != "RESOLVED" for n in notes))
r = client.put(f"/api/vault/{vid}", json={"password": "New#2", "expiry_days": 90}, headers=EMP)
check(46, "vault edit resets created/updated date", r.json().get("created_date") == str(date.today()), r.text[:200])
notes = client.get("/api/notifications", headers=EMP).json()
check(46, "expiry notification closed after password update",
      all(n["status"] == "RESOLVED" for n in notes if n["request_code"] == f"VAULT-{vid}-EXPIRY"))
audit = client.get("/api/audit", params={"limit": 30}, headers=ADM).json()
check(48, "vault actions in audit trail", any(a["action"] == "VAULT_UPDATED" for a in audit))
check(17, "audit dates in DD/MM/YYYY", any(a["field_name"] == "Created/Updated Date" and a["new_value"] == date.today().strftime("%d/%m/%Y") for a in audit))

failed = [r for r in results if not r[2]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
