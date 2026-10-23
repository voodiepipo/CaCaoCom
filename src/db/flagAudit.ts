   import type { BaselineComparison } from "../geometry/polygonOverlap.ts";
   import { pool } from "./pool.ts";

   export type PlotStatus = "Clean" | "Flagged" | "Under Review" | "Cleared" | "Mismatch";

   type Queryable = {
     query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
   };

   export interface FlagAuditInput {
     plotId: string;
     overlapPct: number;   // 0-100
     thresholdPct: number; // 0-100
     reason: string;
     previousStatus: PlotStatus | null;
     newStatus: PlotStatus;
     agentId?: string;
   }

   /** Saves one append-only audit row and returns its id. */
   export async function recordFlagAudit(input: FlagAuditInput, db: Queryable = pool): Promise<number> {
     const { rows } = await db.query(
       "SELECT record_flag_audit($1, $2, $3, $4, $5::plot_status, $6::plot_status, $7) AS id",
       [input.plotId, input.overlapPct, input.thresholdPct, input.reason,
        input.previousStatus, input.newStatus, input.agentId ?? "SYSTEM"],
     );
     return Number(rows[0].id);
   }

   const toPct = (ratio: number) => Math.round(ratio * 10000) / 100;

   /** Turns the geometry result (ratios 0..1) into an audit entry. Call it when status is "flagged". */
   export function auditInputFromComparison(
     plotId: string,
     comparison: BaselineComparison,
     previousStatus: PlotStatus | null,
     agentId?: string,
   ): FlagAuditInput {
     const overlapPct = toPct(comparison.percentageOfBaseline);
     const thresholdPct = toPct(comparison.minimumBaselineOverlap);
     const flagged = comparison.status === "flagged";
     return {
       plotId,
       overlapPct,
       thresholdPct,
       reason: flagged
         ? `Overlap ${overlapPct}% is below the ${thresholdPct}% threshold`
         : `Overlap ${overlapPct}% meets the ${thresholdPct}% threshold`,
       previousStatus,
       newStatus: flagged ? "Flagged" : "Clean",
       agentId,
     };
   }