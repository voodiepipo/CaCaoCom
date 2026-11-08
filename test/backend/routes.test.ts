import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { pool } from "../../src/db/pool.ts";
import { createBackendServer } from "../../src/backend/routes.ts";

const dbSkip = process.env.RUN_DB_TESTS ? false : "set RUN_DB_TESTS=1 with PostgreSQL + PostGIS running";

let server: Server;
let base: string;

before(async () => {
  if (process.env.RUN_DB_TESTS) {
    const { readFileSync } = await import("node:fs");
    await pool.query(readFileSync(new URL("../../src/backend/sql/003_2_document_verification.sql", import.meta.url), "utf8"));
  }
  server = createBackendServer(pool);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

const post = (path: string, body?: string) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body });

test("GET /api/settings/flagging returns the threshold and rule", async () => {
  const res = await fetch(`${base}/api/settings/flagging`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.thresholdPercent, 90);
  assert.match(body.rule, /Flagged/);
});

test("invalid threshold config returns 500 with a clear message", async () => {
  process.env.OVERLAP_THRESHOLD_PERCENT = "150";
  try {
    const res = await fetch(`${base}/api/settings/flagging`);
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, "Server configuration error");
  } finally {
    delete process.env.OVERLAP_THRESHOLD_PERCENT;
  }
});

test("wrong HTTP method returns 405", async () => {
  assert.equal((await post("/api/settings/flagging")).status, 405);
  assert.equal((await fetch(`${base}/api/plots/P001/check`)).status, 405);
  assert.equal((await post("/api/plots/P001/overlap")).status, 405);
});

test("invalid plot id returns 400", async () => {
  const res = await fetch(`${base}/api/plots/${"x".repeat(21)}/overlap`);
  assert.equal(res.status, 400);
});

test("invalid body or agentId returns 400 before touching the database", async () => {
  assert.equal((await post("/api/plots/P001/check", "{bad json")).status, 400);
  assert.equal((await post("/api/plots/P001/check", "[1,2]")).status, 400);
  assert.equal((await post("/api/plots/P001/check", JSON.stringify({ agentId: "agent with spaces" }))).status, 400);
  assert.equal((await post("/api/plots/P001/check", JSON.stringify({ agentId: 42 }))).status, 400);
});

test("Voot's existing routes still work through the same server", async () => {
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: "ok" });
  const res = await post("/api/plots/compare", JSON.stringify({
    newPlot: [[0, 0], [9, 0], [9, 10], [0, 10]],
    baseline: [[0, 0], [10, 0], [10, 10], [0, 10]],
  }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "matched");
  assert.equal((await fetch(`${base}/nope`)).status, 404);
});

test("unknown plot returns 404", { skip: dbSkip }, async () => {
  assert.equal((await fetch(`${base}/api/plots/NOPE/overlap`)).status, 404);
  assert.equal((await post("/api/plots/NOPE/check")).status, 404);
});

test("POST check then GET overlap on the sample plots", { skip: dbSkip }, async () => {
  // Uses db/sample_data.sql (P001, P002 in region WA01). This commits a check result + audit row.
  const check = await post("/api/plots/P002/check", JSON.stringify({ agentId: "AG01" }));
  assert.equal(check.status, 200);
  const result = await check.json();
  assert.equal(result.checked, true);
  assert.ok(["Clean", "Flagged", "Under Review", "Cleared", "Mismatch"].includes(result.status));

  const view = await (await fetch(`${base}/api/plots/P002/overlap`)).json();
  assert.equal(view.overlapPercent, result.overlapPercent);
  assert.equal(view.thresholdPercent, 90);
});

// ---- Sprint 2 routes ----

test("GET /api/settings/area-tolerance returns the tolerance and rule", async () => {
  const body = await (await fetch(`${base}/api/settings/area-tolerance`)).json();
  assert.equal(body.tolerancePercent, 10);
  assert.match(body.rule, /Mismatch/);
});

test("document routes validate input before touching the database", async () => {
  const bad: Array<[string, string | undefined]> = [
    ["/api/documents/abc/verify", JSON.stringify({ decision: "Approve", reviewerId: "R1" })],
    ["/api/documents/1/verify", JSON.stringify({ decision: "Maybe", reviewerId: "R1" })],
    ["/api/documents/1/verify", JSON.stringify({ decision: "Approve" })],
    ["/api/documents/1/verify", JSON.stringify({ decision: "Reject", reviewerId: "R1" })],
    ["/api/documents/1/verify", JSON.stringify({ decision: "Reject", reviewerId: "R1", reason: "  " })],
    ["/api/plots/P001/documents", JSON.stringify({ fileUrl: "not a url" })],
    ["/api/plots/P001/documents", JSON.stringify({ fileUrl: "ftp://files/x.pdf" })],
  ];
  for (const [path, body] of bad) assert.equal((await post(path, body)).status, 400, `${path} ${body}`);
  assert.equal((await fetch(`${base}/api/documents/1/verify`)).status, 405);
});

test("document workflow through the API", { skip: dbSkip }, async () => {
  // Commits rows in the test database (append-only audit cannot be cleaned up).
  const created = await post("/api/plots/P001/documents", JSON.stringify({ fileUrl: "https://files.example.com/deed.pdf" }));
  assert.equal(created.status, 201);
  const doc = await created.json();
  assert.equal(doc.status, "Pending");

  const approved = await post(`/api/documents/${doc.id}/verify`, JSON.stringify({ decision: "Approve", reviewerId: "REV01" }));
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).status, "Approved");

  const again = await post(`/api/documents/${doc.id}/verify`, JSON.stringify({ decision: "Reject", reviewerId: "REV02", reason: "late" }));
  assert.equal(again.status, 409);

  const list = await (await fetch(`${base}/api/plots/P001/documents`)).json();
  assert.ok(list.some((d: { id: number; status: string }) => d.id === doc.id && d.status === "Approved"));
  assert.equal((await fetch(`${base}/api/documents/999999`)).status, 404);
  assert.equal((await post("/api/plots/NOPE/documents", JSON.stringify({ fileUrl: "https://x.example/a.pdf" }))).status, 404);
});
