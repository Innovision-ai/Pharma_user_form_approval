import os
import re

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

# check_same_thread is SQLite-only; PostgreSQL needs sslmode=disable for Supabase pooler on Vercel
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif "pooler.supabase.com" in DATABASE_URL:
    connect_args = {"sslmode": os.getenv("DB_SSLMODE", "disable")}
else:
    connect_args = {}

# Optional: keep this deployment's tables in their own PostgreSQL schema (e.g. a
# preview environment sharing the database server with production).
DB_SCHEMA = os.getenv("DB_SCHEMA")
if DB_SCHEMA and not DATABASE_URL.startswith("sqlite"):
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", DB_SCHEMA):
        raise RuntimeError("DB_SCHEMA must be a simple lower-case identifier")
    connect_args["options"] = f"-c search_path={DB_SCHEMA}"
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
