import enum
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PlotStatus(str, enum.Enum):
    PENDING_CHECK = "PENDING_CHECK"  # no active baseline for the region yet
    CLEAN = "CLEAN"
    FLAGGED = "FLAGGED"


class Farmer(Base):
    __tablename__ = "farmers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(30))
    region: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    plots: Mapped[list["Plot"]] = relationship(back_populates="farmer")


class SatelliteBaseline(Base):
    """Reference area (e.g. land that was non-forest at the cutoff date) for a region."""

    __tablename__ = "satellite_baselines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region: Mapped[str] = mapped_column(String(100), index=True)
    cutoff_date: Mapped[date] = mapped_column(Date)
    # GeoJSON Polygon or MultiPolygon, WGS84 (lon, lat).
    geometry: Mapped[dict] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Plot(Base):
    __tablename__ = "plots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # UUID generated on the device; makes offline re-uploads (007) idempotent.
    client_id: Mapped[str] = mapped_column(String(36), unique=True)
    farmer_id: Mapped[int] = mapped_column(ForeignKey("farmers.id"), index=True)
    region: Mapped[str] = mapped_column(String(100), index=True)
    # GeoJSON Polygon, WGS84 (lon, lat). Geometry math is done in Python (Shapely).
    boundary: Mapped[dict] = mapped_column(JSON)
    area_m2: Mapped[float] = mapped_column(Float)

    status: Mapped[PlotStatus] = mapped_column(
        Enum(PlotStatus, native_enum=False, length=20), default=PlotStatus.PENDING_CHECK, index=True
    )
    overlap_percent: Mapped[float | None] = mapped_column(Float)
    checked_baseline_id: Mapped[int | None] = mapped_column(ForeignKey("satellite_baselines.id"))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    captured_by_agent_id: Mapped[str] = mapped_column(String(64))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    farmer: Mapped[Farmer] = relationship(back_populates="plots")
