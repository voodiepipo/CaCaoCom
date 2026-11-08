/**
 * 009.1 + 009.2 backend (owner: Nuttanun, Backend 2).
 *
 * - runSatelliteCheck: automatic status update to Flagged / Clean
 * - getOverlap:        overlap percentage for the API endpoint
 *
 * Uses the team schema in db/schema.sql (Punnathorn) and the audit helper in
 * src/db/flagAudit.ts. Areas are computed by PostGIS on the WGS84 ellipsoid
 * (geography), because plot boundaries are stored in longitude/latitude.
 *
 * Overlap % = area(plot ∩ baseline) / area(plot) × 100
 * Baseline  = land that was NOT forest at the 2020 cutoff, so a plot inside it is Clean.
 */

import type pg from "pg";
import { recordFlagAudit, type PlotStatus } from "../db/flagAudit.ts";
import { currentThreshold, decideStatus, displayPercent, flagReason } from "./flagging.ts";

export class PlotNotFoundError extends Error {
  constructor(plotId: string) {
    super(`Plot ${plotId} not found`);
    this.name = "PlotNotFoundError";
  }
}

/** Statuses that come from the automatic check. Any other status was set by a person or another rule. */
const AUTO_STATUSES: ReadonlySet<PlotStatus> = new Set(["Clean", "Flagged"]);

export interface CheckResult {
  plotId: string;
  checked: boolean;            // false when there is no baseline for the region
  status: PlotStatus;
  previousStatus: PlotStatus;
  statusChanged: boolean;
  overlapPercent: number | null;
  thresholdPercent: number;
  baselineId: number | null;
  reason: string;
  auditId: number | null;
}

export interface OverlapView {
  plotId: string;
  status: PlotStatus;
  checked: boolean;
  overlapPercent: number | null;
  /** Threshold used for this result (from the audit log), so it matches the status even if the config changed later. */
  thresholdPercent: number;
  baselineId: number | null;
  reason: string | null;
  checkedAt: string | null;
}

const toNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

/**
 * Runs the satellite check for one plot. Call inside a transaction (see withTransaction),
 * because it updates the plot, stores the overlap result and writes an audit row together.
 */
export async function runSatelliteCheck(
  client: pg.PoolClient,
  plotId: string,
  agentId = "SYSTEM",
  thresholdPercent = currentThreshold(),
): Promise<CheckResult> {
  // Lock the plot so two checks on the same plot cannot interleave.
  const plotRes = await client.query(
    "SELECT plot_id, region_code, status FROM plots WHERE plot_id = $1 FOR UPDATE",
    [plotId],
  );
  if (plotRes.rowCount === 0) throw new PlotNotFoundError(plotId);
  const previousStatus = plotRes.rows[0].status as PlotStatus;

  // Latest baseline for the plot's region; overlap is computed on the ellipsoid.
  const overlapRes = await client.query(
    `SELECT b.id AS baseline_id,
            LEAST(100, ST_Area(ST_Intersection(p.boundary, b.geom)::geography)
                       / NULLIF(ST_Area(p.boundary::geography), 0) * 100) AS overlap_pct
       FROM plots p
       JOIN satellite_baseline b ON b.region_code = p.region_code
      WHERE p.plot_id = $1
      ORDER BY b.baseline_date DESC, b.id DESC
      LIMIT 1`,
    [plotId],
  );

  if (overlapRes.rowCount === 0) {
    return {
      plotId, checked: false, status: previousStatus, previousStatus, statusChanged: false,
      overlapPercent: null, thresholdPercent, baselineId: null,
      reason: `No satellite baseline for region '${plotRes.rows[0].region_code ?? "unknown"}'`,
      auditId: null,
    };
  }

  const baselineId = Number(overlapRes.rows[0].baseline_id);
  // area(plot) = 0 gives null (NULLIF): the GPS boundary is broken, so do not judge the plot.
  if (overlapRes.rows[0].overlap_pct === null || overlapRes.rows[0].overlap_pct === undefined) {
    return {
      plotId, checked: false, status: previousStatus, previousStatus, statusChanged: false,
      overlapPercent: null, thresholdPercent, baselineId,
      reason: "Plot boundary has zero area. Capture the GPS boundary again", auditId: null,
    };
  }
  const exactPercent = Number(overlapRes.rows[0].overlap_pct);
  const decided = decideStatus(exactPercent, thresholdPercent)!; // compare before rounding
  const storedPercent = displayPercent(exactPercent, decided);
  const reason = flagReason(decided, exactPercent, thresholdPercent, baselineId);

  await client.query(
    "INSERT INTO plot_overlap_result (plot_id, baseline_id, overlap_pct) VALUES ($1, $2, $3)",
    [plotId, baselineId, storedPercent],
  );

  // Do not overwrite a status set by a reviewer or another rule (Under Review, Cleared, Mismatch).
  // The check is still written to the audit log, so the overlap view always explains the latest result.
  if (!AUTO_STATUSES.has(previousStatus)) {
    const keptReason = `${reason}. Status kept as '${previousStatus}' because it was set manually`;
    const keptAuditId = await recordFlagAudit(
      { plotId, overlapPct: storedPercent, thresholdPct: thresholdPercent, reason: keptReason,
        previousStatus, newStatus: previousStatus, agentId },
      client,
    );
    return {
      plotId, checked: true, status: previousStatus, previousStatus, statusChanged: false,
      overlapPercent: storedPercent, thresholdPercent, baselineId, reason: keptReason, auditId: keptAuditId,
    };
  }

  await client.query("UPDATE plots SET status = $2 WHERE plot_id = $1", [plotId, decided]);
  const auditId = await recordFlagAudit(
    { plotId, overlapPct: storedPercent, thresholdPct: thresholdPercent, reason,
      previousStatus, newStatus: decided, agentId },
    client,
  );

  return {
    plotId, checked: true, status: decided, previousStatus, statusChanged: decided !== previousStatus,
    overlapPercent: storedPercent, thresholdPercent, baselineId, reason, auditId,
  };
}

/** Latest overlap result for a plot, with the threshold that was actually used. */
export async function getOverlap(
  db: { query: pg.Pool["query"] } | pg.PoolClient,
  plotId: string,
  thresholdPercent = currentThreshold(),
): Promise<OverlapView> {
  const { rows } = await db.query(
    `SELECT p.plot_id, p.status, r.overlap_pct, r.baseline_id, r.calculated_at,
            a.threshold_pct, a.flag_reason
       FROM plots p
       LEFT JOIN LATERAL (SELECT overlap_pct, baseline_id, calculated_at FROM plot_overlap_result
                           WHERE plot_id = p.plot_id ORDER BY id DESC LIMIT 1) r ON true
       LEFT JOIN LATERAL (SELECT threshold_pct, flag_reason FROM flag_audit
                           WHERE plot_id = p.plot_id ORDER BY id DESC LIMIT 1) a ON true
      WHERE p.plot_id = $1`,
    [plotId],
  );
  if (rows.length === 0) throw new PlotNotFoundError(plotId);
  const row = rows[0];
  const checked = row.overlap_pct !== null;
  return {
    plotId: row.plot_id,
    status: row.status,
    checked,
    overlapPercent: toNumber(row.overlap_pct),
    thresholdPercent: toNumber(row.threshold_pct) ?? thresholdPercent,
    baselineId: toNumber(row.baseline_id),
    reason: row.flag_reason ?? null,
    checkedAt: row.calculated_at ? new Date(row.calculated_at).toISOString() : null,
  };
}

export async function withTransaction<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
