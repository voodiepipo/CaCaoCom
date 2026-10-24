from fastapi import APIRouter

from app.schemas import FlaggingConfigOut
from app.services import flagging

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/flagging", response_model=FlaggingConfigOut)
def get_flagging_config():
    """009.2: current threshold. Change it with the OVERLAP_THRESHOLD_PERCENT env var."""
    t = flagging.current_threshold()
    return FlaggingConfigOut(
        threshold_percent=t,
        rule=f"overlap < {t:g}% → FLAGGED; overlap ≥ {t:g}% → CLEAN; no baseline → PENDING_CHECK",
    )
