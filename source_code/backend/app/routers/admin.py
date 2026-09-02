from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.constants import ROLE_ADMIN
from app.database import get_db
from app.deps import require_role
from app.models import User
from app import seed

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/reset")
def reset_demo_data(db: Session = Depends(get_db), current_user: User = Depends(require_role(ROLE_ADMIN))):
    """Wipes every table and reloads the fixed seed dataset - for resetting the demo between walkthroughs."""
    seed.run_seed(db)
    return {"status": "ok", "message": "Demo data has been reset to its seeded state."}
