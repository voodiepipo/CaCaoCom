/**
 * Polygon overlap utilities for simple, planar polygons (no holes).
 * Coordinates must use a projected coordinate system when areas are expected
 * in square metres; longitude/latitude coordinates are not area preserving.
 */

export type Point = readonly [x: number, y: number];
export type Polygon = readonly Point[];

export interface OverlapResult {
  intersectionArea: number;
  /** Intersection area divided by the first polygon's area, in [0, 1]. */
  percentageOfFirst: number;
  /** Intersection area divided by the second polygon's area, in [0, 1]. */
  percentageOfSecond: number;
  /** Intersection divided by the union area, in [0, 1]. */
  intersectionOverUnion: number;
}

export type BaselineReviewStatus = "matched" | "flagged";

export interface BaselineComparison {
  intersectionArea: number;
  /** Intersection area divided by the newly digitized field plot's area. */
  percentageOfNewPlot: number;
  /** Intersection area divided by the stored baseline plot's area. */
  percentageOfBaseline: number;
  intersectionOverUnion: number;
  /** Whether the new field mark meets the baseline coverage requirement. */
  status: BaselineReviewStatus;
  minimumBaselineOverlap: number;
}

type Triangle = [Point, Point, Point];
const EPSILON = 1e-10;

function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function signedArea(ring: Polygon): number {
  let twiceArea = 0;
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function normalize(polygon: Polygon): Point[] {
  if (!Array.isArray(polygon)) throw new TypeError("Polygon must be an array of points");
  const ring = polygon.map((point) => {
    if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new TypeError("Each point must contain two finite coordinates");
    }
    return [point[0], point[1]] as Point;
  });
  if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  if (ring.length < 3) throw new RangeError("A polygon needs at least three distinct vertices");
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (a[0] === b[0] && a[1] === b[1]) throw new RangeError("Polygon has consecutive duplicate vertices");
  }
  const area = signedArea(ring);
  if (Math.abs(area) <= EPSILON) throw new RangeError("Polygon area must be greater than zero");
  return area < 0 ? ring.reverse() : ring;
}

function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  return cross(a, b, p) >= -EPSILON && cross(b, c, p) >= -EPSILON && cross(c, a, p) >= -EPSILON;
}

/** Ear-clips a simple ring into non-overlapping triangles. */
function triangulate(ring: Point[]): Triangle[] {
  const remaining = ring.map((_, index) => index);
  const triangles: Triangle[] = [];
  let attempts = 0;
  while (remaining.length > 3) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const prev = remaining[(i - 1 + remaining.length) % remaining.length];
      const curr = remaining[i];
      const next = remaining[(i + 1) % remaining.length];
      const a = ring[prev], b = ring[curr], c = ring[next];
      if (cross(a, b, c) <= EPSILON) continue;
      if (remaining.some((index) => index !== prev && index !== curr && index !== next && pointInTriangle(ring[index], a, b, c))) continue;
      triangles.push([a, b, c]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped || ++attempts > ring.length * ring.length) {
      throw new RangeError("Polygon must be a simple ring without self-intersections or degeneracies");
    }
  }
  triangles.push([ring[remaining[0]], ring[remaining[1]], ring[remaining[2]]]);
  return triangles;
}

function lineIntersection(s: Point, e: Point, a: Point, b: Point): Point {
  const dx1 = e[0] - s[0], dy1 = e[1] - s[1];
  const dx2 = b[0] - a[0], dy2 = b[1] - a[1];
  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) <= EPSILON) return e;
  const t = ((a[0] - s[0]) * dy2 - (a[1] - s[1]) * dx2) / denominator;
  return [s[0] + t * dx1, s[1] + t * dy1];
}

/** Clips one convex polygon against another using Sutherland-Hodgman. */
function intersectConvex(subject: Polygon, clip: Polygon): Point[] {
  let output = [...subject];
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    let previous = input[input.length - 1];
    for (const current of input) {
      const currentInside = cross(a, b, current) >= -EPSILON;
      const previousInside = cross(a, b, previous) >= -EPSILON;
      if (currentInside) {
        if (!previousInside) output.push(lineIntersection(previous, current, a, b));
        output.push(current);
      } else if (previousInside) output.push(lineIntersection(previous, current, a, b));
      previous = current;
    }
  }
  return output;
}

/** Calculates exact planar intersection area for two simple polygon rings. */
export function calculatePolygonOverlap(first: Polygon, second: Polygon): OverlapResult {
  const a = normalize(first), b = normalize(second);
  const areaA = Math.abs(signedArea(a)), areaB = Math.abs(signedArea(b));
  const trianglesA = triangulate(a), trianglesB = triangulate(b);
  let intersectionArea = 0;
  for (const triangleA of trianglesA) {
    for (const triangleB of trianglesB) {
      const intersection = intersectConvex(triangleA, triangleB);
      if (intersection.length >= 3) intersectionArea += Math.abs(signedArea(intersection));
    }
  }
  // Remove tiny floating point residue from edge-only contact.
  if (intersectionArea <= EPSILON * Math.max(areaA, areaB, 1)) intersectionArea = 0;
  const unionArea = areaA + areaB - intersectionArea;
  return {
    intersectionArea,
    percentageOfFirst: intersectionArea / areaA,
    percentageOfSecond: intersectionArea / areaB,
    intersectionOverUnion: unionArea === 0 ? 0 : intersectionArea / unionArea,
  };
}

/**
 * Compares a field agent's newly digitized plot with the stored baseline.
 * Status uses intersection / baseline area, so a new mark covering less than
 * the requested share of the reference plot is flagged for review. The default
 * threshold is 90%; pass a different value (0..1) when the project policy differs.
 */
export function compareNewPlotWithBaseline(
  newPlot: Polygon,
  baseline: Polygon,
  minimumBaselineOverlap = 0.9,
): BaselineComparison {
  if (!Number.isFinite(minimumBaselineOverlap) || minimumBaselineOverlap < 0 || minimumBaselineOverlap > 1) {
    throw new RangeError("minimumBaselineOverlap must be between 0 and 1");
  }
  const overlap = calculatePolygonOverlap(newPlot, baseline);
  return {
    intersectionArea: overlap.intersectionArea,
    percentageOfNewPlot: overlap.percentageOfFirst,
    percentageOfBaseline: overlap.percentageOfSecond,
    intersectionOverUnion: overlap.intersectionOverUnion,
    status: overlap.percentageOfSecond >= minimumBaselineOverlap ? "matched" : "flagged",
    minimumBaselineOverlap,
  };
}
