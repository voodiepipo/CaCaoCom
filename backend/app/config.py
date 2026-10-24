from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Farmer Plot Verification API"
    database_url: str = "postgresql+psycopg://app:app@localhost:5432/plots"

    # 009.2: plots whose overlap with the satellite baseline is below this are Flagged.
    overlap_threshold_percent: float = Field(default=90.0, ge=0, le=100)

    # Reject absurd uploads early (e.g. GPS glitches producing huge polygons).
    max_plot_area_m2: float = 50_000_000  # 5,000 ha


@lru_cache
def get_settings() -> Settings:
    return Settings()
