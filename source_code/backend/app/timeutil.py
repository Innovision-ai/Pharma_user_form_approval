"""The business day used for dates (done dates, due dates, expiries).

Servers run in UTC, but the plants work in India time: without this, a date
entered as "today" between 00:00 and 05:30 IST would be rejected as a future
date. The offset is configurable for other regions (APP_UTC_OFFSET_MINUTES).
"""
import os
from datetime import date, datetime, timedelta

UTC_OFFSET = timedelta(minutes=int(os.getenv("APP_UTC_OFFSET_MINUTES", "330")))  # IST = UTC+5:30


def local_now() -> datetime:
    """Current wall-clock time at the plant (naive)."""
    return datetime.utcnow() + UTC_OFFSET


def local_today() -> date:
    return local_now().date()
