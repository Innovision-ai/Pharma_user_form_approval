"""Password policy for LOCAL accounts.

Applies to newly set / changed passwords only, so existing seeded users with
password123 keep working until they change their password.
"""
import json
import re
from datetime import datetime, timedelta
from typing import Optional

from app.auth import get_password_hash, verify_password

MIN_LENGTH = 8
EXPIRY_DAYS = 90
HISTORY_COUNT = 5
MAX_FAILED_ATTEMPTS = 3
IDLE_TIMEOUT_MINUTES = 15  # enforced in the frontend (auto log off)

POLICY_TEXT = (
    f"Minimum {MIN_LENGTH} characters with upper-case, lower-case, a number and a special "
    f"character; cannot reuse the last {HISTORY_COUNT} passwords; expires every {EXPIRY_DAYS} days; "
    f"account locks after {MAX_FAILED_ATTEMPTS} consecutive failed logins."
)


def validate_complexity(password: str) -> Optional[str]:
    """Return an error message, or None if the password is acceptable."""
    if len(password) < MIN_LENGTH:
        return f"Password must be at least {MIN_LENGTH} characters long."
    if not re.search(r"[A-Z]", password):
        return "Password must contain an upper-case letter."
    if not re.search(r"[a-z]", password):
        return "Password must contain a lower-case letter."
    if not re.search(r"\d", password):
        return "Password must contain a number."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain a special character."
    return None


def is_reused(user, new_password: str) -> bool:
    hashes = []
    if user.hashed_password:
        hashes.append(user.hashed_password)
    try:
        hashes.extend(json.loads(user.password_history or "[]"))
    except ValueError:
        pass
    return any(_safe_verify(new_password, h) for h in hashes[: HISTORY_COUNT + 1])


def _safe_verify(plain: str, hashed: str) -> bool:
    try:
        return verify_password(plain, hashed)
    except Exception:  # noqa: BLE001
        return False


def apply_new_password(user, new_password: str) -> None:
    """Set the password, rotate history, stamp the change time, reset lock counters."""
    try:
        history = json.loads(user.password_history or "[]")
    except ValueError:
        history = []
    if user.hashed_password:
        history.insert(0, user.hashed_password)
    user.password_history = json.dumps(history[:HISTORY_COUNT])
    user.hashed_password = get_password_hash(new_password)
    user.password_changed_at = datetime.utcnow()
    user.failed_attempts = 0
    user.locked = False


def is_expired(user) -> bool:
    if not user.password_changed_at:
        return False  # legacy/seeded accounts are not force-expired
    return datetime.utcnow() - user.password_changed_at > timedelta(days=EXPIRY_DAYS)
