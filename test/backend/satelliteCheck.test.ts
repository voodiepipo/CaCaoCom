import assert from "node:assert/strict";
import test, { after } from "node:test";
import type pg from "pg";
import { pool } from "../../src/db/pool.ts";
import { getOverlap, PlotNotFoundError, runSatelliteCheck } from "../../src/backend/satelliteCheck.ts";

const skip = process.env.RUN_DB_TESTS ? false : "set RUN_DB_TESTS=1 with PostgreSQL + PostGIS running";

after(async () => { await pool.end(); });

// Baseline = non-forest land at the 2020 cutoff: a ~110 m square in region TST.
const BASE = "ST_MakeEnvelope(-2.600, 6.700, -2.599, 6.701, 4326)";

/** Runs a test inside a transaction that is always rolled back, so the database stays clean. */
function dbTest(name: string, body: (client: pg.PoolClient) => Promise<void>) {
  test(name, { skip }, async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "INSERT INTO satellite_source (name, provider, cutoff_date) VALUES ('Test source', 'test', '2020-12-31') RETURNING id",
      );
      const sourceId = rows[0].id;
      await client.query(
        `INSERT INTO satellite_baseline (source_id, region_code, baseline_date, geom)
         VALUES ($1, 'TST', '2020-12-31', ${BASE})`, [sourceId]);
      await client.query(
        `INSERT INTO plots (plot_id, region_code, boundary, status) VALUES
          ('T_IN',   'TST', ST_MakeEnvelope(-2.5998, 6.7002, -2.5992, 6.7008, 4326), 'Clean'),
          ('T_HALF', 'TST', ST_MakeEnvelope(-2.5995, 6.700, -2.5985, 6.701, 4326), 'Clean'),
          ('T_NOB',  'NOB', ST_MakeEnvelope(-2.600, 6.700, -2.599, 6.701, 4326), 'Clean'),
          ('T_CLR',  'TST', ST_MakeEnvelope(-2.5995, 6.700, -2.5985, 6.701, 4326), 'Cleared')`);
      await body(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
}

async function auditRows(client: pg.PoolClient, plotId: string) {
  const { rows } = await client.query("SELECT * FROM flag_audit WHERE plot_id = $1 ORDER BY id", [plotId]);
  return rows;
}

dbTest("plot inside the baseline is Clean with 100% overlap", async (client) => {
  const result = await runSatelliteCheck(client, "T_IN", "AG01", 90);
  assert.equal(result.status, "Clean");
  assert.equal(result.overlapPercent, 100);
  assert.equal(result.checked, true);
});

dbTest("plot half outside is Flagged automatically, with reason and audit row", async (client) => {
  const result = await runSatelliteCheck(client, "T_HALF", "AG01", 90);
  assert.equal(result.status, "Flagged");
  assert.ok(Math.abs(result.overlapPercent! - 50) < 0.5, `got ${result.overlapPercent}`);
  assert.equal(result.previousStatus, "Clean");
  assert.equal(result.statusChanged, true);
  assert.match(result.reason, /below the 90% threshold \(baseline #\d+\)/);

  const { rows } = await client.query("SELECT status FROM plots WHERE plot_id = 'T_HALF'");
  assert.equal(rows[0].status, "Flagged");

  const audit = await auditRows(client, "T_HALF");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].previous_status, "Clean");
  assert.equal(audit[0].new_status, "Flagged");
  assert.equal(Number(audit[0].threshold_pct), 90);
  assert.equal(audit[0].agent_id, "AG01");
});

dbTest("overlap is computed on plot area, not baseline area", async (client) => {
  // T_IN is small and fully inside a larger baseline: 100% of the plot, but only ~36% of the baseline.
  const result = await runSatelliteCheck(client, "T_IN", "SYSTEM", 90);
  assert.equal(result.overlapPercent, 100);
});

dbTest("region without a baseline is pending: status kept, no audit row", async (client) => {
  const result = await runSatelliteCheck(client, "T_NOB", "SYSTEM", 90);
  assert.equal(result.checked, false);
  assert.equal(result.status, "Clean");
  assert.equal(result.overlapPercent, null);
  assert.match(result.reason, /No satellite baseline for region 'NOB'/);
  assert.equal((await auditRows(client, "T_NOB")).length, 0);
});

dbTest("re-check with a newer baseline flips Flagged to Clean and appends a second audit row", async (client) => {
  await runSatelliteCheck(client, "T_HALF", "SYSTEM", 90);
  await client.query(
    `INSERT INTO satellite_baseline (source_id, region_code, baseline_date, geom)
     SELECT source_id, 'TST', '2021-12-31', ST_MakeEnvelope(-2.601, 6.699, -2.598, 6.702, 4326)
       FROM satellite_baseline WHERE region_code = 'TST' LIMIT 1`);
  const result = await runSatelliteCheck(client, "T_HALF", "SYSTEM", 90);
  assert.equal(result.status, "Clean");
  assert.equal(result.previousStatus, "Flagged");
  const audit = await auditRows(client, "T_HALF");
  assert.deepEqual(audit.map((a) => [a.previous_status, a.new_status]), [["Clean", "Flagged"], ["Flagged", "Clean"]]);
});

dbTest("a status set by a reviewer (Cleared) is not overwritten", async (client) => {
  const result = await runSatelliteCheck(client, "T_CLR", "SYSTEM", 90);
  assert.equal(result.status, "Cleared");
  assert.equal(result.statusChanged, false);
  assert.match(result.reason, /Status kept as 'Cleared'/);
  const audit = await auditRows(client, "T_CLR"); // the check is logged, but the status is not changed
  assert.equal(audit.length, 1);
  assert.equal(audit[0].previous_status, "Cleared");
  assert.equal(audit[0].new_status, "Cleared");
  const { rows } = await client.query("SELECT count(*)::int AS n FROM plot_overlap_result WHERE plot_id = 'T_CLR'");
  assert.equal(rows[0].n, 1); // overlap result is still stored
});

dbTest("overlap view shows the threshold that was used, even after the config changes", async (client) => {
  await runSatelliteCheck(client, "T_HALF", "SYSTEM", 90);
  const view = await getOverlap(client, "T_HALF", 40); // config is now 40%
  assert.equal(view.status, "Flagged");
  assert.equal(view.thresholdPercent, 90);              // still 90: the value used for this status
  assert.equal(view.checked, true);
  assert.match(view.reason!, /below the 90% threshold/);
  assert.ok(view.checkedAt);
});

dbTest("overlap view for a plot that was never checked", async (client) => {
  const view = await getOverlap(client, "T_IN", 90);
  assert.equal(view.checked, false);
  assert.equal(view.overlapPercent, null);
  assert.equal(view.thresholdPercent, 90);
});

/** Adds a plot in its own region with its own baseline geometry (SQL expression). */
async function plotWithBaseline(client: pg.PoolClient, id: string, plotGeom: string, baseGeom: string, date = "2020-12-31") {
  await client.query(
    `INSERT INTO satellite_baseline (source_id, region_code, baseline_date, geom)
     SELECT source_id, $1, $2, ${baseGeom} FROM satellite_baseline WHERE region_code = 'TST' LIMIT 1`,
    [id, date]);
  await client.query(`INSERT INTO plots (plot_id, region_code, boundary) VALUES ($1, $1, ${plotGeom})`, [id]);
}

const PLOT = "ST_MakeEnvelope(-2.600, 6.700, -2.599, 6.701, 4326)";
const strip = (x0: number, x1: number) => `ST_MakeEnvelope(${x0}, 6.699, ${x1}, 6.702, 4326)`;

dbTest("multi-part baseline (like JRC after ST_Union) adds up all parts", async (client) => {
  // Two strips cover the left 30% and right 30% of the plot -> 60%
  await plotWithBaseline(client, "T_MULTI", PLOT,
    `ST_Multi(ST_Union(${strip(-2.6005, -2.5997)}, ${strip(-2.5993, -2.5985)}))`);
  const result = await runSatelliteCheck(client, "T_MULTI", "SYSTEM", 90);
  assert.ok(Math.abs(result.overlapPercent! - 60) < 0.5, `got ${result.overlapPercent}`);
  assert.equal(result.status, "Flagged");
});

dbTest("forest hole inside the baseline is not counted", async (client) => {
  // Baseline covers the plot, minus a forest patch over the middle 50%
  await plotWithBaseline(client, "T_HOLE", PLOT,
    `ST_Difference(ST_MakeEnvelope(-2.601, 6.699, -2.598, 6.702, 4326), ${strip(-2.59975, -2.59925)})`);
  const result = await runSatelliteCheck(client, "T_HOLE", "SYSTEM", 90);
  assert.ok(Math.abs(result.overlapPercent! - 50) < 0.5, `got ${result.overlapPercent}`);
  assert.equal(result.status, "Flagged");
});

dbTest("the newest baseline for the region is used", async (client) => {
  await plotWithBaseline(client, "T_NEW", PLOT, "ST_MakeEnvelope(-2.601, 6.699, -2.598, 6.702, 4326)", "2019-12-31");
  await plotWithBaseline(client, "T_NEW2", PLOT, PLOT); // unrelated region, ignored
  await client.query(
    `INSERT INTO satellite_baseline (source_id, region_code, baseline_date, geom)
     SELECT source_id, 'T_NEW', '2020-12-31', ${strip(-2.6005, -2.5995)} FROM satellite_baseline LIMIT 1`);
  const result = await runSatelliteCheck(client, "T_NEW", "SYSTEM", 90);
  assert.ok(Math.abs(result.overlapPercent! - 50) < 0.5, `newer half baseline expected, got ${result.overlapPercent}`);
  const { rows } = await client.query(
    "SELECT baseline_date::text AS d FROM satellite_baseline WHERE id = $1", [result.baselineId]);
  assert.equal(rows[0].d, "2020-12-31");
});

dbTest("plot that only touches the baseline edge has 0% overlap", async (client) => {
  await plotWithBaseline(client, "T_EDGE", PLOT, "ST_MakeEnvelope(-2.599, 6.700, -2.598, 6.701, 4326)");
  const result = await runSatelliteCheck(client, "T_EDGE", "SYSTEM", 90);
  assert.equal(result.overlapPercent, 0);
  assert.equal(result.status, "Flagged");
});

dbTest("agent defaults to SYSTEM in the audit row", async (client) => {
  await runSatelliteCheck(client, "T_HALF", undefined, 90);
  assert.equal((await auditRows(client, "T_HALF"))[0].agent_id, "SYSTEM");
});

dbTest("a different threshold changes the decision for new checks", async (client) => {
  const result = await runSatelliteCheck(client, "T_HALF", "SYSTEM", 40); // 50% >= 40%
  assert.equal(result.status, "Clean");
  assert.equal(Number((await auditRows(client, "T_HALF"))[0].threshold_pct), 40);
});

dbTest("checking twice with the same result keeps the status and adds a second audit row", async (client) => {
  await runSatelliteCheck(client, "T_HALF", "SYSTEM", 90);
  const second = await runSatelliteCheck(client, "T_HALF", "SYSTEM", 90);
  assert.equal(second.status, "Flagged");
  assert.equal(second.statusChanged, false);
  const audit = await auditRows(client, "T_HALF");
  assert.deepEqual(audit.map((a) => [a.previous_status, a.new_status]), [["Clean", "Flagged"], ["Flagged", "Flagged"]]);
});

dbTest("audit rows written by the check cannot be edited or deleted", async (client) => {
  await runSatelliteCheck(client, "T_HALF", "SYSTEM", 90);
  await client.query("SAVEPOINT s1");
  await assert.rejects(client.query("UPDATE flag_audit SET flag_reason = 'edited' WHERE plot_id = 'T_HALF'"), /append-only/);
  await client.query("ROLLBACK TO SAVEPOINT s1");
  await assert.rejects(client.query("DELETE FROM flag_audit WHERE plot_id = 'T_HALF'"), /append-only/);
});

dbTest("unknown plot raises PlotNotFoundError", async (client) => {
  await assert.rejects(runSatelliteCheck(client, "NOPE", "SYSTEM", 90), PlotNotFoundError);
  await assert.rejects(getOverlap(client, "NOPE", 90), PlotNotFoundError);
});
