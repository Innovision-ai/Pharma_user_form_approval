from typing import Optional

from fastapi import APIRouter

from app.constants import DEPARTMENTS_BY_PLANT, ROLE_LABELS

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/departments")
def departments(plant: Optional[str] = None):
    """Department list per plant (placeholder data until the client supplies theirs)."""
    all_depts = sorted({d for lst in DEPARTMENTS_BY_PLANT.values() for d in lst})
    return {
        "plants": DEPARTMENTS_BY_PLANT,
        "departments": DEPARTMENTS_BY_PLANT.get(plant, all_depts) if plant else all_depts,
    }


@router.get("/roles")
def roles():
    return {"labels": ROLE_LABELS}
