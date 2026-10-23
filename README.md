# CaCaoCom

Initial backend scaffold for comparing a field agent's digitized plot with its stored baseline, with a PostgreSQL/PostGIS database for baselines, plots and an append-only flag audit log.

## Run

Requires Node.js 24 or newer.

```bash
npm install
npm run dev
```

The API listens on `http://localhost:3000` by default. Set `PORT` to change it.

## Endpoints

- `GET /health` returns `{ "status": "ok" }`.
- `POST /api/plots/compare` calculates overlap and returns `matched` or `flagged`.

Example request:

```json
{
  "newPlot": [[0, 0], [9, 0], [9, 10], [0, 10]],
  "baseline": [[0, 0], [10, 0], [10, 10], [0, 10]],
  "minimumBaselineOverlap": 0.9
}
```

Polygon coordinates must be in the same planar coordinate system. The default match threshold is 90% of baseline area.

## Database (PostgreSQL + PostGIS)

Stories: 009.1 (satellite baseline data source and schema) and 009.2 (persist flag reason and audit entry).

### Requirements

- PostgreSQL 16 or newer with the PostGIS extension (for example Postgres.app, or `brew install postgresql@17 postgis`).

### Setup

```bash
createdb farmer_registry
psql farmer_registry -f db/schema.sql
psql farmer_registry -f db/sample_data.sql
```

Set the connection with `DATABASE_URL` (see `.env.example`). The default is `postgresql://localhost:5432/farmer_registry`. Do not commit `.env`.

### Satellite baseline data source

- Source: JRC Global Forest Cover 2020 (EU Joint Research Centre), a global forest/non-forest map.
- Why: its 2020 date matches the EU deforestation regulation cutoff (31 Dec 2020), and it covers our West Africa farms.
- Planned format: the raster (GeoTIFF) is clipped to the study area, converted to forest polygons (for example with QGIS Polygonize), and stored as geometry in EPSG:4326.
- Current data: a SAMPLE baseline polygon for development. Loading a real JRC tile is planned for a later sprint.

### Tables

- `satellite_source`: name, provider and cutoff date of each baseline dataset.
- `satellite_baseline`: baseline forest area (geometry, EPSG:4326) by region and date.
- `plots`: field plots with a boundary polygon and a status (`Clean`, `Flagged`, `Under Review`, `Cleared`, `Mismatch`).
- `plot_overlap_result`: stored overlap percentage per plot and baseline.
- `flag_audit`: append-only history of status changes with reason, overlap %, threshold, old and new status, agent ID and timestamp. Updates, deletes and truncates are blocked by triggers.

### Flag audit

`record_flag_audit(...)` saves one audit row. From TypeScript, use `recordFlagAudit` in `src/db/flagAudit.ts`. `auditInputFromComparison` turns a geometry result into an audit entry (`matched` is stored as `Clean`, `flagged` as `Flagged`).

### Known limitations

- The database holds sample data only.
- The geometry code expects planar coordinates, while the baseline is stored in lon/lat (EPSG:4326). The coordinate handling is still to be agreed.
- How a plot finds its baseline (for example a `baseline_id` on `plots`) is not decided yet.
- Calling the audit function from the compare endpoint, image registration and offline synchronization are not implemented yet.

## Checks

```bash
npm test
npm run typecheck
```

Database tests are skipped unless PostgreSQL is running with the schema and sample data loaded:

```bash
RUN_DB_TESTS=1 node --experimental-strip-types --test test/db/flagAudit.test.ts
```