import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "../../src/db/pool.ts";
import { NotFoundError } from "../../src/application/errors.ts";
import { areaVariancePct, decideMismatchStatus } from "../../src/application/landSizeMismatch.ts";
import { parseLandAreaHa, updateLandArea } from "../../src/application/updateLandArea.ts";
import type { PoolClient } from "pg";

const skip = process.env.RUN_DB_TESTS ? false : "set RUN_DB_TESTS=1 with PostgreSQL running";

after(async () => { await pool.end(); });

test("parseLandAreaHa accepts numbers and numeric text", () => {
  assert.equal(parseLandAreaHa(12.5), 12.5);
  assert.equal(parseLandAreaHa("12.50"), 12.5);
  assert.equal(parseLandAreaHa(" 3 "), 3);
});

test("parseLandAreaHa rejects invalid input", () => {
  for (const bad of [undefined, null, "", "abc", "12abc", NaN, Infinity, true, {}, []]) {
    assert.throws(() => parseLandAreaHa(bad), TypeError);
  }
  for (const bad of [0, -1, "-5", 1.234, 100_000_000]) {
    assert.throws(() => parseLandAreaHa(bad), RangeError);
  }
});

test("area variance is relative to the recorded area", () => {
  assert.ok(Math.abs(areaVariancePct(110, 100) - 10) < 1e-9);
  assert.ok(Math.abs(areaVariancePct(90, 100) - 10) < 1e-9);
  assert.throws(() => areaVariancePct(10, 0), RangeError);
});

test("mismatch decision follows the status rules", () => {
  assert.equal(decideMismatchStatus("Clean", 10, 10).action, "unchanged");          // exactly at tolerance
  assert.equal(decideMismatchStatus("Clean", 10.01, 10).newStatus, "Mismatch");
  assert.equal(decideMismatchStatus("Mismatch", 5, 10).newStatus, "Clean");
  assert.equal(decideMismatchStatus("Mismatch", 50, 10).action, "unchanged");
  assert.equal(decideMismatchStatus("Flagged", 50, 10).action, "skipped");
  assert.equal(decideMismatchStatus("Under Review", 50, 10).action, "skipped");
  assert.equal(decideMismatchStatus("Cleared", 50, 10).newStatus, "Cleared");
});

async function inRollback(work: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await work(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

test("land area update saves the change, history and mismatch status", { skip }, async () => {
  await inRollback(async (client) => {
    const first = await updateLandArea(client, { plotId: "P001", landAreaHa: 100, agentId: "A001", tolerancePct: 10 });
    assert.equal(first.previousLandAreaHa, 99);
    assert.equal(first.changed, true);
    assert.equal(first.mismatch.action, "unchanged");

    const history = await client.query("SELECT * FROM plot_area_history WHERE id = $1", [first.historyId]);
    assert.equal(Number(history.rows[0].previous_area_ha), 99);
    assert.equal(Number(history.rows[0].new_area_ha), 100);
    assert.equal(history.rows[0].agent_id, "A001");

    const second = await updateLandArea(client, { plotId: "P001", landAreaHa: 130, tolerancePct: 10 });
    assert.equal(second.mismatch.action, "marked_mismatch");
    const plot = await client.query("SELECT status, land_area_ha FROM plots WHERE plot_id = 'P001'");
    assert.equal(plot.rows[0].status, "Mismatch");
    assert.equal(Number(plot.rows[0].land_area_ha), 130);
    const audit = await client.query("SELECT * FROM flag_audit WHERE plot_id = 'P001' ORDER BY id DESC LIMIT 1");
    assert.equal(audit.rows[0].new_status, "Mismatch");
    assert.equal(audit.rows[0].overlap_pct, null);

    const third = await updateLandArea(client, { plotId: "P001", landAreaHa: 100, tolerancePct: 10 });
    assert.equal(third.mismatch.action, "restored_clean");
  });
});

test("same land area is not saved again", { skip }, async () => {
  await inRollback(async (client) => {
    const result = await updateLandArea(client, { plotId: "P001", landAreaHa: 99, tolerancePct: 10 });
    assert.equal(result.changed, false);
    assert.equal(result.historyId, null);
  });
});

test("invalid input and unknown plot are rejected", { skip }, async () => {
  await inRollback(async (client) => {
    await assert.rejects(updateLandArea(client, { plotId: "P001", landAreaHa: "abc" }), TypeError);
    await assert.rejects(updateLandArea(client, { plotId: "P001", landAreaHa: -5 }), RangeError);
    await assert.rejects(updateLandArea(client, { plotId: "NOPE", landAreaHa: 10 }), NotFoundError);
    const { rows } = await client.query("SELECT count(*) AS n FROM plot_area_history");
    assert.equal(Number(rows[0].n), 0);
  });
});

test("a reviewer's Cleared status is not overwritten", { skip }, async () => {
  await inRollback(async (client) => {
    await client.query("UPDATE plots SET status = 'Cleared' WHERE plot_id = 'P001'");
    const result = await updateLandArea(client, { plotId: "P001", landAreaHa: 500, tolerancePct: 10 });
    assert.equal(result.mismatch.action, "skipped");
    const { rows } = await client.query("SELECT status FROM plots WHERE plot_id = 'P001'");
    assert.equal(rows[0].status, "Cleared");
  });
});

test("plot_area_history rows cannot be changed", { skip }, async () => {
  await inRollback(async (client) => {
    await updateLandArea(client, { plotId: "P001", landAreaHa: 100 });
    await assert.rejects(client.query("UPDATE plot_area_history SET new_area_ha = 1"), /append-only/);
  });
});