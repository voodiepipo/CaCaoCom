import assert from "node:assert/strict";
import test from "node:test";
import { calculatePolygonOverlap, compareNewPlotWithBaseline, type Polygon } from "../../src/geometry/polygonOverlap.ts";

const plotA: Polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];

test("identical plots are fully overlapped regardless of ring winding or closure", () => {
  const result = calculatePolygonOverlap(plotA, [[0, 10], [10, 10], [10, 0], [0, 0], [0, 10]]);
  assert.equal(result.intersectionArea, 100);
  assert.equal(result.percentageOfFirst, 1);
  assert.equal(result.percentageOfSecond, 1);
  assert.equal(result.intersectionOverUnion, 1);
});

test("computes partial overlap area and percentages", () => {
  const result = calculatePolygonOverlap(plotA, [[5, 0], [15, 0], [15, 10], [5, 10]]);
  assert.equal(result.intersectionArea, 50);
  assert.equal(result.percentageOfFirst, 0.5);
  assert.equal(result.percentageOfSecond, 0.5);
  assert.equal(result.intersectionOverUnion, 1 / 3);
});

test("returns zero when plots are disjoint", () => {
  const result = calculatePolygonOverlap(plotA, [[20, 0], [30, 0], [30, 10], [20, 10]]);
  assert.equal(result.intersectionArea, 0);
  assert.equal(result.percentageOfFirst, 0);
  assert.equal(result.percentageOfSecond, 0);
});

test("edge and point contact have zero overlap area", () => {
  const edgeTouch = calculatePolygonOverlap(plotA, [[10, 0], [20, 0], [20, 10], [10, 10]]);
  const pointTouch = calculatePolygonOverlap(plotA, [[10, 10], [20, 10], [20, 20], [10, 20]]);
  assert.equal(edgeTouch.intersectionArea, 0);
  assert.equal(pointTouch.intersectionArea, 0);
});

test("handles a concave plot and a contained plot", () => {
  const concave: Polygon = [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]];
  const contained: Polygon = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]];
  const result = calculatePolygonOverlap(concave, contained);
  assert.equal(result.intersectionArea, 1);
  assert.equal(result.percentageOfFirst, 1 / 20);
  assert.equal(result.percentageOfSecond, 1);
});

test("compares a field digitization against its baseline using 90% baseline coverage", () => {
  const baseline: Polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const accepted = compareNewPlotWithBaseline([[0, 0], [9, 0], [9, 10], [0, 10]], baseline);
  const flagged = compareNewPlotWithBaseline([[0, 0], [8.9, 0], [8.9, 10], [0, 10]], baseline);
  assert.equal(accepted.percentageOfBaseline, 0.9);
  assert.equal(accepted.percentageOfNewPlot, 1);
  assert.equal(accepted.status, "matched");
  assert.equal(flagged.percentageOfBaseline, 0.89);
  assert.equal(flagged.status, "flagged");
});

test("baseline review threshold can be configured and is validated", () => {
  const result = compareNewPlotWithBaseline([[0, 0], [8, 0], [8, 10], [0, 10]], plotA, 0.8);
  assert.equal(result.status, "matched");
  assert.throws(() => compareNewPlotWithBaseline(plotA, plotA, 1.1), /between 0 and 1/);
});

test("rejects invalid or degenerate polygon input", () => {
  assert.throws(() => calculatePolygonOverlap([[0, 0], [1, 1]], plotA), /at least three/);
  assert.throws(() => calculatePolygonOverlap([[0, 0], [1, 0], [2, 0]], plotA), /greater than zero/);
  assert.throws(() => calculatePolygonOverlap([[0, 0], [1, Number.NaN], [0, 1]], plotA), /finite coordinates/);
});
