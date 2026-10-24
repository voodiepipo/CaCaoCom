"""009.2 flagging rule (owner: Backend 2).

Rule: overlap < threshold  -> FLAGGED
      overlap >= threshold -> CLEAN
      no baseline (None)   -> PENDING_CHECK
"""

from app.config import get_settings
from app.models import PlotStatus


def current_threshold() -> float:
    return get_settings().overlap_threshold_percent


def decide_status(overlap_percent: float | None, threshold: float | None = None) -> PlotStatus:
    if overlap_percent is None:
        return PlotStatus.PENDING_CHECK
    if threshold is None:
        threshold = current_threshold()
    return PlotStatus.FLAGGED if overlap_percent < threshold else PlotStatus.CLEAN
