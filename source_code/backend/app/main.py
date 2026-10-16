from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGINS
from app.database import Base, SessionLocal, engine
from app.models import Equipment
from app.schema_compat import ensure_compatible_schema
from app.routers import admin, approvers, audit, dashboard, equipment, notifications, requests, users, auth, uam_requests
from app.routers import asset_requests, periodic_review, backup_schedule, preventive_maintenance, password_vault, meta
from app import seed

app = FastAPI(
    title="Pharmaceutical Equipment Access Management System",
    description="Production backend API with JWT Authentication.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return JSON (with CORS headers) instead of a bare 500, so the frontend
    shows a meaningful error rather than a generic 'Failed to fetch'."""
    import traceback
    traceback.print_exc()
    headers = {}
    origin = request.headers.get("origin")
    if origin and origin in CORS_ORIGINS:
        headers = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return JSONResponse(
        status_code=500,
        content={"detail": f"Server error: {type(exc).__name__}: {str(exc)[:300]}"},
        headers=headers,
    )

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(equipment.router)
app.include_router(approvers.router)
app.include_router(requests.router)
app.include_router(audit.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
app.include_router(uam_requests.router)
app.include_router(asset_requests.router)
app.include_router(periodic_review.router)
app.include_router(backup_schedule.router)
app.include_router(preventive_maintenance.router)
app.include_router(password_vault.router)
app.include_router(meta.router)


@app.on_event("startup")
def on_startup():
    try:
        # Apply SQLite-safe schema migrations for existing databases
        ensure_compatible_schema(engine)
        # Create any new tables
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            if db.query(Equipment).count() == 0:
                seed.run_seed(db)
        finally:
            db.close()
    except Exception as e:
        import traceback
        print(f"[STARTUP WARNING] DB init error (non-fatal): {e}")
        traceback.print_exc()


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
