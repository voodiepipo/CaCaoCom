/**
 * 003.2 update verification status and workflow (owner: Nuttanun, Backend 2).
 * Chalisa's document viewer calls these through the API (Approve / Reject buttons).
 *
 * Workflow:
 *   Pending --Approve--> Approved   (final)
 *   Pending --Reject---> Rejected   (final; reason required, agent uploads a new document)
 * A decision on an Approved or Rejected document is refused, so two reviewers
 * clicking at the same time cannot overwrite each other.
 */

import type pg from "pg";
import { PlotNotFoundError } from "./satelliteCheck.ts";

export type DocumentStatus = "Pending" | "Approved" | "Rejected";
export type Decision = "Approve" | "Reject";

export class DocumentNotFoundError extends Error {
  constructor(id: number) { super(`Document ${id} not found`); this.name = "DocumentNotFoundError"; }
}
export class InvalidTransitionError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidTransitionError"; }
}

export interface LandDocument {
  id: number;
  plotId: string;
  fileUrl: string;
  status: DocumentStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

/** The workflow rule on its own, so it can be tested without a database. */
export function nextStatus(current: DocumentStatus, decision: Decision, reason?: string | null): DocumentStatus {
  if (current !== "Pending") {
    throw new InvalidTransitionError(`Document is already ${current}; only Pending documents can be reviewed`);
  }
  if (decision === "Approve") return "Approved";
  if (decision === "Reject") {
    if (!reason || !reason.trim()) throw new InvalidTransitionError("A reason is required to reject a document");
    return "Rejected";
  }
  throw new InvalidTransitionError(`Unknown decision '${decision}'`);
}

type Queryable = { query: pg.Pool["query"] } | pg.PoolClient;

const toDocument = (row: Record<string, any>): LandDocument => ({
  id: Number(row.id),
  plotId: row.plot_id,
  fileUrl: row.file_url,
  status: row.status,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
  rejectReason: row.reject_reason,
  createdAt: new Date(row.created_at).toISOString(),
});

export async function addDocument(db: Queryable, plotId: string, fileUrl: string): Promise<LandDocument> {
  const plot = await db.query("SELECT 1 FROM plots WHERE plot_id = $1", [plotId]);
  if (plot.rowCount === 0) throw new PlotNotFoundError(plotId);
  const { rows } = await db.query(
    "INSERT INTO land_documents (plot_id, file_url) VALUES ($1, $2) RETURNING *", [plotId, fileUrl]);
  return toDocument(rows[0]);
}

export async function getDocument(db: Queryable, id: number): Promise<LandDocument> {
  const { rows } = await db.query("SELECT * FROM land_documents WHERE id = $1", [id]);
  if (rows.length === 0) throw new DocumentNotFoundError(id);
  return toDocument(rows[0]);
}

export async function listPlotDocuments(db: Queryable, plotId: string): Promise<LandDocument[]> {
  const { rows } = await db.query("SELECT * FROM land_documents WHERE plot_id = $1 ORDER BY id", [plotId]);
  return rows.map(toDocument);
}

/**
 * Approves or rejects a document and writes one audit row. Call inside a transaction
 * (withTransaction): the row is locked so two reviewers cannot decide at the same time.
 */
export async function verifyDocument(
  client: pg.PoolClient,
  id: number,
  decision: Decision,
  reviewerId: string,
  reason?: string | null,
): Promise<LandDocument> {
  const { rows } = await client.query("SELECT * FROM land_documents WHERE id = $1 FOR UPDATE", [id]);
  if (rows.length === 0) throw new DocumentNotFoundError(id);
  const current = rows[0].status as DocumentStatus;
  const next = nextStatus(current, decision, reason);
  const cleanReason = next === "Rejected" ? reason!.trim() : null;

  const updated = await client.query(
    `UPDATE land_documents
        SET status = $2, reviewed_by = $3, reviewed_at = now(), reject_reason = $4
      WHERE id = $1 RETURNING *`,
    [id, next, reviewerId, cleanReason]);
  await client.query(
    `INSERT INTO document_audit (document_id, previous_status, new_status, reason, reviewer_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, current, next, cleanReason, reviewerId]);
  return toDocument(updated.rows[0]);
}
