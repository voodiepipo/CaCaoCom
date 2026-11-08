import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";
import type pg from "pg";
import { pool } from "../../src/db/pool.ts";
import {
  addDocument, DocumentNotFoundError, getDocument, InvalidTransitionError, listPlotDocuments, nextStatus, verifyDocument,
} from "../../src/backend/documents.ts";
import { PlotNotFoundError } from "../../src/backend/satelliteCheck.ts";

const skip = process.env.RUN_DB_TESTS ? false : "set RUN_DB_TESTS=1 with PostgreSQL + PostGIS running";
const MIGRATION = readFileSync(new URL("../../src/backend/sql/003_2_document_verification.sql", import.meta.url), "utf8");

after(async () => { await pool.end(); });

// ---- Workflow rule (no database) ----
test("Pending can be approved or rejected", () => {
  assert.equal(nextStatus("Pending", "Approve"), "Approved");
  assert.equal(nextStatus("Pending", "Reject", "Name does not match"), "Rejected");
});

test("reject needs a reason", () => {
  for (const reason of [undefined, null, "", "   "]) {
    assert.throws(() => nextStatus("Pending", "Reject", reason), /reason is required/);
  }
});

test("Approved and Rejected are final", () => {
  for (const current of ["Approved", "Rejected"] as const) {
    for (const decision of ["Approve", "Reject"] as const) {
      assert.throws(() => nextStatus(current, decision, "x"), InvalidTransitionError, `${current} + ${decision}`);
    }
  }
});

test("unknown decision is refused", () => {
  assert.throws(() => nextStatus("Pending", "Maybe" as never), /Unknown decision/);
});

// ---- Database (each test is rolled back) ----
function dbTest(name: string, body: (client: pg.PoolClient) => Promise<void>) {
  test(name, { skip }, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(MIGRATION); // safe to run more than once
      await client.query(
        "INSERT INTO plots (plot_id, region_code, boundary) VALUES ('D_P1', 'TST', ST_MakeEnvelope(-2.6, 6.7, -2.599, 6.701, 4326))");
      await body(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
}

const FILE = "https://files.example.com/title-deed-D_P1.pdf";

dbTest("a new document starts as Pending", async (client) => {
  const doc = await addDocument(client, "D_P1", FILE);
  assert.equal(doc.status, "Pending");
  assert.equal(doc.reviewedBy, null);
  assert.deepEqual((await listPlotDocuments(client, "D_P1")).map((d) => d.id), [doc.id]);
});

dbTest("document for an unknown plot is refused", async (client) => {
  await assert.rejects(addDocument(client, "NOPE", FILE), PlotNotFoundError);
});

dbTest("approve: status, reviewer, time and one audit row", async (client) => {
  const doc = await addDocument(client, "D_P1", FILE);
  const approved = await verifyDocument(client, doc.id, "Approve", "REV01");
  assert.equal(approved.status, "Approved");
  assert.equal(approved.reviewedBy, "REV01");
  assert.ok(approved.reviewedAt);
  assert.equal(approved.rejectReason, null);
  const { rows } = await client.query("SELECT * FROM document_audit WHERE document_id = $1", [doc.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].previous_status, "Pending");
  assert.equal(rows[0].new_status, "Approved");
  assert.equal(rows[0].reviewer_id, "REV01");
});

dbTest("reject: reason is saved on the document and in the audit", async (client) => {
  const doc = await addDocument(client, "D_P1", FILE);
  const rejected = await verifyDocument(client, doc.id, "Reject", "REV01", "  Name does not match  ");
  assert.equal(rejected.status, "Rejected");
  assert.equal(rejected.rejectReason, "Name does not match");
  const { rows } = await client.query("SELECT reason FROM document_audit WHERE document_id = $1", [doc.id]);
  assert.equal(rows[0].reason, "Name does not match");
});

dbTest("a second decision on the same document is refused and nothing changes", async (client) => {
  const doc = await addDocument(client, "D_P1", FILE);
  await verifyDocument(client, doc.id, "Approve", "REV01");
  await assert.rejects(verifyDocument(client, doc.id, "Reject", "REV02", "late"), /already Approved/);
  const after = await getDocument(client, doc.id);
  assert.equal(after.status, "Approved");
  assert.equal(after.reviewedBy, "REV01");
});

dbTest("full workflow: rejected document, then a new upload is approved", async (client) => {
  const first = await addDocument(client, "D_P1", FILE);
  await verifyDocument(client, first.id, "Reject", "REV01", "Blurry photo");
  const second = await addDocument(client, "D_P1", "https://files.example.com/title-deed-D_P1-v2.pdf");
  await verifyDocument(client, second.id, "Approve", "REV01");
  const docs = await listPlotDocuments(client, "D_P1");
  assert.deepEqual(docs.map((d) => d.status), ["Rejected", "Approved"]);
});

dbTest("unknown document returns DocumentNotFoundError", async (client) => {
  await assert.rejects(getDocument(client, 999999), DocumentNotFoundError);
  await assert.rejects(verifyDocument(client, 999999, "Approve", "REV01"), DocumentNotFoundError);
});

dbTest("database rules: rejected needs a reason, decided needs a reviewer", async (client) => {
  const doc = await addDocument(client, "D_P1", FILE);
  await client.query("SAVEPOINT s1");
  await assert.rejects(client.query(
    "UPDATE land_documents SET status = 'Rejected', reviewed_by = 'X', reviewed_at = now() WHERE id = $1", [doc.id]),
    /rejected_has_reason/);
  await client.query("ROLLBACK TO SAVEPOINT s1");
  await assert.rejects(client.query("UPDATE land_documents SET status = 'Approved' WHERE id = $1", [doc.id]),
    /reviewed_has_reviewer/);
});

dbTest("document audit cannot be edited or deleted", async (client) => {
  const doc = await addDocument(client, "D_P1", FILE);
  await verifyDocument(client, doc.id, "Approve", "REV01");
  await client.query("SAVEPOINT s1");
  await assert.rejects(client.query("UPDATE document_audit SET reason = 'x'"), /append-only/);
  await client.query("ROLLBACK TO SAVEPOINT s1");
  await assert.rejects(client.query("DELETE FROM document_audit"), /append-only/);
});
