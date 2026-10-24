from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.models import PlotStatus

Position = list[float]  # [lon, lat] or [lon, lat, alt]


class PolygonGeoJSON(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[Position]] = Field(min_length=1)


class AreaGeoJSON(BaseModel):
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list


# ---------- Farmers ----------
class FarmerCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    region: str = Field(min_length=1, max_length=100)


class FarmerOut(FarmerCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ---------- Baselines ----------
class BaselineCreate(BaseModel):
    region: str = Field(min_length=1, max_length=100)
    cutoff_date: date
    geometry: AreaGeoJSON


class BaselineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    region: str
    cutoff_date: date
    is_active: bool
    created_at: datetime


# ---------- Plots ----------
class PlotCreate(BaseModel):
    client_id: UUID = Field(description="UUID generated on the device; resending it is a no-op")
    farmer_id: int
    region: str = Field(min_length=1, max_length=100)
    boundary: PolygonGeoJSON
    captured_by_agent_id: str = Field(min_length=1, max_length=64)
    captured_at: AwareDatetime = Field(description="Must include a timezone; stored as UTC")

    @field_validator("captured_at")
    @classmethod
    def _to_utc(cls, v: datetime) -> datetime:
        # Normalise to UTC so stored timestamps are consistent.
        return v.astimezone(timezone.utc)


class OverlapOut(BaseModel):
    """009.1 result exposed on its own endpoint (owner: Backend 2)."""

    plot_id: int
    overlap_percent: float | None
    threshold_percent: float
    status: PlotStatus
    baseline_id: int | None
    checked_at: datetime | None


class FlaggingConfigOut(BaseModel):
    threshold_percent: float
    rule: str


class PlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: str
    farmer_id: int
    region: str
    boundary: dict
    area_m2: float
    status: PlotStatus
    overlap_percent: float | None
    checked_baseline_id: int | None
    checked_at: datetime | None
    captured_by_agent_id: str
    captured_at: datetime
    created_at: datetime
