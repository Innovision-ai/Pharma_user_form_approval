"""Smoke test: every demo user can log in and every major endpoint answers 200.

Run against a local throw-away SQLite DB (default) or a deployed backend:

    python smoke_test.py                      # local, temp DB
    python smoke_test.py https://host         # deployed backend
"""
import os
import sys

BASE = sys.argv[1] if len(sys.argv) > 1 else None

if BASE is None:
    os.environ["DATABASE_URL"] = "sqlite:///./_smoke.db"
    from fastapi.testclient import TestClient
    from app.main import app
    _ctx = TestClient(app)
    _ctx.__enter__()
    client = _ctx
else:
    import httpx
    client = httpx.Client(base_url=BASE, timeout=60)

USERS = ["EMP001", "HOD001", "HOD003", "QA001", "ADM001", "IT001"]
READ_ENDPOINTS = [
    "/api/users/me", "/api/users", "/api/equipment", "/api/equipment/validation-alerts",
    "/api/approvers", "/api/requests", "/api/requests/mine", "/api/requests/approvals",
    "/api/requests/it-queue", "/api/audit", "/api/notifications", "/api/dashboard/summary",
    "/api/uam/requests", "/api/uam/requests/templates", "/api/asset-requests",
    "/api/asset-requests/selectors", "/api/periodic-review", "/api/periodic-review/due",
    "/api/backup-schedule", "/api/preventive-maintenance", "/api/vault",
    "/api/meta/departments", "/api/auth/password-policy",
]
# Endpoints that are role-restricted and may legitimately return 403 for some users.
ALLOW_403 = {"/api/requests", "/api/requests/approvals", "/api/requests/it-queue",
             "/api/periodic-review", "/api/periodic-review/due", "/api/backup-schedule",
             "/api/preventive-maintenance"}

failures = []


def login(user, password="password123", plant=None):
    data = {"username": user, "password": password}
    if plant:
        data["plant"] = plant
    return client.post("/api/auth/login", data=data)


for u in USERS:
    r = login(u)
    if r.status_code != 200:
        failures.append(f"login {u}: {r.status_code} {r.text[:120]}")
        continue
    h = {"Authorization": "Bearer " + r.json()["access_token"]}
    for ep in READ_ENDPOINTS:
        resp = client.get(ep, headers=h)
        ok = resp.status_code == 200 or (resp.status_code == 403 and ep in ALLOW_403)
        if not ok:
            failures.append(f"{u} GET {ep}: {resp.status_code} {resp.text[:120]}")

print("\n".join(failures) if failures else "SMOKE TEST PASSED")
if BASE is None:
    try:
        os.remove("_smoke.db")
    except OSError:
        pass
sys.exit(1 if failures else 0)
