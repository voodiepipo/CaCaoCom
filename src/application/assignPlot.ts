import type { PlotStatus, Queryable } from "../db/flagAudit.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "./errors.ts";

export type UserRole = "admin" | "manager" | "agent";

/** Only these roles may assign plots. */
const ASSIGNER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["admin", "manager"]);
/** Only conflicted plots can be assigned. */
export const ASSIGNABLE_STATUSES: readonly PlotStatus[] = ["Flagged", "Mismatch"];

export interface AssignPlotInput {
  plotId: string;
  agentId: string;
  actorId: string;
}

export interface AssignPlotResult {
  plotId: string;
  agentId: string;
  assignedBy: string;
  assignedAt: string;
  previousAgentId: string | null;
  changed: boolean;
}

export interface CurrentAssignment {
  plotId: string;
  agentId: string;
  agentName: string;
  assignedBy: string;
  assignedAt: string;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  throw new TypeError("Expected a text value from the database");
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

const toIso = (value: unknown) =>
  (value instanceof Date ? value : new Date(asText(value))).toISOString();

/** Active field agents, for the assignment dropdown. */
export async function listActiveAgents(db: Queryable): Promise<Array<{ userId: string; fullName: string }>> {
  const { rows } = await db.query(
    "SELECT user_id, full_name FROM app_user WHERE role = 'agent' AND active ORDER BY full_name",
  );
  return rows.map((row) => ({ userId: asText(row.user_id), fullName: asText(row.full_name) }));
}

export async function getCurrentAssignment(db: Queryable, plotId: string): Promise<CurrentAssignment | null> {
  const { rows } = await db.query(
    `SELECT a.agent_id, u.full_name, a.assigned_by, a.assigned_at
       FROM plot_assignment a JOIN app_user u ON u.user_id = a.agent_id
      WHERE a.plot_id = $1 AND a.unassigned_at IS NULL`,
    [plotId],
  );
  if (rows.length === 0) return null;
  return {
    plotId,
    agentId: asText(rows[0].agent_id),
    agentName: asText(rows[0].full_name),
    assignedBy: asText(rows[0].assigned_by),
    assignedAt: toIso(rows[0].assigned_at),
  };
}

/**
 * Assigns a conflicted plot to a field agent. Reassigning closes the previous
 * assignment and keeps it as history. Call it inside a transaction.
 */
export async function assignPlot(db: Queryable, input: AssignPlotInput): Promise<AssignPlotResult> {
  const plotId = requireText(input.plotId, "plotId");
  const agentId = requireText(input.agentId, "agentId");
  const actorId = requireText(input.actorId, "actorId");

  const actor = await db.query("SELECT role, active FROM app_user WHERE user_id = $1", [actorId]);
  if (
    actor.rows.length === 0 || !actor.rows[0].active ||
    !ASSIGNER_ROLES.has(actor.rows[0].role as UserRole)
  ) {
    throw new ForbiddenError("Only an active admin or manager can assign plots");
  }

  // Lock the plot so two assignments for the same plot cannot run at once.
  const plot = await db.query("SELECT status FROM plots WHERE plot_id = $1 FOR UPDATE", [plotId]);
  if (plot.rows.length === 0) throw new NotFoundError(`Plot ${plotId} not found`);
  const status = plot.rows[0].status as PlotStatus;
  if (!ASSIGNABLE_STATUSES.includes(status)) {
    throw new ConflictError(`Plot is ${status}; only ${ASSIGNABLE_STATUSES.join(" or ")} plots can be assigned`);
  }

  const agent = await db.query("SELECT role, active FROM app_user WHERE user_id = $1", [agentId]);
  if (agent.rows.length === 0) throw new NotFoundError(`Agent ${agentId} not found`);
  if (agent.rows[0].role !== "agent" || !agent.rows[0].active) {
    throw new ConflictError(`${agentId} is not an active field agent`);
  }

  const current = await db.query(
    `SELECT agent_id, assigned_by, assigned_at FROM plot_assignment
      WHERE plot_id = $1 AND unassigned_at IS NULL FOR UPDATE`,
    [plotId],
  );
  const previousAgentId = current.rows.length > 0 ? asText(current.rows[0].agent_id) : null;

  if (previousAgentId === agentId) {
    return {
      plotId, agentId,
      assignedBy: asText(current.rows[0].assigned_by),
      assignedAt: toIso(current.rows[0].assigned_at),
      previousAgentId, changed: false,
    };
  }
  if (previousAgentId !== null) {
    await db.query(
      "UPDATE plot_assignment SET unassigned_at = now() WHERE plot_id = $1 AND unassigned_at IS NULL",
      [plotId],
    );
  }
  const inserted = await db.query(
    `INSERT INTO plot_assignment (plot_id, agent_id, assigned_by)
     VALUES ($1, $2, $3) RETURNING assigned_at`,
    [plotId, agentId, actorId],
  );
  return {
    plotId, agentId, assignedBy: actorId,
    assignedAt: toIso(inserted.rows[0].assigned_at),
    previousAgentId, changed: true,
  };
}