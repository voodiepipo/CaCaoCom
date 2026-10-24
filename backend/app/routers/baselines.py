from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SatelliteBaseline
from app.schemas import BaselineCreate, BaselineOut
from app.services import geo

# Upload a reference baseline so 009.1 has something to compare against.
# Editing/adjusting baselines (011) comes in Sprint 3.
router = APIRouter(prefix="/baselines", tags=["baselines"])


@router.post("", response_model=BaselineOut, status_code=status.HTTP_201_CREATED)
def create_baseline(payload: BaselineCreate, db: Session = Depends(get_db)):
    geometry = payload.geometry.model_dump()
    try:
        geo.to_area_geometry(geometry)
    except (geo.InvalidGeometryError, ValueError, TypeError) as e:
        raise HTTPException(422, str(e)) from e

    baseline = SatelliteBaseline(
        region=payload.region, cutoff_date=payload.cutoff_date, geometry=geometry
    )
    db.add(baseline)
    db.commit()
    db.refresh(baseline)
    return baseline
