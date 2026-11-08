/**
 * 013 tolerance configuration for area variance (owner: Nuttanun, Backend 2).
 *
 * How far a newly measured plot area may differ from the legacy (paper registry) area
 * before the plot is a Mismatch. Used by:
 *   - Vootichote: "Implement new vs legacy area comparison"  -> call isAreaMismatch()
 *   - Punnathorn: "Set plot status to Mismatch automatically" -> when it returns true
 *
 * Variance % = |new area - legacy area| / legacy area × 100
 * variance >  tolerance -> Mismatch
 * variance <= tolerance -> OK (exactly at the tolerance is OK, like the 90% rule)
 */

/** Default tolerance. Assumption until the PO confirms the real value. */
export const DEFAULT_AREA_TOLERANCE_PCT = 10;

/** Reads AREA_TOLERANCE_PCT (0-100). Throws on an invalid value. */
export function currentAreaTolerance(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.AREA_TOLERANCE_PCT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_AREA_TOLERANCE_PCT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`AREA_TOLERANCE_PCT must be a number from 0 to 100, got "${raw}"`);
  }
  return value;
}

/** Percentage difference from the legacy area. Both areas must use the same unit (for example hectares). */
export function areaVariancePercent(newArea: number, legacyArea: number): number {
  if (!Number.isFinite(newArea) || newArea < 0) throw new RangeError("New area must be a number >= 0");
  if (!Number.isFinite(legacyArea) || legacyArea <= 0) throw new RangeError("Legacy area must be a number > 0");
  const variance = (Math.abs(newArea - legacyArea) / legacyArea) * 100;
  // Remove floating point noise, e.g. 2.2 vs 2.0 gives 10.000000000000009 instead of 10.
  return Math.round(variance * 1e6) / 1e6;
}

export function isAreaMismatch(
  newArea: number,
  legacyArea: number,
  tolerancePercent = currentAreaTolerance(),
): boolean {
  return areaVariancePercent(newArea, legacyArea) > tolerancePercent;
}

export function areaToleranceRuleText(tolerancePercent: number): string {
  return `|new - legacy| / legacy > ${tolerancePercent}% -> Mismatch; otherwise OK`;
}
