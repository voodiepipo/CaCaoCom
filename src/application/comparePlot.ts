import {
  compareNewPlotWithBaseline,
  type BaselineComparison,
  type Polygon,
} from "../geometry/polygonOverlap.ts";

/** Application service shared by HTTP handlers and other adapters. */
export function comparePlotWithBaseline(
  newPlot: Polygon,
  baseline: Polygon,
  minimumBaselineOverlap = 0.9,
): BaselineComparison {
  return compareNewPlotWithBaseline(newPlot, baseline, minimumBaselineOverlap);
}
