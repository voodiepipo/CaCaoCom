import { recordFlagAudit, type PlotStatus, type Queryable } from "../db/flagAudit.ts";
import { NotFoundError } from "./errors.ts";

/** Used until the team's tolerance config exists. Override with AREA_TOLERANCE_PCT. */
export const DEFAULT_AREA_TOLERANCE_PCT = 10;

export type MismatchAction = "marked_mismatch" | "restored_clean" | "unchanged" | "skipped";

export interface MismatchDecision {
  action: MismatchAction;
  newStatus: PlotStatus;
  reason: string;
}

export interface MismatchOutcome extends MismatchDecision {
  measuredAreaHa: number;
  recordedAreaHa: number | null;
  variancePct: number | null;
  tolerancePct: number;
  previousStatus: PlotStatus;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function areaTolerancePct(): number {
  const raw = process.env.AREA_TOLERANCE_PCT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_AREA_TOLERANCE_PCT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("AREA_TOLERANCE_PCT must be a number between 0 and 100");
  }
  return value;
}

/** Variance of the measured (new) area against the recorded (legacy) area, in percent. */
export function areaVariancePct(measuredHa: number, recordedHa: number): number {
  if (Number.isNaN(recordedHa) || recordedHa <= 0) {
    throw new RangeError("recordedHa must be greater than 0");
  }
  return (Math.abs(measuredHa - recordedHa) / recordedHa) * 100;
}

/**
 * Pure rule for the next status:
 *  - Under Review / Cleared were set by a person, so they are never changed.
 *  - Clean + variance above tolerance -> Mismatch.
 *  - Flagged stays Flagged (already needs review).
 *  - Mismatch + variance back within tolerance -> Clean.
 * A variance exactly equal to the tolerance is still within tolerance.
 */
export function decideMismatchStatus(
  status: PlotStatus,
  variancePct: number,
  tolerancePct: number,
): MismatchDecision {
  if (status === "Under Review" || status === "Cleared") {
    return { action: "skipped", newStatus: status, reason: `Status ${status} was set by a reviewer and is left unchanged` };
  }
  if (variancePct > tolerancePct) {
    if (status === "Clean") {
      return { action: "marked_mismatch", newStatus: "Mismatch", reason: "Land size differs from the recorded area beyond tolerance" };
    }
    if (status === "Flagged") {
      return { action: "skipped", newStatus: status, reason: "Plot is already Flagged for review; Mismatch not applied" };
    }
    return { action: "unchanged", newStatus: status, reason: "Plot is already Mismatch" };
  }
  if (status === "Mismatch") {
    return { action: "restored_clean", newStatus: "Clean", reason: "Land size is back within tolerance" };
  }
  return { action: "unchanged", newStatus: status, reason: "Land size is within tolerance" };
}

/**
 * Compares the area measured from the plot boundary with land_area_ha and sets
 * the status automatically. Writes an audit row when the status changes.
 * Call it inside a transaction (see withTransaction).
 */
export async function checkLandSizeMismatch(
  db: Queryable,
  plotId: string,
  options: { tolerancePct?: number; agentId?: string } = {},
): Promise<MismatchOutcome> {
  const tolerancePct = options.tolerancePct ?? areaTolerancePct();
  const { rows } = await db.query(
    `SELECT status, land_area_ha,
            ST_Area(boundary::geography) / 10000.0 AS measured_ha
       FROM plots WHERE plot_id = $1 FOR UPDATE`,
    [plotId],
  );
  if (rows.length === 0) throw new NotFoundError(`Plot ${plotId} not found`);

  const previousStatus = rows[0].status as PlotStatus;
  const recordedAreaHa = rows[0].land_area_ha === null ? null : Number(rows[0].land_area_ha);
  const measuredRaw = Number(rows[0].measured_ha);
  const measuredAreaHa = round2(measuredRaw);

  if (recordedAreaHa === null || recordedAreaHa <= 0) {
    return {
      action: "skipped", newStatus: previousStatus, reason: "No recorded land area to compare with",
      measuredAreaHa, recordedAreaHa, variancePct: null, tolerancePct, previousStatus,
    };
  }

  const varianceRaw = areaVariancePct(measuredRaw, recordedAreaHa);
  const variancePct = round2(varianceRaw);
  const decision = decideMismatchStatus(previousStatus, varianceRaw, tolerancePct);

  if (decision.newStatus !== previousStatus) {
    await db.query("UPDATE plots SET status = $2::plot_status WHERE plot_id = $1", [plotId, decision.newStatus]);
    await recordFlagAudit({
      plotId,
      overlapPct: null,
      thresholdPct: tolerancePct,
      reason: `${decision.reason} (measured ${measuredAreaHa} ha, recorded ${recordedAreaHa} ha, variance ${variancePct}%, tolerance ${tolerancePct}%)`,
      previousStatus,
      newStatus: decision.newStatus,
      agentId: options.agentId,
    }, db);
  }

  return { ...decision, measuredAreaHa, recordedAreaHa, variancePct, tolerancePct, previousStatus };
}