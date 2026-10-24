from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Farmer, Plot, PlotStatus, SatelliteBaseline, utcnow
from app.schemas import PlotCreate
from app.services import flagging, geo


class NotFoundError(LookupError):
    pass


def get_active_baseline(db: Session, region: str) -> SatelliteBaseline | None:
    return db.scalars(
        select(SatelliteBaseline)
        .where(SatelliteBaseline.region == region, SatelliteBaseline.is_active.is_(True))
        .order_by(SatelliteBaseline.cutoff_date.desc(), SatelliteBaseline.id.desc())
        .limit(1)
    ).first()


def run_satellite_check(db: Session, plot: Plot) -> Plot:
    """009.1 + 009.2: compute overlap with the region's active baseline and set the status."""
    baseline = get_active_baseline(db, plot.region)
    if baseline is None:
        plot.status = PlotStatus.PENDING_CHECK
        plot.overlap_percent = None
        plot.checked_baseline_id = None
        plot.checked_at = None
        return plot

    percent = geo.overlap_percent(
        geo.to_polygon(plot.boundary), geo.to_area_geometry(baseline.geometry)
    )
    plot.overlap_percent = percent
    plot.status = flagging.decide_status(percent)
    plot.checked_baseline_id = baseline.id
    plot.checked_at = utcnow()
    return plot


def create_plot(db: Session, data: PlotCreate) -> tuple[Plot, bool]:
    """Returns (plot, created). Re-sending the same client_id returns the existing plot."""
    client_id = str(data.client_id)
    existing = db.scalars(select(Plot).where(Plot.client_id == client_id)).first()
    if existing:
        return existing, False

    if db.get(Farmer, data.farmer_id) is None:
        raise NotFoundError(f"Farmer {data.farmer_id} not found")

    boundary = data.boundary.model_dump()
    polygon = geo.to_polygon(boundary)
    area = geo.area_m2(polygon)
    if area > get_settings().max_plot_area_m2:
        raise geo.InvalidGeometryError(f"Plot area {area:,.0f} m² exceeds the allowed maximum")

    plot = Plot(
        client_id=client_id,
        farmer_id=data.farmer_id,
        region=data.region,
        boundary=boundary,
        area_m2=round(area, 2),
        captured_by_agent_id=data.captured_by_agent_id,
        captured_at=data.captured_at,
    )
    run_satellite_check(db, plot)
    db.add(plot)
    try:
        db.commit()
    except IntegrityError:
        # Two uploads of the same client_id raced; the other one won.
        db.rollback()
        return db.scalars(select(Plot).where(Plot.client_id == client_id)).one(), False
    db.refresh(plot)
    return plot, True


def recheck_plot(db: Session, plot_id: int) -> Plot:
    plot = db.get(Plot, plot_id)
    if plot is None:
        raise NotFoundError(f"Plot {plot_id} not found")
    run_satellite_check(db, plot)
    db.commit()
    db.refresh(plot)
    return plot
