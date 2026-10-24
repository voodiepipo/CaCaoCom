from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Plot, PlotStatus
from app.schemas import OverlapOut, PlotCreate, PlotOut
from app.services import flagging, plot_service
from app.services.geo import InvalidGeometryError

router = APIRouter(prefix="/plots", tags=["plots"])


@router.post("", response_model=PlotOut, status_code=status.HTTP_201_CREATED)
def create_plot(payload: PlotCreate, response: Response, db: Session = Depends(get_db)):
    """005: upload a captured boundary. Runs the satellite check (009.1/009.2) immediately."""
    try:
        plot, created = plot_service.create_plot(db, payload)
    except plot_service.NotFoundError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
    except InvalidGeometryError as e:
        raise HTTPException(422, str(e)) from e
    if not created:
        response.status_code = status.HTTP_200_OK
    return plot


@router.get("", response_model=list[PlotOut])
def list_plots(
    status_filter: PlotStatus | None = Query(default=None, alias="status"),
    region: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Plot).order_by(Plot.id.desc()).limit(limit).offset(offset)
    if status_filter:
        stmt = stmt.where(Plot.status == status_filter)
    if region:
        stmt = stmt.where(Plot.region == region)
    return db.scalars(stmt).all()


@router.get("/{plot_id}", response_model=PlotOut)
def get_plot(plot_id: int, db: Session = Depends(get_db)):
    plot = db.get(Plot, plot_id)
    if plot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Plot {plot_id} not found")
    return plot


@router.get("/{plot_id}/overlap", response_model=OverlapOut)
def get_overlap(plot_id: int, db: Session = Depends(get_db)):
    """009.1: overlap % of a plot with the satellite baseline, plus the flag decision."""
    plot = db.get(Plot, plot_id)
    if plot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Plot {plot_id} not found")
    return OverlapOut(
        plot_id=plot.id,
        overlap_percent=plot.overlap_percent,
        threshold_percent=flagging.current_threshold(),
        status=plot.status,
        baseline_id=plot.checked_baseline_id,
        checked_at=plot.checked_at,
    )


@router.post("/{plot_id}/check", response_model=PlotOut)
def recheck_plot(plot_id: int, db: Session = Depends(get_db)):
    """Re-run 009.1/009.2, e.g. after a baseline is added for the region."""
    try:
        return plot_service.recheck_plot(db, plot_id)
    except plot_service.NotFoundError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e)) from e
