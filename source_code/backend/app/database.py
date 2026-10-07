from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import DATABASE_URL

# check_same_thread is SQLite-only; PostgreSQL needs sslmode=disable for Supabase pooler on Vercel
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif "pooler.supabase.com" in DATABASE_URL:
    connect_args = {"sslmode": "disable"}
else:
    connect_args = {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
