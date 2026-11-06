import type { Queryable } from "../db/flagAudit.ts";
import { NotFoundError } from "./errors.ts";
import { checkLandSizeMismatch, type MismatchOutcome } from "./landSizeMismatch.ts";

/** plots.land_area_ha is NUMERIC(10,2). */
export const MAX_LAND_AREA_HA = 99_999_999.99;
const NUMERIC_TEXT = /^-?\d+(\.\d+)?$/;

/** Accepts a number or numeric text; returns hectares with at most 2 decimals. */
export function parseLandAreaHa(input: unknown): number {
  let value: number;
  if (typeof input === "number") {
    value = input;
  } else if (typeof input === "string" && NUMERIC_TEXT.test(input.trim())) {
    value = Number(input.trim());
  } else {
    throw new TypeError("landAreaHa must be a number");
  }
  if (!Number.isFinite(value)) throw new TypeError("landAreaHa must be a finite number");
  if (value <= 0) throw new RangeError("landAreaHa must be greater than 0");
  if (value > MAX_LAND_AREA_HA) {
    throw new RangeError(`landAreaHa must not exceed ${MAX_LAND_AREA_HA}`);
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    throw new RangeError("landAreaHa can have at most 2 decimal places");
  }
  return Math.round(value * 100) / 100;
}

export interface LandAreaUpdateInput {
  plotId: string;
  landAreaHa: unknown;
  agentId?: string;
  tolerancePct?: number;
}

export interface LandAreaUpdateResult {
  plotId: string;
  previousLandAreaHa: number | null;
  landAreaHa: number;
  changed: boolean;
  historyId: number | null;
  mismatch: MismatchOutcome;
}

/**
 * Validates the new land area, saves it, writes a history row, then re-checks
 * the Mismatch status. Call it inside a transaction (see withTransaction).
 */
export async function updateLandArea(
  db: Queryable,
  input: LandAreaUpdateInput,
): Promise<LandAreaUpdateResult> {
  if (typeof input.plotId !== "string" || input.plotId.trim() === "") {
    throw new TypeError("plotId is required");
  }
  const plotId = input.plotId.trim();
  const landAreaHa = parseLandAreaHa(input.landAreaHa);

  const { rows } = await db.query(
    "SELECT land_area_ha FROM plots WHERE plot_id = $1 FOR UPDATE",
    [plotId],
  );
  if (rows.length === 0) throw new NotFoundError(`Plot ${plotId} not found`);
  const previousLandAreaHa = rows[0].land_area_ha === null ? null : Number(rows[0].land_area_ha);

  let historyId: number | null = null;
  const changed = previousLandAreaHa !== landAreaHa;
  if (changed) {
    await db.query("UPDATE plots SET land_area_ha = $1 WHERE plot_id = $2", [landAreaHa, plotId]);
    const history = await db.query(
      `INSERT INTO plot_area_history (plot_id, previous_area_ha, new_area_ha, agent_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [plotId, previousLandAreaHa, landAreaHa, input.agentId ?? "SYSTEM"],
    );
    historyId = Number(history.rows[0].id);
  }

  const mismatch = await checkLandSizeMismatch(db, plotId, {
    agentId: input.agentId,
    tolerancePct: input.tolerancePct,
  });
  return { plotId, previousLandAreaHa, landAreaHa, changed, historyId, mismatch };
}