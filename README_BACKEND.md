# Backend 2 (Nuttanun) — TypeScript

Backend tasks for Sprint 1 (009.1, 009.2) and Sprint 2 (007, 003.2, 013), built on the team's TypeScript project:
Voot's server and geometry (`src/api`, `src/geometry`) and Punnathorn's PostGIS schema (`db/schema.sql`, `src/db`).

Only new files were added. No existing file was changed.

| New file | Purpose |
|---|---|
| `src/backend/flagging.ts` | 90% rule and threshold config |
| `src/backend/satelliteCheck.ts` | Runs the check, updates the status, stores the overlap, writes the audit row |
| `src/backend/routes.ts` | HTTP routes; unknown routes go to Voot's handler |
| `src/backend/server.ts` | Entry point |
| `src/backend/syncRules.ts` + `SYNC_RULES.md` | Sprint 2 · 007 sync queue and conflict rules |
| `src/backend/documents.ts` + `src/backend/sql/003_2_document_verification.sql` | Sprint 2 · 003.2 document verification |
| `src/backend/areaTolerance.ts` | Sprint 2 · 013 area tolerance config |
| `test/backend/*.test.ts` | 78 tests (incl. `reviewFixes.test.ts`) |
| `.nvmrc` | Node 24 |

## Run

Requires **Node.js 24** (see `.nvmrc`). Install on macOS with `brew install node@24` or `nvm install 24 && nvm use`.

```bash
npm install
psql farmer_registry -f db/schema.sql -f db/sample_data.sql   # first time only
psql farmer_registry -f src/backend/sql/003_2_document_verification.sql   # Sprint 2 tables (safe to re-run)
node --experimental-strip-types src/backend/server.ts          # http://localhost:3000
```

This server includes Voot's routes (`/health`, `/api/plots/compare`), so only one server is needed.

| Env | Default | |
|---|---|---|
| `DATABASE_URL` | `postgresql://localhost:5432/farmer_registry` | PostgreSQL with PostGIS |
| `OVERLAP_THRESHOLD_PERCENT` | `90` | 0–100. An invalid value stops the server at startup |
| `AREA_TOLERANCE_PCT` | `10` | 0–100. Area mismatch tolerance (013). **Default 10 is an assumption — PO to confirm.** Same variable as Punnathorn's `landSizeMismatch.ts`, so one setting drives both |
| `PORT` | `3000` | |

## Test

```bash
npm test                                  # without database: DB tests are skipped
RUN_DB_TESTS=1 npm test                   # with PostgreSQL + PostGIS (use a test database)
npx tsc --noEmit                          # type check
```

Result on the latest `main` (6861d0e) with PostgreSQL 16 + PostGIS on **Node 24.22**: **102 passed** (78 Nuttanun + 24 team), type check clean. Full output: `TEST_REPORT.txt`.

### Sprint 1 test cases

| Acceptance criterion | Test cases |
|---|---|
| Overlap % is calculated correctly (009.1) | inside = 100%; half outside ≈ 50%; edge touch = 0%; divided by plot area, not baseline area; multi-part baseline adds up; forest hole is not counted; newest baseline is used |
| Overlap is available through an API (009.1) | GET overlap after a check; never-checked plot; shows the threshold actually used; 404 unknown plot; 400 bad id; 405 wrong method |
| Below 90% = Flagged, 90% and above = Clean (009.2) | 0, 89.9, 89.99, 89.996, 90, 90.1, 100; no baseline = pending |
| Threshold is configurable (009.2) | default 90; env value; 0 and 100; invalid values rejected; new threshold changes new checks; settings endpoint; 500 on bad config |
| Status updates automatically (009.2) | Clean -> Flagged; Flagged -> Clean after a newer baseline; same result twice; reviewer status (Cleared) not overwritten |
| Flag reason and audit entry are saved (009.2) | reason text; audit row with old/new status, threshold, agent; agent defaults to SYSTEM; audit rows cannot be edited or deleted |
| Works with the existing server | Voot's /health and /api/plots/compare still work; 400 on bad JSON / agentId before touching the database |

### Sprint 2 test cases

| Task | Test cases |
|---|---|
| 007 Design sync queue and conflict resolution rules | create → insert; create retry → duplicate; create clash → conflict; update before create → reject; delete → reject; reviewer-locked plot → reject; Clean/Flagged/Mismatch not locked; update retry → duplicate; same version → apply; other field changed → apply mine; same field changed → conflict, nothing saved (all-or-nothing); same field same value → apply the rest; GeoJSON compared by value; input validation (8 cases); batch limit 50 |
| 003.2 Update verification status and test workflow | Pending → Approved; Pending → Rejected needs a reason; Approved/Rejected are final; second decision refused (409) and nothing changes; reviewer, time and reason saved; one audit row per decision; audit cannot be edited or deleted; database rules for reason and reviewer; reject then new upload approved; 404 unknown plot/document; 400 bad input before touching the database |
| 013 Define tolerance configuration for area variance | default 10%; env value; invalid values rejected; bigger and smaller areas; exactly at tolerance = OK; just above = Mismatch; decimal areas without floating point errors (2.2 vs 2.0 = exactly 10%); configurable; invalid areas rejected; settings endpoint |

### Review fixes (Sprint 2 Day 5)

| Fix | Test case |
|---|---|
| R1 shown % never rounds across the threshold | `reviewFixes.test.ts` R1 (3 tests) |
| R2 overlap view reason comes from the latest check | R2 |
| R3 unexpected internal errors return 500 without the message (bad JSON is still 400) | R3 |
| R4 zero-area plot boundary is not checked | R4 |

## Endpoints

| Method | Path | Story | Returns |
|---|---|---|---|
| GET | `/api/settings/flagging` | 009.2 | `{ thresholdPercent, rule }` |
| POST | `/api/plots/:plotId/check` | 009.1, 009.2 | Runs the check. Optional body `{ "agentId": "AG01" }` |
| GET | `/api/plots/:plotId/overlap` | 009.1 | `{ status, overlapPercent, thresholdPercent, baselineId, reason, checkedAt }` |

| GET | `/api/settings/area-tolerance` | 013 | `{ tolerancePercent, rule }` |
| POST | `/api/plots/:plotId/documents` | 003.2 | Body `{ "fileUrl": "https://..." }`. Creates a Pending document (minimal until story 004) |
| GET | `/api/plots/:plotId/documents` | 003.2 | Documents of a plot |
| GET | `/api/documents/:id` | 003.2 | One document |
| POST | `/api/documents/:id/verify` | 003.2 | Body `{ "decision": "Approve" \| "Reject", "reviewerId": "REV01", "reason": "..." }`. Reason required for Reject |

Errors: 400 bad id/body, 404 plot or document not found, 405 wrong method, 409 document already decided, 500 server error.

## Rules (agreed by PO)

- **Overlap % = area(plot ∩ baseline) ÷ area(plot) × 100**, computed by PostGIS on the WGS84 ellipsoid.
- **Baseline = land that was not forest at the 2020 cutoff.** A plot inside it is Clean.
- Below the threshold → `Flagged`, at or above → `Clean`. The exact value is compared, so 89.996% is Flagged. It is rounded to 2 decimals only when stored and shown: a Flagged value is rounded down (89.996% → 89.99%), a Clean value normally, so the shown % never contradicts the status.
- No baseline for the plot's region → nothing changes and no audit row; the response says why.
- A plot boundary with zero area is not checked: nothing is saved and the response asks for the GPS boundary again.
- A status set by a person or another rule (`Under Review`, `Cleared`, `Mismatch`) is not overwritten. The overlap result and an audit row (status unchanged, reason "Status kept…") are still stored, so the overlap view always explains the latest check.
- Each check writes one append-only audit row through `recordFlagAudit` (Punnathorn's function).
- The overlap endpoint returns the threshold that was **used** for that result (from the audit log), not the current config.

## Definition of Done — Nuttanun's tasks

| Task | Where | Tests |
|---|---|---|
| Expose overlap percentage via API endpoint | `GET /api/plots/:plotId/overlap` | `routes.test.ts`, `satelliteCheck.test.ts` |
| Define flagging rule and 90% threshold config | `flagging.ts`, `GET /api/settings/flagging` | `flagging.test.ts` |
| Implement automatic status update to Flagged | `runSatelliteCheck()` | `satelliteCheck.test.ts` |
| **Sprint 2** · Design sync queue and conflict resolution rules (007) | `syncRules.ts`, `SYNC_RULES.md` | `syncRules.test.ts` |
| **Sprint 2** · Update verification status and test workflow (003.2) | `documents.ts`, `POST /api/documents/:id/verify`, SQL file | `documents.test.ts`, `routes.test.ts` |
| **Sprint 2** · Define tolerance configuration for area variance (013) | `areaTolerance.ts`, `GET /api/settings/area-tolerance` | `areaTolerance.test.ts`, `routes.test.ts` |

Still needed from the team: code review, push to GitHub, PO acceptance.

## Open items for the team

1. **Sample baseline is forest, not non-forest (Punnathorn).** `db/sample_data.sql` loads JRC forest polygons as the baseline, so P001 (inside the forest) comes out Clean. The baseline should be the region minus the 2020 forest, for example `ST_Difference(<region box>, <forest>)`.
2. **Voot's `/api/plots/compare` divides by baseline area and uses flat coordinates.** It still works, but it gives a different number from `/check` for lon/lat plots. Agree with Voot whether to keep it.
3. **No "pending" status in the schema.** A new plot starts as `Clean` before it is checked. Consider adding `Pending Check` to `plot_status`.
4. **The Python `backend/` folder can be removed** once the team switches to this server.
5. **Area tolerance default (10%) needs PO confirmation** before 013 is accepted.
6. **Sync endpoint (`POST /api/sync`) is Vootichote's task.** It should call `validateChange()` and `resolveSync()` for each item (see `SYNC_RULES.md`).
7. **Document upload is minimal** (a file URL). Real upload comes with story 004 in Sprint 4.
