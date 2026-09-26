import os
from dotenv import load_dotenv

load_dotenv()

if os.getenv("VERCEL"):
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////tmp/app.db")
else:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://frontend-six-rust-93.vercel.app",
]

IT_NOTIFICATION_EMAIL = os.getenv("IT_NOTIFICATION_EMAIL", "it.support@company.com")

