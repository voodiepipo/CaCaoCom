   import assert from "node:assert/strict";
   import test, { after } from "node:test";
   import { pool } from "../../src/db/pool.ts";
   import { recordFlagAudit } from "../../src/db/flagAudit.ts";

   const skip = process.env.RUN_DB_TESTS ? false : "set RUN_DB_TESTS=1 with PostgreSQL running";

   const entry = {
     plotId: "P001", overlapPct: 85, thresholdPct: 90,
     reason: "Overlap below 90% threshold",
     previousStatus: "Clean" as const, newStatus: "Flagged" as const,
   };

   after(async () => { await pool.end(); });

   test("saves a flag audit row with agent and timestamp", { skip }, async () => {
     const client = await pool.connect();
     try {
       await client.query("BEGIN");
       const id = await recordFlagAudit(entry, client);
       const { rows } = await client.query("SELECT * FROM flag_audit WHERE id = $1", [id]);
       assert.equal(rows[0].plot_id, "P001");
       assert.equal(Number(rows[0].overlap_pct), 85);
       assert.equal(rows[0].new_status, "Flagged");
       assert.equal(rows[0].agent_id, "SYSTEM");
       assert.ok(rows[0].created_at);
     } finally {
       await client.query("ROLLBACK");
       client.release();
     }
   });

   test("flag_audit rows cannot be changed", { skip }, async () => {
     const client = await pool.connect();
     try {
       await client.query("BEGIN");
       await recordFlagAudit(entry, client);
       await assert.rejects(client.query("UPDATE flag_audit SET flag_reason = 'x'"), /append-only/);
     } finally {
       await client.query("ROLLBACK");
       client.release();
     }
   });