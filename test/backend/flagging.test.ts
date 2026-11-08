import assert from "node:assert/strict";
import test from "node:test";
import { currentThreshold, decideStatus, flagReason, roundPercent, ruleText } from "../../src/backend/flagging.ts";

test("rule at the default 90% threshold", () => {
  const cases: Array<[number | null, string | null]> = [
    [0, "Flagged"], [89.9, "Flagged"], [89.99, "Flagged"],
    [89.996, "Flagged"], // would round to 90.00, but the exact value is below 90
    [90, "Clean"], [90.1, "Clean"], [100, "Clean"],
    [null, null],        // no baseline -> pending, status not changed
  ];
  for (const [overlap, expected] of cases) {
    assert.equal(decideStatus(overlap, 90), expected, `overlap ${overlap}`);
  }
});

test("threshold is configurable", () => {
  assert.equal(decideStatus(85, 80), "Clean");
  assert.equal(decideStatus(85, 95), "Flagged");
});

test("threshold config defaults to 90 and reads OVERLAP_THRESHOLD_PERCENT", () => {
  assert.equal(currentThreshold({}), 90);
  assert.equal(currentThreshold({ OVERLAP_THRESHOLD_PERCENT: "" }), 90);
  assert.equal(currentThreshold({ OVERLAP_THRESHOLD_PERCENT: "85" }), 85);
  assert.equal(currentThreshold({ OVERLAP_THRESHOLD_PERCENT: "0" }), 0);
  assert.equal(currentThreshold({ OVERLAP_THRESHOLD_PERCENT: "100" }), 100);
});

test("invalid threshold config is rejected", () => {
  for (const bad of ["150", "-1", "abc", "NaN"]) {
    assert.throws(() => currentThreshold({ OVERLAP_THRESHOLD_PERCENT: bad }), /0 to 100/, bad);
  }
});

test("rounding is only for storage and display", () => {
  assert.equal(roundPercent(89.996), 90);
  assert.equal(roundPercent(49.994), 49.99);
});

test("reason and rule text", () => {
  assert.equal(flagReason("Flagged", 50, 90, 3), "Overlap 50% is below the 90% threshold (baseline #3)");
  assert.equal(flagReason("Clean", 100, 90, 3), "Overlap 100% meets the 90% threshold (baseline #3)");
  assert.match(ruleText(90), /overlap < 90% -> Flagged/);
});
