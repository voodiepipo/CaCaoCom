import assert from "node:assert/strict";
import test, { after } from "node:test";
import { pool } from "../../src/db/pool.ts";
import type { PoolClient } from "pg";
import { assignPlot } from "../../src/application/assignPlot.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../src/application/errors.ts";

const skip = process.env.RUN_DB_TESTS ? false : "set RUN_DB_TESTS=1 with PostgreSQL running";

after(async () => { await pool.end(); });

async function inRollback(work: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO app_user (user_id, full_name, role) VALUES
       ('T-MGR', 'Test Manager', 'manager'), ('T-ADM', 'Test Admin', 'admin'),
       ('T-AG1', 'Test Agent 1', 'agent'), ('T-AG2', 'Test Agent 2', 'agent')`,
    );
    await client.query("UPDATE plots SET status = 'Flagged' WHERE plot_id = 'P002'");
    await work(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

test("manager and admin can assign a flagged plot", { skip }, async () => {
  await inRollback(async (client) => {
    const byManager = await assignPlot(client, { plotId: "P002", agentId: "T-AG1", actorId: "T-MGR" });
    assert.equal(byManager.changed, true);
    assert.equal(byManager.previousAgentId, null);
    const byAdmin = await assignPlot(client, { plotId: "P002", agentId: "T-AG2", actorId: "T-ADM" });
    assert.equal(byAdmin.previousAgentId, "T-AG1");
  });
});

test("a field agent cannot assign plots", { skip }, async () => {
  await inRollback(async (client) => {
    await assert.rejects(
      assignPlot(client, { plotId: "P002", agentId: "T-AG1", actorId: "T-AG2" }),
      ForbiddenError,
    );
    await assert.rejects(
      assignPlot(client, { plotId: "P002", agentId: "T-AG1", actorId: "UNKNOWN" }),
      ForbiddenError,
    );
  });
});

test("only conflicted plots can be assigned", { skip }, async () => {
  await inRollback(async (client) => {
    await client.query("UPDATE plots SET status = 'Clean' WHERE plot_id = 'P002'");
    await assert.rejects(
      assignPlot(client, { plotId: "P002", agentId: "T-AG1", actorId: "T-MGR" }),
      ConflictError,
    );
    await client.query("UPDATE plots SET status = 'Mismatch' WHERE plot_id = 'P002'");
    const result = await assignPlot(client, { plotId: "P002", agentId: "T-AG1", actorId: "T-MGR" });
    assert.equal(result.changed, true);
  });
});

test("the assignee must be an active field agent", { skip }, async () => {
  await inRollback(async (client) => {
    await assert.rejects(
      assignPlot(client, { plotId: "P002", agentId: "T-MGR", actorId: "T-ADM" }),
      ConflictError,
    );
    await assert.rejects(
      assignPlot(client, { plotId: "P002", agentId: "NOPE", actorId: "T-ADM" }),
      NotFoundError,
    );
    await client.query("UPDATE app_user SET active = false WHERE user_id = 'T-AG1'");
    await assert.rejects(
      assignPlot(client, { plotId: "P002", agentId: "T-AG1", actorId: "T-ADM" }),
      ConflictError,
    );
  });
});

test("reassigning keeps history and one current assignee", { skip }, async () => {
  await inRollback(async (client) => {
    await assignPlot(client, { plotId: "P002", agentId: "T-AG1", actorId: "T-MGR" });
    const same = await assignPlot(client, { plotId: "P002", agentId: "T-AG1", actorId: "T-MGR" });
    assert.equal(same.changed, false);
    await assignPlot(client, { plotId: "P002", agentId: "T-AG2", actorId: "T-MGR" });

    const open = await client.query(
      "SELECT agent_id FROM plot_assignment WHERE plot_id = 'P002' AND unassigned_at IS NULL",
    );
    assert.equal(open.rows.length, 1);
    assert.equal(open.rows[0].agent_id, "T-AG2");
    const all = await client.query("SELECT count(*) AS n FROM plot_assignment WHERE plot_id = 'P002'");
    assert.equal(Number(all.rows[0].n), 2);
  });
});