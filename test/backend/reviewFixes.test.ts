/**
 * Sprint 2 Day 5: fixes from the Sprint 1 code review (owner: Nuttanun, Backend 2).
 * R1 shown % never contradicts the status   R2 overlap view reason matches the latest check
 * R3 internal errors are 500, not 400        R4 a plot with zero area is not checked
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import type { AddressInfo } from "node:net";
import type pg from "pg";
import { pool } from "../../src/db/pool.ts";
import { displayPercent, flagReason } from "../../src/backend/flagging.ts";
import { getOverlap, runSatelliteCheck } from "../../src/backend/satelliteCheck.ts";
import { createBackendServer } from "../../src/backend/routes.ts";

const skip = process.env.RUN_DB_TESTS ? false : "set RUN_DB_TESTS=1 with PostgreSQL + PostGIS running";
after(async () => { await pool.end(); });

/** A fake database client: answers each query in order and records what was sent. */
function fakeClient(answers: Array<Record<string, unknown>[]>) {
  const sent: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      sent.push({ sql, values });
      const rows = answers.shift() ?? [];
      return { rows, rowCount: rows.length };
    },
  };
  return { client: client as unknown as pg.PoolClient, sent };
}

// ---- R1 ----
test("R1 shown percentage never rounds across the threshold", () => {
  assert.equal(displayPercent(89.996, "Flagged"), 89.99); // not 90
  assert.equal(displayPercent(89.99, "Flagged"), 89.99);  // no floating point drop to 89.98
  assert.equal(displayPercent(50, "Flagged"), 50);
  assert.equal(displayPercent(90.004, "Clean"), 90);
  assert.equal(displayPercent(99.996, "Clean"), 100);
});

test("R1 flag reason shows a percentage that matches the status", () => {
  assert.equal(flagReason("Flagged", 89.996, 90, 3), "Overlap 89.99% is below the 90% threshold (baseline #3)");
});

test("R1 the check stores and returns the status-safe percentage", async () => {
  const { client, sent } = fakeClient([
    [{ plot_id: "P9", region_code: "TST", status: "Clean" }], // lock plot
    [{ baseline_id: 7, overlap_pct: 89.996 }],               // overlap
    [],                                                      // insert overlap result
    [],                                                      // update status
    [{ id: 1 }],                                             // audit
  ]);
  const result = await runSatelliteCheck(client, "P9", "SYSTEM", 90);
  assert.equal(result.status, "Flagged");
  assert.equal(result.overlapPercent, 89.99);
  assert.equal(sent[2].values?.[2], 89.99);
});

// ---- R2 ----
test("R2 overlap view reason comes from the latest check, also when the status was kept", { skip }, async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO satellite_source (name, provider, cutoff_date) VALUES ('Test', 'test', '2020-12-31') RETURNING id");
    await client.query(`INSERT INTO satellite_baseline (source_id, region_code, baseline_date, geom)
      VALUES ($1, 'TST', '2020-12-31', ST_MakeEnvelope(-2.600, 6.700, -2.599, 6.701, 4326))`, [rows[0].id]);
    await client.query(`INSERT INTO plots (plot_id, region_code, boundary, status)
      VALUES ('T_R2', 'TST', ST_MakeEnvelope(-2.5995, 6.700, -2.5985, 6.701, 4326), 'Clean')`);

    await runSatelliteCheck(client, "T_R2", "SYSTEM", 90);           // 50% -> Flagged
    await client.query("UPDATE plots SET status = 'Cleared' WHERE plot_id = 'T_R2'"); // reviewer clears it
    await client.query(`INSERT INTO satellite_baseline (source_id, region_code, baseline_date, geom)
      VALUES ($1, 'TST', '2021-12-31', ST_MakeEnvelope(-2.601, 6.699, -2.598, 6.702, 4326))`, [rows[0].id]);
    await runSatelliteCheck(client, "T_R2", "SYSTEM", 90);           // 100%, status kept

    const view = await getOverlap(client, "T_R2", 90);
    assert.equal(view.overlapPercent, 100);
    assert.equal(view.status, "Cleared");
    assert.match(view.reason ?? "", /Overlap 100% meets/);
    assert.match(view.reason ?? "", /Status kept as 'Cleared'/);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

// ---- R3 ----
test("R3 an unexpected internal error returns 500 without its message", async () => {
  const brokenPool = { query: async () => { throw new TypeError("secret internal detail"); } } as unknown as pg.Pool;
  const server = createBackendServer(brokenPool);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/plots/P001/overlap`);
    assert.equal(res.status, 500);
    assert.doesNotMatch(await res.text(), /secret internal detail/);
  } finally {
    console.error = originalError;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ---- R4 ----
test("R4 a plot boundary with zero area is not checked and the status is kept", async () => {
  const { client, sent } = fakeClient([
    [{ plot_id: "P0", region_code: "TST", status: "Clean" }],
    [{ baseline_id: 7, overlap_pct: null }], // area(plot) = 0 -> NULLIF gives null
  ]);
  const result = await runSatelliteCheck(client, "P0", "SYSTEM", 90);
  assert.equal(result.checked, false);
  assert.equal(result.status, "Clean");
  assert.match(result.reason, /zero area/);
  assert.equal(sent.length, 2); // nothing saved, no status change
});
