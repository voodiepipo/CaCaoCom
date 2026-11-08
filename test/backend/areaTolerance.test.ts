import assert from "node:assert/strict";
import test from "node:test";
import {
  areaToleranceRuleText, areaVariancePercent, currentAreaTolerance, isAreaMismatch,
} from "../../src/backend/areaTolerance.ts";

test("default tolerance is 10% and reads AREA_TOLERANCE_PCT", () => {
  assert.equal(currentAreaTolerance({}), 10);
  assert.equal(currentAreaTolerance({ AREA_TOLERANCE_PCT: "" }), 10);
  assert.equal(currentAreaTolerance({ AREA_TOLERANCE_PCT: "5" }), 5);
  assert.equal(currentAreaTolerance({ AREA_TOLERANCE_PCT: "0" }), 0);
});

test("invalid tolerance config is rejected", () => {
  for (const bad of ["-1", "101", "abc"]) {
    assert.throws(() => currentAreaTolerance({ AREA_TOLERANCE_PCT: bad }), /0 to 100/, bad);
  }
});

test("variance is relative to the legacy area, bigger or smaller", () => {
  assert.equal(areaVariancePercent(11, 10), 10);
  assert.equal(areaVariancePercent(9, 10), 10);
  assert.equal(areaVariancePercent(10, 10), 0);
  assert.equal(areaVariancePercent(0, 10), 100);
});

test("mismatch rule at the 10% boundary", () => {
  assert.equal(isAreaMismatch(10, 10, 10), false);   // 0%
  assert.equal(isAreaMismatch(10.9, 10, 10), false); // 9%
  assert.equal(isAreaMismatch(11, 10, 10), false);   // exactly 10% -> OK
  assert.equal(isAreaMismatch(11.01, 10, 10), true); // 10.1% -> Mismatch
  assert.equal(isAreaMismatch(8.5, 10, 10), true);   // 15% smaller -> Mismatch
});

test("decimal areas exactly at the tolerance are OK (no floating point noise)", () => {
  assert.equal(areaVariancePercent(2.2, 2), 10);
  assert.equal(isAreaMismatch(2.2, 2, 10), false);
  assert.equal(isAreaMismatch(1.8, 2, 10), false);
  assert.equal(isAreaMismatch(0.33, 0.3, 10), false);
});

test("tolerance is configurable", () => {
  assert.equal(isAreaMismatch(10.6, 10, 5), true);
  assert.equal(isAreaMismatch(10.6, 10, 20), false);
});

test("invalid areas are rejected", () => {
  assert.throws(() => areaVariancePercent(5, 0), /Legacy area/);
  assert.throws(() => areaVariancePercent(5, -1), /Legacy area/);
  assert.throws(() => areaVariancePercent(-1, 10), /New area/);
  assert.throws(() => areaVariancePercent(Number.NaN, 10), /New area/);
});

test("rule text", () => {
  assert.match(areaToleranceRuleText(10), /> 10% -> Mismatch/);
});
