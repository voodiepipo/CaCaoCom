# CaCaoCom

Initial backend scaffold for comparing a field agent's digitized plot with its stored baseline.

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

Polygon coordinates must be in the same planar coordinate system. The default match threshold is 90% of baseline area. This scaffold does not yet persist plots to PostgreSQL or handle image registration/offline synchronization.

## Checks

```bash
npm test
npm run typecheck
```
