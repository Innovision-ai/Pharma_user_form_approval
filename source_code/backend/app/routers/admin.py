from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.constants import ROLE_ADMIN
from app.database import get_db
from app.deps import require_role
from app.models import AuditLog, User
from app import seed

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/reset")
def reset_demo_data(db: Session = Depends(get_db), current_user: User = Depends(require_role(ROLE_ADMIN))):
    """Wipes every table and reloads the fixed seed dataset - for resetting the demo between walkthroughs."""
    seed.run_seed(db)
    log = AuditLog(
        user_employee_id=current_user.employee_id,
        user_name=current_user.name,
        action="DEMO_DATA_RESET",
        description=f"Demo data reset by {current_user.name}",
    )
    db.add(log)
    db.commit()
    return {"status": "ok", "message": "Demo data has been reset to its seeded state."}
