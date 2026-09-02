from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.database import Base, SessionLocal, engine
from app.models import Equipment
from app.routers import admin, approvers, audit, dashboard, equipment, notifications, requests, users
from app import seed

app = FastAPI(
    title="Pharmaceutical Equipment Access Management System",
    description="MVP backend API - demo-only auth via X-Demo-User header, no real credentials.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(equipment.router)
app.include_router(approvers.router)
app.include_router(requests.router)
app.include_router(audit.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(dashboard.router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(Equipment).count() == 0:
            seed.run_seed(db)
    finally:
        db.close()


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
