"""Yearly request numbering, e.g. 26-000001 (counter resets every year)."""
from datetime import datetime

from sqlalchemy.orm import Session


def next_year_code(db: Session, model, code_attr: str = "request_code", prefix: str = "") -> str:
    """Return the next code of the form ``{prefix}{yy}-{seq:06d}``.

    The sequence is the highest existing sequence *for the current year* + 1,
    so legacy codes (e.g. UAM-0001) never interfere and numbering restarts
    every January.
    """
    yy = datetime.utcnow().strftime("%y")
    stem = f"{prefix}{yy}-"
    col = getattr(model, code_attr)
    existing = [c for (c,) in db.query(col).filter(col.like(f"{stem}%")).all()]
    max_seq = 0
    for code in existing:
        try:
            max_seq = max(max_seq, int(code[len(stem):]))
        except ValueError:
            continue
    return f"{stem}{max_seq + 1:06d}"
