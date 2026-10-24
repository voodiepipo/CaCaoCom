# Farmer Plot Verification — Backend (Sprint 1)

FastAPI + PostgreSQL 16 + Shapely. Covers stories **005** (upload GPS boundary), **009.1** (overlap with satellite baseline) and **009.2** (flag if overlap < 90%).

## Run

```bash
docker compose up --build
```

- API: http://localhost:8000
- Swagger docs: http://localhost:8000/docs

## Run tests (no PostgreSQL needed — uses SQLite)

```bash
pip install -r requirements.txt
pytest -q
```

## Endpoints

| Method | Path | Story | Purpose |
|---|---|---|---|
| POST | `/api/v1/farmers` | (001 minimal) | Create farmer so plots have an owner |
| GET | `/api/v1/farmers/{id}` | | |
| POST | `/api/v1/baselines` | (011 minimal) | Upload satellite reference area for a region |
| POST | `/api/v1/plots` | 005, 009.1, 009.2 | Upload boundary; runs check immediately |
| GET | `/api/v1/plots?status=&region=` | | List / filter plots |
| GET | `/api/v1/plots/{id}` | | |
| POST | `/api/v1/plots/{id}/check` | 009.1, 009.2 | Re-run check (e.g. after new baseline) |
| GET | `/api/v1/plots/{id}/overlap` | 009.1 | Overlap %, threshold, status, baseline used |
| GET | `/api/v1/settings/flagging` | 009.2 | Current threshold and rule |

## Backend 2 (Nuttanun) — Sprint 1 tasks

| Task | Where |
|---|---|
| Expose overlap percentage via API endpoint | `GET /plots/{id}/overlap` in `app/routers/plots.py` |
| Define flagging rule and 90% threshold config | `app/services/flagging.py`, `OVERLAP_THRESHOLD_PERCENT` in `app/config.py`, `GET /settings/flagging` |
| Implement automatic status update to Flagged | `run_satellite_check()` in `app/services/plot_service.py` (runs on every upload) |
| Tests | `tests/test_nuttanun_backend2.py` |

### Example: upload a plot

```json
POST /api/v1/plots
{
  "client_id": "6f1c2a0e-6c0b-4c1e-9a43-2b0f6a1d9e11",
  "farmer_id": 1,
  "region": "north",
  "boundary": {
    "type": "Polygon",
    "coordinates": [[[100.5, 13.7], [100.501, 13.7], [100.501, 13.701], [100.5, 13.701], [100.5, 13.7]]]
  },
  "captured_by_agent_id": "agent-01",
  "captured_at": "2026-10-15T08:00:00+07:00"
}
```

Coordinates are **[longitude, latitude]** (GeoJSON order), WGS84.

## Design decisions

- **Plot status**: `PENDING_CHECK` (no baseline for the region) → `CLEAN` or `FLAGGED`.
- **Overlap %** = geodesic area(plot ∩ baseline) ÷ geodesic area(plot) × 100. Computed in Python (Shapely + pyproj), not SQL, so results don't depend on database spatial support.
- **Threshold** is configurable via `OVERLAP_THRESHOLD_PERCENT` (default 90). Exactly 90% counts as `CLEAN`.
- **Baseline used**: latest active baseline (by `cutoff_date`) for the plot's region.
- **Idempotent upload**: the mobile app generates `client_id` (UUID) offline. Re-sending the same `client_id` returns the existing plot (200) instead of creating a duplicate — this is what makes auto-sync (007) safe to retry.
- **Geometry storage**: GeoJSON in a JSON column. Add a PostGIS `geometry(Polygon, 4326)` column + spatial index later only if you need spatial queries in SQL (e.g. "plots near X").
- **Validation**: rejects non-polygons, < 3 points, unclosed rings, self-intersections, out-of-range coordinates and plots > 5,000 ha.

## Not yet done (later sprints)

- Auth / roles (JWT) — Sprint 2
- Alembic migrations (tables are created on startup for now)
- Audit log with agent ID + immutable timestamp (006)
