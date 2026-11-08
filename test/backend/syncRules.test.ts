import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCKED_STATUSES, MAX_BATCH_SIZE, resolveSync, sameValue, validateChange,
  type IncomingChange, type ServerRecord,
} from "../../src/backend/syncRules.ts";

const ID = "6f1c2a0e-6c0b-4c1e-9a43-2b0f6a1d9e11";
const server = (values: Record<string, unknown>, version = 3, status = "Clean"): ServerRecord => ({ version, status, values });
const update = (baseVersion: number, baseValues: Record<string, unknown>, changes: Record<string, unknown>): IncomingChange =>
  ({ clientId: ID, op: "update", baseVersion, baseValues, changes });
const create = (changes: Record<string, unknown>): IncomingChange =>
  ({ clientId: ID, op: "create", baseVersion: null, baseValues: {}, changes });

// ---- Rule 1: create ----
test("create a new record -> insert", () => {
  assert.deepEqual(resolveSync(null, create({ landAreaHa: 2 })), { action: "insert" });
});

test("create sent twice with the same values (retry) -> duplicate", () => {
  assert.deepEqual(resolveSync(server({ landAreaHa: 2 }, 1), create({ landAreaHa: 2 })), { action: "duplicate" });
});

test("create with an existing clientId but different values -> conflict", () => {
  assert.deepEqual(resolveSync(server({ landAreaHa: 2 }, 1), create({ landAreaHa: 3 })),
    { action: "conflict", fields: ["landAreaHa"] });
});

// ---- Rules 2-4: reject ----
test("update for a record the server never saw -> reject", () => {
  const d = resolveSync(null, update(1, { notes: "a" }, { notes: "b" }));
  assert.equal(d.action, "reject");
  assert.match((d as { reason: string }).reason, /Send its create first/);
});

test("delete from the field app -> reject", () => {
  const d = resolveSync(server({}), { clientId: ID, op: "delete", baseVersion: 3, baseValues: {}, changes: {} });
  assert.equal(d.action, "reject");
  assert.match((d as { reason: string }).reason, /cannot be deleted/);
});

test("plot locked by a reviewer -> reject, even if versions match", () => {
  for (const status of LOCKED_STATUSES) {
    const d = resolveSync(server({ notes: "a" }, 3, status), update(3, { notes: "a" }, { notes: "b" }));
    assert.equal(d.action, "reject", status);
    assert.match((d as { reason: string }).reason, new RegExp(status));
  }
});

test("Flagged and Clean plots are not locked", () => {
  for (const status of ["Clean", "Flagged", "Mismatch"]) {
    assert.equal(resolveSync(server({ notes: "a" }, 3, status), update(3, { notes: "a" }, { notes: "b" })).action, "apply");
  }
});

// ---- Rule 5: duplicate ----
test("update already saved (retry after a lost reply) -> duplicate", () => {
  assert.deepEqual(resolveSync(server({ notes: "b" }, 4), update(3, { notes: "a" }, { notes: "b" })), { action: "duplicate" });
});

// ---- Rule 6: apply ----
test("no one else changed it -> apply all fields", () => {
  assert.deepEqual(resolveSync(server({ notes: "a", landAreaHa: 2 }), update(3, { notes: "a", landAreaHa: 2 }, { notes: "b", landAreaHa: 3 })),
    { action: "apply", fields: ["notes", "landAreaHa"] });
});

// ---- Rule 7: 3-way merge ----
test("someone else changed a different field -> apply mine", () => {
  // server v4 changed notes; phone (saw v3) changed landAreaHa
  const s = server({ notes: "fence moved", landAreaHa: 2.5 }, 4);
  assert.deepEqual(resolveSync(s, update(3, { landAreaHa: 2.5 }, { landAreaHa: 2.8 })), { action: "apply", fields: ["landAreaHa"] });
});

test("both changed the same field to different values -> conflict, nothing saved", () => {
  const s = server({ notes: "fence moved", landAreaHa: 2.5 }, 4);
  const d = resolveSync(s, update(3, { notes: "ok", landAreaHa: 2.5 }, { notes: "new fence", landAreaHa: 2.8 }));
  assert.deepEqual(d, { action: "conflict", fields: ["notes"] }); // landAreaHa is NOT applied (all-or-nothing)
});

test("both changed the same field to the same value -> apply only what is still different", () => {
  const s = server({ notes: "new fence", landAreaHa: 2.5 }, 4);
  assert.deepEqual(resolveSync(s, update(3, { notes: "ok", landAreaHa: 2.5 }, { notes: "new fence", landAreaHa: 2.8 })),
    { action: "apply", fields: ["landAreaHa"] });
});

test("boundary (GeoJSON) is compared by value, not by key order", () => {
  const ring = [[-2.6, 6.7], [-2.599, 6.7], [-2.599, 6.701], [-2.6, 6.7]];
  const s = server({ boundary: { type: "Polygon", coordinates: [ring] } }, 4);
  const d = resolveSync(s, update(3, { boundary: { coordinates: [ring], type: "Polygon" } },
    { boundary: { type: "Polygon", coordinates: [[[-2.6, 6.7], [-2.598, 6.7], [-2.598, 6.701], [-2.6, 6.7]]] } }));
  assert.equal(d.action, "apply"); // server boundary equals what the phone saw, only key order differs
});

test("sameValue handles nested objects, arrays and primitives", () => {
  assert.ok(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }));
  assert.ok(!sameValue([1, 2], [2, 1]));
  assert.ok(!sameValue(1, "1"));
  assert.ok(!sameValue(undefined, null));
});

// ---- Validation ----
test("valid changes pass validation", () => {
  assert.equal(validateChange(create({ landAreaHa: 2 })), null);
  assert.equal(validateChange(update(3, { notes: "a" }, { notes: "b" })), null);
});

test("invalid changes are rejected with a clear message", () => {
  const cases: Array<[unknown, RegExp]> = [
    [null, /must be an object/],
    [{ ...create({}), clientId: "abc" }, /UUID/],
    [{ ...create({}), op: "upsert" }, /op must be/],
    [{ ...create({}), changes: [] }, /changes must be an object/],
    [{ ...create({}), baseVersion: 1 }, /null for create/],
    [update(0, { notes: "a" }, { notes: "b" }), /positive integer/],
    [update(3, {}, {}), /at least one field/],
    [update(3, {}, { notes: "b" }), /baseValues is missing: notes/],
  ];
  for (const [change, message] of cases) assert.match(validateChange(change)!, message);
});

test("batch size limit is 50", () => {
  assert.equal(MAX_BATCH_SIZE, 50);
});
