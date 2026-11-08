/**
 * 009.2 flagging rule and threshold config (owner: Nuttanun, Backend 2).
 *
 * Rule: overlap <  threshold -> "Flagged"
 *       overlap >= threshold -> "Clean"
 *       no baseline (null)   -> null (pending check, status is not changed)
 *
 * The check uses the exact overlap value. Rounding happens only when the
 * value is stored or shown, so 89.996% is still Flagged.
 */

export type CheckStatus = "Clean" | "Flagged";

export const DEFAULT_THRESHOLD_PERCENT = 90;

/** Reads OVERLAP_THRESHOLD_PERCENT (0-100). Throws on an invalid value instead of silently using a default. */
export function currentThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OVERLAP_THRESHOLD_PERCENT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_THRESHOLD_PERCENT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`OVERLAP_THRESHOLD_PERCENT must be a number from 0 to 100, got "${raw}"`);
  }
  return value;
}

export function decideStatus(overlapPercent: number | null, thresholdPercent: number): CheckStatus | null {
  if (overlapPercent === null) return null;
  return overlapPercent < thresholdPercent ? "Flagged" : "Clean";
}

/** Rounds to 2 decimals for storage (NUMERIC(5,2)) and display. */
export function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Percentage to store and show for a decided status. A Flagged value is rounded down and a
 * Clean value is rounded normally, so 89.996% shows as 89.99% (not 90%) next to "Flagged".
 * Thresholds are stored with 2 decimals (NUMERIC(5,2)), so neither can cross the threshold.
 */
export function displayPercent(value: number, status: CheckStatus): number {
  if (status === "Clean") return roundPercent(value);
  return Math.floor(value * 100 + 1e-9) / 100; // 1e-9 stops 89.99 * 100 = 8998.999… dropping to 89.98
}

export function ruleText(thresholdPercent: number): string {
  return `overlap < ${thresholdPercent}% -> Flagged; overlap >= ${thresholdPercent}% -> Clean; no baseline -> pending check`;
}

export function flagReason(
  status: CheckStatus,
  overlapPercent: number,
  thresholdPercent: number,
  baselineId: number,
): string {
  const shown = displayPercent(overlapPercent, status);
  return status === "Flagged"
    ? `Overlap ${shown}% is below the ${thresholdPercent}% threshold (baseline #${baselineId})`
    : `Overlap ${shown}% meets the ${thresholdPercent}% threshold (baseline #${baselineId})`;
}
