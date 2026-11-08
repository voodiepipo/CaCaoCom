/**
 * 007 sync queue and conflict resolution rules (owner: Nuttanun, Backend 2).
 * Full rules with examples: SYNC_RULES.md
 *
 * The mobile app keeps a queue of changes made offline. When the network comes back,
 * it sends them in order. For each change the server calls resolveSync() and gets one
 * decision. Every record is all-or-nothing: either every field is saved, or nothing is.
 */

/** Statuses decided by a reviewer. The field app cannot change these plots. */
export const LOCKED_STATUSES: ReadonlySet<string> = new Set(["Under Review", "Cleared"]);

/** Max changes per sync request. The app sends the rest in the next request. */
export const MAX_BATCH_SIZE = 50;

export type SyncOp = "create" | "update" | "delete";

export interface IncomingChange {
  /** UUID made on the phone. Same id on every retry. */
  clientId: string;
  op: SyncOp;
  /** Server version the phone last saw. null for create. */
  baseVersion: number | null;
  /** Field values the phone last saw from the server (before its own edit). Empty for create. */
  baseValues: Record<string, unknown>;
  /** New field values from the phone. */
  changes: Record<string, unknown>;
}

export interface ServerRecord {
  version: number;
  status: string;
  values: Record<string, unknown>;
}

export type SyncDecision =
  | { action: "insert" }                                     // new record, save it (version 1)
  | { action: "apply"; fields: string[] }                    // save these fields, version + 1
  | { action: "duplicate" }                                  // already saved (a retry), reply OK
  | { action: "conflict"; fields: string[] }                 // server wins, return server copy
  | { action: "reject"; reason: string };                    // not allowed, return reason

/** Order-independent comparison, so {a:1,b:2} equals {b:2,a:1}. */
export function sameValue(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.keys(value as object).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

/** Checks the shape of one queued change. Returns an error message, or null when valid. */
export function validateChange(change: unknown): string | null {
  if (!change || typeof change !== "object") return "change must be an object";
  const c = change as Partial<IncomingChange>;
  if (typeof c.clientId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(c.clientId)) return "clientId must be a UUID";
  if (c.op !== "create" && c.op !== "update" && c.op !== "delete") return "op must be create, update or delete";
  if (!c.changes || typeof c.changes !== "object" || Array.isArray(c.changes)) return "changes must be an object";
  if (c.op === "create" && c.baseVersion !== null) return "baseVersion must be null for create";
  if (c.op !== "create" && (!Number.isInteger(c.baseVersion) || (c.baseVersion as number) < 1)) {
    return "baseVersion must be a positive integer for update and delete";
  }
  if (c.op === "update") {
    if (Object.keys(c.changes).length === 0) return "update must change at least one field";
    if (!c.baseValues || typeof c.baseValues !== "object" || Array.isArray(c.baseValues)) {
      return "baseValues must be an object for update";
    }
    const missing = Object.keys(c.changes).filter((f) => !(f in (c.baseValues as object)));
    if (missing.length) return `baseValues is missing: ${missing.join(", ")}`;
  }
  return null;
}

export function resolveSync(server: ServerRecord | null, change: IncomingChange): SyncDecision {
  const fields = Object.keys(change.changes);

  // Rule 1: create
  if (change.op === "create") {
    if (!server) return { action: "insert" };
    // Same clientId already saved: a retry if the values match, otherwise a clash.
    const same = fields.every((f) => sameValue(server.values[f], change.changes[f]));
    return same ? { action: "duplicate" } : { action: "conflict", fields: fields.filter((f) => !sameValue(server.values[f], change.changes[f])) };
  }

  // Rule 2: update/delete of a record the server has never seen
  if (!server) return { action: "reject", reason: "Unknown record. Send its create first (the queue must keep its order)" };

  // Rule 3: no deletes from the field app (keeps the audit trail)
  if (change.op === "delete") return { action: "reject", reason: "Synced plots cannot be deleted from the field app" };

  // Rule 4: reviewer decisions win
  if (LOCKED_STATUSES.has(server.status)) {
    return { action: "reject", reason: `Plot is '${server.status}' and locked by a reviewer` };
  }

  // Rule 5: retry of a change that is already saved
  if (fields.every((f) => sameValue(server.values[f], change.changes[f]))) return { action: "duplicate" };

  // Rule 6: nobody else changed it since the phone last synced
  if (change.baseVersion === server.version) return { action: "apply", fields };

  // Rule 7: someone else changed it. Field by field (3-way):
  //   server still equals what the phone saw -> safe to apply
  //   server already equals the phone's new value -> nothing to do
  //   otherwise both changed the same field -> conflict
  const conflicts = fields.filter((f) =>
    !sameValue(server.values[f], change.baseValues[f]) && !sameValue(server.values[f], change.changes[f]));
  if (conflicts.length > 0) return { action: "conflict", fields: conflicts };
  const toApply = fields.filter((f) => !sameValue(server.values[f], change.changes[f]));
  return { action: "apply", fields: toApply };
}
