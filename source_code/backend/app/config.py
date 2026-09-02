import os
from dotenv import load_dotenv

load_dotenv()

if os.getenv("VERCEL"):
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////tmp/app.db")
else:
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

CORS_ORIGINS = ["*"] # Allow all origins for the MVP

IT_NOTIFICATION_EMAIL = os.getenv("IT_NOTIFICATION_EMAIL", "it.support@company.com")
