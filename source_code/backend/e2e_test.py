"""End-to-end workflow test for the UAM Testing Observations sheet.

    python e2e_test.py                 # local throw-away SQLite DB
    python e2e_test.py https://host    # deployed backend (creates test records)

Each check prints PASS/FAIL with the sheet row it covers.
"""
import os
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from dateutil.relativedelta import relativedelta

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
r = client.post("/api/auth/login", data={"username": "HOD001", "password": PW, "plant": "P2"})
check(24, "login refused for a plant the user lacks", r.status_code == 403, r.text)
r = client.get("/api/auth/plants", params={"employee_id": "EMP001"})
check(24, "login plant list for user", set(r.json()["plants"]) >= {"P1", "P2"}, r.text)
ADM, EMP, HOD, QA, IT = (token(u) for u in ("ADM001", "EMP001", "HOD001", "QA001", "IT001"))
me = client.get("/api/users/me", headers=ADM).json()
check(24, "selected plant returned by /me", me.get("selected_plant") == "P1", me)
emp_p2 = token("EMP001", "P2")  # EMP001 has P1 + P2
eq_p1 = client.get("/api/equipment", headers=ADM).json()
eq_p2 = client.get("/api/equipment", headers=emp_p2).json()
check(24, "equipment scoped to login plant",
      all(e["plant"] == "P1" for e in eq_p1) and all(e["plant"] == "P2" for e in eq_p2), [e["plant"] for e in eq_p2])
users_p2 = client.get("/api/users", headers=emp_p2).json()
check(24, "users scoped to login plant", all("P2" in u["plants"] or u["plant"] == "P2" for u in users_p2))

# ---------- Demo reset (row 7) ----------
r = client.post("/api/admin/reset", headers=ADM)
check(8, "demo reset endpoint disabled", r.status_code == 403, r.status_code)

# ---------- Equipment (rows 11, 16, 18, 21, 25, 44, 45, 71) ----------
eq_body = {
    "name": f"E2E HPLC {TAG}", "type": "Instrument", "location": "R&D", "plant": "P1",
    "allowed_roles": ["Analyst", "Reviewer"],
    "system_type": "Software", "gamp_category": "4", "computer_system_id": f"CS-{TAG}",
    "validation_status": "validated", "backup_include": True, "periodic_review_frequency": 12,
}
r = client.post("/api/equipment", json=eq_body, headers=ADM)
check(25, "new equipment cannot be created as Validated", r.status_code == 422, r.status_code)
eq_body["validation_status"] = "under_validation"
r = client.post("/api/equipment", json=eq_body, headers=ADM)
eq = r.json()
code = eq.get("equipment_code", "")
check(12, "equipment code is numeric", r.status_code == 201 and code.isdigit(), code)
check("R2", "validation completion date optional", r.status_code == 201 and eq.get("validation_date") is None, eq.get("validation_date"))

reqs = client.get("/api/asset-requests", params={"equipment_code": code}, headers=ADM).json()
check("R2", "no asset request created automatically with equipment", reqs == [], reqs)
r = client.post("/api/asset-requests", json={"request_type": "CREATE", "equipment_code": code, "plant": "P1"}, headers=EMP)
create_req = r.json()
check("R2", "asset request for registered equipment auto-populates details",
      r.status_code == 201 and create_req.get("system_name") == eq_body["name"]
      and create_req.get("computer_name") == f"CS-{TAG}", r.text[:200])
r = client.post("/api/asset-requests", json={"request_type": "CREATE", "equipment_code": code, "plant": "P1"}, headers=EMP)
check("R2", "second creation request for same equipment blocked", r.status_code == 409, r.status_code)
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
check("R2", "completion date required once Validated", r.status_code == 400, r.status_code)
eq_body["validation_date"] = str(date.today())
r = client.put(f"/api/equipment/{code}", json={**eq_body, "validation_status": "validated", "make": "Agilent"}, headers=ADM)
check(71, "validation allowed after asset creation approved", r.status_code == 200, r.text[:200])

audit = client.get("/api/audit", params={"limit": 50}, headers=ADM).json()
changed = {a["field_name"]: (a["old_value"], a["new_value"]) for a in audit if a.get("entity") == f"Equipment {code}"}
check(22, "audit records each changed field", "Make" in changed and "Validation Status" in changed, changed)
check(17, "audit old/new value captured", changed.get("Validation Status") == ("under_validation", "validated"), changed)

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
check(19, "Computer System ID puts equipment on PM planner", any(p["equipment_code"] == code for p in pm_rows))
check(50, "PM rows carry Computer System ID", any(p.get("computer_system_id") == f"CS-{TAG}" for p in pm_rows))
r = client.put(f"/api/preventive-maintenance/{code}/update-done", json={"last_pm_date": str(date.today()), "frequency_months": 6}, headers=ADM)
check(64, "PM update needs password", r.status_code == 401, r.status_code)
r = client.put(f"/api/preventive-maintenance/{code}/update-done",
               json={"last_pm_date": str(date.today()), "frequency_months": 6, "auth_password": PW}, headers=ADM)
check(53, "PM update with e-signature", r.status_code == 200, r.text[:200])
check(102, "next PM due = done + 6 months - 1 day", r.json().get("next_pm_date") == str(date.today() + relativedelta(months=6) - timedelta(days=1)), r.json().get("next_pm_date"))
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
               json={"last_backup_at": datetime.now(timezone.utc).isoformat(), "frequency_hours": 12,
                     "backup_path": r"D:\Backup\E2E", "auth_password": PW},
               headers=ADM)
row = r.json()
check(58, "backup path saved", r.status_code == 200 and row.get("backup_path") == r"D:\Backup\E2E", r.text[:200])
check(98, "backup frequency stored in hours", row.get("frequency_hours") == 12, row)
r = client.put(f"/api/backup-schedule/{code}/update-done",
               json={"last_backup_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(), "frequency_hours": 12,
                     "auth_password": PW}, headers=ADM)
check(99, "backup time in the future refused", r.status_code == 400, r.status_code)
check(56, "backup rows have no last/next backup", "last_backup_date" not in row and "next_backup_date" not in row, row.keys())
r = client.put(f"/api/periodic-review/{code}/update-done", json={"last_review_date": str(date.today())}, headers=ADM)
check(64, "periodic review update needs password", r.status_code == 401, r.status_code)
r = client.put(f"/api/periodic-review/{code}/update-done", json={"last_review_date": str(date.today()), "auth_password": PW}, headers=ADM)
check(70, "periodic review update with e-signature", r.status_code == 200, r.text[:200])
check(102, "next periodic review = review date + 12 months - 1 day",
      r.json().get("next_review_date") == str(date.today() + relativedelta(months=12) - timedelta(days=1)), r.json().get("next_review_date"))
prh = client.get(f"/api/periodic-review/history/{code}", headers=ADM).json()
check(97, "periodic review history recorded", len(prh) == 1 and prh[0]["review_date"] == str(date.today()), prh)
r = client.put(f"/api/periodic-review/{code}/update-done",
               json={"last_review_date": str(date.today() + timedelta(days=1)), "auth_password": PW}, headers=ADM)
check(99, "review date in the future refused", r.status_code == 400, r.status_code)
pr = client.get("/api/periodic-review", headers=ADM).json()
check(65, "under-validation systems excluded from periodic review", all(p["validation_status"] != "under_validation" for p in pr))

# ---------- Retire approval auto-retires (rows 45, 63, 71) ----------
rc = rr["request_code"]
for path, h in (("review-complete", HOD), ("it-review-complete", IT), ("qa-approve", QA)):
    client.post(f"/api/asset-requests/{rc}/{path}", json={}, headers=h)
eq_now = client.get(f"/api/equipment/{code}", headers=ADM).json()
check(45, "approved retire request retires equipment", eq_now["active"] is False, eq_now["active"])
rows_of = lambda ep, **kw: client.get(ep, headers=ADM, params=kw).json()  # noqa: E731
listed = [next((x for x in rows_of(ep) if x["equipment_code"] == code), None)
          for ep in ("/api/preventive-maintenance", "/api/backup-schedule", "/api/periodic-review")]
check("R2", "retired system still listed (marked retired) for history",
      all(x is not None and x["active"] is False for x in listed), listed)
yr = date.today().year
planned = set()
for ep in ("/api/preventive-maintenance/planner", "/api/backup-schedule/planner", "/api/periodic-review/planner"):
    for y in (yr, yr + 1):
        planned |= {x["equipment_code"] for x in rows_of(ep, year=y)}
check(63, "retired system not part of any planner", code not in planned)
r = client.put(f"/api/backup-schedule/{code}/update-done",
               json={"last_backup_date": str(date.today()), "auth_password": PW}, headers=ADM)
check("R2", "retired system cannot be updated", r.status_code == 422, r.status_code)

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
        "reason": "Need access", "plant": "P1", "reviewer_id": "HOD001", "qa_approver_id": "QA001", "it_executor_id": "ADM001",
        "training_completed": "NA", "training_remark": "No equipment-specific training"}
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
detail = client.get(f"/api/uam/requests/{uc}", headers=EMP).json()
check(93, "temporary password not exposed before acknowledgement",
      "Temp@1234" not in str(detail) and detail.get("has_temp_password") is True, detail.get("has_temp_password"))
notes_exec = [n for n in client.get("/api/notifications", headers=EMP).json() if n["request_code"] == uc]
check(93, "execution notification has user ID but no password",
      notes_exec and all("Temp@1234" not in n["body"] for n in notes_exec) and any("yash.a" in n["body"] for n in notes_exec), notes_exec)
r = client.post(f"/api/uam/requests/{uc}/acknowledge", json={}, headers=HOD)
check(93, "only the initiator can acknowledge", r.status_code == 403, r.status_code)
r = client.post(f"/api/uam/requests/{uc}/acknowledge", json={}, headers=EMP)
check(73, "initiator acknowledges and closes", r.status_code == 200 and r.json()["status"] == "COMPLETED", r.text[:200])
check(105, "temporary password shown to the initiator at acknowledgement", r.json().get("temporary_password") == "Temp@1234", r.json().get("temporary_password"))
detail = client.get(f"/api/uam/requests/{uc}", headers=ADM).json()
check(105, "password wiped after it was shown", "Temp@1234" not in str(detail) and not detail.get("has_temp_password"), detail.get("has_temp_password"))
acc = client.get("/api/users/EMP001/access", headers=ADM).json()
check("R2", "user view lists equipment where the user ID exists",
      any(a["equipment_code"] == code2 and a["status"] == "Active" and a["user_id"] == "yash.a" for a in acc), acc)
eu = client.get(f"/api/equipment/{code2}/users", headers=ADM).json()
check("R2", "equipment details lists its active users", any(u["employee_id"] == "EMP001" for u in eu), eu)
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
                                           "form_data": {"folder_path": r"\\fileserver\qc"},
                                           "training_completed": "NA", "training_remark": "n/a", **esign()}, headers=EMP)
fc = r.json().get("request_code")
check(73, "folder / project request template", r.status_code == 201, r.text[:200])
r = client.post(f"/api/uam/requests/{fc}/approve", json=esign(), headers=HOD)
check(73, "non-manufacturing request goes straight to execution", r.json().get("status") == "PENDING_EXECUTION", r.text[:200])

lst = client.get("/api/uam/requests", headers=HOD).json()
check(77, "reviewer list holds only requests waiting on them",
      all(x["status"] == "PENDING_REVIEW" or x["employee_id"] == "HOD001" for x in lst), [x["status"] for x in lst])
dash = client.get("/api/dashboard/summary", headers=EMP).json()
check("-", "dashboard lists recent requests", len(dash.get("recent_uam_requests", [])) >= 1)


# ---------- Round 4: new features (sheet rows 89-107) ----------
# 104 / 103: hostname + IP on equipment, auto-filled on requests
r = client.post("/api/equipment", json={**eq_body, "name": f"E2E Net {TAG}", "hostname": "hplc-01", "ip_address": "10.0.0.256",
                                        "validation_status": "under_validation"}, headers=ADM)
check(104, "invalid IP address refused", r.status_code == 422, r.status_code)
eq3 = client.post("/api/equipment", json={**eq_body, "name": f"E2E Net {TAG}", "hostname": "hplc-01", "ip_address": "10.0.0.25",
                                          "computer_system_id": f"CSN-{TAG}", "validation_status": "under_validation"}, headers=ADM).json()
code3 = eq3.get("equipment_code")
check(104, "equipment stores hostname and IP", eq3.get("hostname") == "hplc-01" and eq3.get("ip_address") == "10.0.0.25", eq3)
opt3 = next((o for o in client.get("/api/uam/requests/equipment-options", headers=EMP).json() if o["equipment_code"] == code3), {})
check(103, "request equipment options carry hostname / IP / CS ID",
      opt3.get("hostname") == "hplc-01" and opt3.get("ip_address") == "10.0.0.25" and opt3.get("computer_system_id") == f"CSN-{TAG}", opt3)

# 91: training acknowledgement
req3 = {**base, "asset_code": code3, "action": "CREATE"}
r = client.post("/api/uam/requests", json={**req3, "training_completed": None, **esign()}, headers=EMP)
check(91, "training answer is mandatory", r.status_code in (400, 422), r.status_code)
r = client.post("/api/uam/requests", json={**req3, "training_completed": "NA", "training_remark": "", **esign()}, headers=EMP)
check(91, "NA requires a remark", r.status_code == 400, r.status_code)
r = client.post("/api/attachments", files={"file": ("training.pdf", b"%PDF-1.4 test certificate", "application/pdf")},
                data={"purpose": "training"}, headers=EMP)
att = r.json()
check(91, "training certificate uploads", r.status_code == 201 and att.get("id"), r.text[:200])
r = client.post("/api/attachments", files={"file": ("x.exe", b"MZ", "application/x-msdownload")}, headers=EMP)
check(91, "unsupported attachment type refused", r.status_code == 415, r.status_code)
r = client.post("/api/uam/requests", json={**req3, "training_completed": "YES", "training_attachment_id": att.get("id"), **esign()}, headers=EMP)
r3 = r.json()
c3 = r3.get("request_code")
check(91, "YES with optional attachment accepted", r.status_code == 201 and r3.get("training_attachment_id") == att.get("id"), r.text[:200])
check(103, "request records hostname / IP / CS ID",
      r3.get("form_data", {}).get("hostname") == "hplc-01" and r3.get("form_data", {}).get("ip_address") == "10.0.0.25", r3.get("form_data"))
dl = client.get(f"/api/attachments/{att.get('id')}", headers=HOD)
check(91, "approver can open the training attachment", dl.status_code == 200 and dl.content.startswith(b"%PDF"), dl.status_code)

# 92: proxy user (initiator reassigns an absent approver)
r = client.post(f"/api/uam/requests/{c3}/reassign", json={"stage": "reviewer", "new_user_id": "HOD003", **esign()}, headers=HOD)
check(92, "only the initiator can reassign", r.status_code == 403, r.status_code)
r = client.post(f"/api/uam/requests/{c3}/reassign", json={"stage": "reviewer", "new_user_id": "QA001", **esign()}, headers=EMP)
check(92, "reassignment needs a user with the right role", r.status_code == 400, r.status_code)
r = client.post(f"/api/uam/requests/{c3}/reassign", json={"stage": "reviewer", "new_user_id": "HOD003", **esign(reason="HOD001 on leave")}, headers=EMP)
check(92, "initiator reassigns reviewer (e-signed)", r.status_code == 200 and r.json()["reviewer_id"] == "HOD003", r.text[:200])
HOD3 = token("HOD003")
r = client.post(f"/api/uam/requests/{c3}/approve", json=esign(), headers=HOD)
check(92, "previous reviewer can no longer act", r.status_code == 403, r.status_code)
r = client.post(f"/api/uam/requests/{c3}/approve", json=esign(), headers=HOD3)
check(92, "new reviewer can approve", r.status_code == 200, r.text[:200])
aud = client.get("/api/audit", params={"request_code": c3}, headers=ADM).json()
check(92, "reassignment in audit trail with old / new user",
      any(a["action"] == "UAM_REASSIGNED" and a["old_value"] == "HOD001" and a["new_value"] == "HOD003" for a in aud), aud[:2])

# 89 / 95 / 96: request for others, verbal password, temporary login
emp_users = client.get(f"/api/uam/requests/equipment-users/{code2}", headers=EMP).json()
check(95, "deactivation for others lists users holding an ID on the machine",
      any(u["employee_id"] == "EMP001" for u in emp_users), emp_users)
svc = f"SVC{TAG}"
other = {**base, "for_others": True, "beneficiary_employee_id": svc, "beneficiary_name": "Service Engineer",
         "beneficiary_email": "svc@vendor.com", "beneficiary_department": "Vendor"}
r = client.post("/api/uam/requests", json={**other, "action": "MODIFY", **esign()}, headers=EMP)
check(95, "non-create for others needs an existing ID", r.status_code == 400 and "does not exist" in r.text, r.text[:200])
r = client.post("/api/uam/requests", json={**other, "action": "CREATE", "temporary_login": True, "temporary_days": 20, **esign()}, headers=EMP)
check(96, "temporary login is 10 or 15 days", r.status_code == 400, r.status_code)
r = client.post("/api/uam/requests", json={**other, "action": "CREATE", "temporary_login": True, "temporary_days": 10, **esign()}, headers=EMP)
oc = r.json().get("request_code")
check(89, "request for others created", r.status_code == 201 and r.json().get("beneficiary_employee_id") == svc
      and r.json().get("for_others") is True, r.text[:200])
client.post(f"/api/uam/requests/{oc}/approve", json=esign(), headers=HOD)
client.post(f"/api/uam/requests/{oc}/approve", json=esign(), headers=QA)
r = client.post(f"/api/uam/requests/{oc}/execute", json=esign({"user_login_id": "svc.eng", "password": "Temp@1"}), headers=ADM)
check(95, "no temporary password for a new user requested by others (verbal)", r.status_code == 400, r.status_code)
r = client.post(f"/api/uam/requests/{oc}/execute", json=esign({"user_login_id": "svc.eng"}), headers=ADM)
check(95, "executed without password", r.status_code == 200, r.text[:200])
r = client.post(f"/api/uam/requests/{oc}/acknowledge", json={}, headers=EMP)
ack = r.json()
check(96, "temporary login expiry set at completion",
      ack.get("access_expires_on") == str(date.today() + timedelta(days=10)) and ack.get("temporary_password") is None, ack.get("access_expires_on"))
users3 = client.get(f"/api/uam/requests/equipment-users/{code2}", headers=EMP).json()
check(89, "beneficiary now holds an ID on the equipment", any(u["employee_id"] == svc for u in users3), users3)
if BASE is None:
    # Fast-forward the temporary login (local DB only)
    from app.database import SessionLocal
    from app.models import UAMRequest as _U
    with SessionLocal() as _db:
        _db.query(_U).filter(_U.request_code == oc).update({_U.access_expires_on: date.today() - timedelta(days=1)})
        _db.commit()
    jobs = client.post("/api/jobs/run").json()
    auto = jobs.get("auto_deactivation_requests", [])
    check(96, "deactivation request auto-generated when temporary login expires", len(auto) == 1, jobs)
    if auto:
        a = client.get(f"/api/uam/requests/{auto[0]}", headers=EMP).json()
        check(96, "auto request deactivates the same user on the same equipment",
              a.get("action") == "DEACTIVATE" and a.get("beneficiary_employee_id") == svc and a.get("asset_code") == code2, a)
    again = client.post("/api/jobs/run").json()
    check(96, "auto deactivation raised only once", again.get("auto_deactivation_requests") == [], again)

# 90: self-service bulk deactivation
r = client.post("/api/uam/requests/self-deactivate", json={"reason": "Leaving the department", "reviewer_id": "HOD001",
                                                           "it_executor_id": "ADM001", **esign()}, headers=EMP)
sd = r.json()
check(90, "user raises bulk deactivation for themselves", r.status_code == 200 and sd.get("count", 0) >= 1, r.text[:200])
if sd.get("created_requests"):
    x = client.get(f"/api/uam/requests/{sd['created_requests'][0]}", headers=EMP).json()
    check(90, "self deactivation targets the user's own ID", x.get("action") == "DEACTIVATE" and x.get("employee_id") == "EMP001"
          and not x.get("beneficiary_employee_id"), x)
r = client.post("/api/uam/requests/self-deactivate", json={"reason": "again", "reviewer_id": "HOD001", **esign()}, headers=EMP)
check(90, "no duplicate open deactivation requests", r.json().get("count") == 0, r.text[:200])

# 106 / 99 / 100: overdue completion, future dates, due reminders (PM uses code3 which has a CS ID)
r = client.put(f"/api/preventive-maintenance/{code3}/update-done",
               json={"last_pm_date": str(date.today() + timedelta(days=1)), "frequency_months": 1, "auth_password": PW}, headers=ADM)
check(99, "PM done date in the future refused", r.status_code == 400, r.status_code)
r = client.put(f"/api/preventive-maintenance/{code3}/update-done",
               json={"last_pm_date": str(date.today() - timedelta(days=400)), "frequency_months": 1, "auth_password": PW}, headers=ADM)
check(106, "old PM recorded (due date now in the past)", r.status_code == 200, r.text[:200])
r = client.put(f"/api/preventive-maintenance/{code3}/update-done",
               json={"last_pm_date": str(date.today()), "frequency_months": 1, "auth_password": PW}, headers=ADM)
check(106, "overdue PM cannot be completed without Breakdown/QMS + deviation", r.status_code == 422 and "overdue" in r.text, r.text[:200])
r = client.post("/api/attachments", files={"file": ("deviation.pdf", b"%PDF-1.4 deviation", "application/pdf")}, headers=ADM)
dev_att = r.json().get("id")
r = client.put(f"/api/preventive-maintenance/{code3}/update-done",
               json={"last_pm_date": str(date.today()), "frequency_months": 1, "auth_password": PW,
                     "breakdown_details": "QMS-2026-114: equipment breakdown", "deviation_no": "DEV-0042", "attachment_id": dev_att},
               headers=ADM)
check(106, "overdue PM completed with details", r.status_code == 200, r.text[:200])
ph = client.get(f"/api/preventive-maintenance/history/{code3}", headers=ADM).json()
check(106, "PM history keeps deviation details", ph and ph[0]["overdue"] and ph[0]["deviation_no"] == "DEV-0042"
      and ph[0]["attachment_id"] == dev_att, ph[:1])

# PM due in ~10 days -> reminder (15-day window)
eq5 = client.post("/api/equipment", json={**eq_body, "name": f"E2E PM soon {TAG}", "computer_system_id": f"CSP-{TAG}",
                                          "validation_status": "under_validation"}, headers=ADM).json()
code5 = eq5["equipment_code"]
done5 = date.today() - relativedelta(months=1) + timedelta(days=11)
client.put(f"/api/preventive-maintenance/{code5}/update-done",
           json={"last_pm_date": str(done5), "frequency_months": 1, "auth_password": PW}, headers=ADM)
# Periodic review first due from validation date (no review yet) -> reminder (90-day window)
pr_val = date.today() - relativedelta(months=12) + timedelta(days=31)
eq6 = client.post("/api/equipment", json={**eq_body, "name": f"E2E PR soon {TAG}", "validation_status": None,
                                          "validation_date": str(pr_val), "periodic_review_frequency": 12}, headers=ADM).json()
code6 = eq6["equipment_code"]
pr6 = next((x for x in client.get("/api/periodic-review", headers=ADM).json() if x["equipment_code"] == code6), {})
check(101, "first periodic review due from validation date (+12 months - 1 day)",
      pr6.get("next_review_date") == str(pr_val + relativedelta(months=12) - timedelta(days=1)), pr6.get("next_review_date"))
notes = client.get("/api/notifications", params={"limit": 200}, headers=ADM).json()
check(100, "PM reminder raised 15 days before due",
      any(n["type"] == "PM_DUE" and code5 in n["subject"] for n in notes), [n["subject"] for n in notes if n["type"] == "PM_DUE"][:3])
check(100, "periodic review reminder raised 90 days before due",
      any(n["type"] == "PERIODIC_REVIEW_DUE" and code6 in n["subject"] for n in notes),
      [n["subject"] for n in notes if n["type"] == "PERIODIC_REVIEW_DUE"][:3])

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
check(18, "audit dates in DD/MM/YYYY", any(a["field_name"] == "Created/Updated Date" and a["new_value"] == date.today().strftime("%d/%m/%Y") for a in audit))

failed = [r for r in results if not r[2]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
