from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Farmer
from app.schemas import FarmerCreate, FarmerOut

# Minimal endpoints so plots have a farmer to belong to. Full 001 lands in Sprint 4.
router = APIRouter(prefix="/farmers", tags=["farmers"])


@router.post("", response_model=FarmerOut, status_code=status.HTTP_201_CREATED)
def create_farmer(payload: FarmerCreate, db: Session = Depends(get_db)):
    farmer = Farmer(**payload.model_dump())
    db.add(farmer)
    db.commit()
    db.refresh(farmer)
    return farmer


@router.get("/{farmer_id}", response_model=FarmerOut)
def get_farmer(farmer_id: int, db: Session = Depends(get_db)):
    farmer = db.get(Farmer, farmer_id)
    if farmer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Farmer {farmer_id} not found")
    return farmer
