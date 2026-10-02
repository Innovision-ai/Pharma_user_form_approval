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

# Vault encryption: a Fernet key. If not set, a fixed demo key is used (DO NOT use in production).
VAULT_ENCRYPTION_KEY = os.getenv(
    "VAULT_ENCRYPTION_KEY",
    "XvYIkMBZ7s8F3pQw9JzH2rLnA6Td5oGe1uCm4NqbWYk=",  # demo-only key
)

