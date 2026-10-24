// Dart port of src/geometry/polygonOverlap.ts (story 009.1) so the field app
// can pre-check a plot while offline. Keep both versions in step.
//
// Polygons are simple planar rings (no holes). Use projected coordinates
// (see geo_projection.dart) when areas must be in square metres.

import 'dart:math' as math;

typedef Point = (double x, double y);
typedef Polygon = List<Point>;

class OverlapResult {
  const OverlapResult({
    required this.intersectionArea,
    required this.percentageOfFirst,
    required this.percentageOfSecond,
    required this.intersectionOverUnion,
  });

  final double intersectionArea;

  /// Intersection area divided by the first polygon's area, in [0, 1].
  final double percentageOfFirst;

  /// Intersection area divided by the second polygon's area, in [0, 1].
  final double percentageOfSecond;

  /// Intersection divided by the union area, in [0, 1].
  final double intersectionOverUnion;
}

/// Thrown for polygons that are degenerate or not simple. Mirrors RangeError
/// in the TypeScript version.
class InvalidPolygonException implements Exception {
  const InvalidPolygonException(this.message);
  final String message;
  @override
  String toString() => 'InvalidPolygonException: $message';
}

const double _epsilon = 1e-10;

double _cross(Point a, Point b, Point c) =>
    (b.$1 - a.$1) * (c.$2 - a.$2) - (b.$2 - a.$2) * (c.$1 - a.$1);

double signedArea(Polygon ring) {
  var twiceArea = 0.0;
  for (var i = 0; i < ring.length; i++) {
    final current = ring[i];
    final next = ring[(i + 1) % ring.length];
    twiceArea += current.$1 * next.$2 - next.$1 * current.$2;
  }
  return twiceArea / 2;
}

/// Planar area of a simple ring (absolute value).
double polygonArea(Polygon polygon) => signedArea(_normalize(polygon)).abs();

List<Point> _normalize(Polygon polygon) {
  final ring = <Point>[];
  for (final p in polygon) {
    if (!p.$1.isFinite || !p.$2.isFinite) {
      throw const InvalidPolygonException('Each point must contain two finite coordinates');
    }
    ring.add(p);
  }
  if (ring.length > 1 && ring.first == ring.last) ring.removeLast();
  if (ring.length < 3) {
    throw const InvalidPolygonException('A polygon needs at least three distinct vertices');
  }
  for (var i = 0; i < ring.length; i++) {
    if (ring[i] == ring[(i + 1) % ring.length]) {
      throw const InvalidPolygonException('Polygon has consecutive duplicate vertices');
    }
  }
  final area = signedArea(ring);
  if (area.abs() <= _epsilon) {
    throw const InvalidPolygonException('Polygon area must be greater than zero');
  }
  return area < 0 ? ring.reversed.toList() : ring;
}

bool _pointInTriangle(Point p, Point a, Point b, Point c) =>
    _cross(a, b, p) >= -_epsilon && _cross(b, c, p) >= -_epsilon && _cross(c, a, p) >= -_epsilon;

/// Ear-clips a simple counter-clockwise ring into non-overlapping triangles.
List<List<Point>> _triangulate(List<Point> ring) {
  final remaining = List<int>.generate(ring.length, (i) => i);
  final triangles = <List<Point>>[];
  var attempts = 0;
  while (remaining.length > 3) {
    var clipped = false;
    for (var i = 0; i < remaining.length; i++) {
      final prev = remaining[(i - 1 + remaining.length) % remaining.length];
      final curr = remaining[i];
      final next = remaining[(i + 1) % remaining.length];
      final a = ring[prev], b = ring[curr], c = ring[next];
      if (_cross(a, b, c) <= _epsilon) continue;
      if (remaining.any((index) =>
          index != prev && index != curr && index != next && _pointInTriangle(ring[index], a, b, c))) {
        continue;
      }
      triangles.add([a, b, c]);
      remaining.removeAt(i);
      clipped = true;
      break;
    }
    if (!clipped || ++attempts > ring.length * ring.length) {
      throw const InvalidPolygonException(
          'Polygon must be a simple ring without self-intersections or degeneracies');
    }
  }
  triangles.add([ring[remaining[0]], ring[remaining[1]], ring[remaining[2]]]);
  return triangles;
}

Point _lineIntersection(Point s, Point e, Point a, Point b) {
  final dx1 = e.$1 - s.$1, dy1 = e.$2 - s.$2;
  final dx2 = b.$1 - a.$1, dy2 = b.$2 - a.$2;
  final denominator = dx1 * dy2 - dy1 * dx2;
  if (denominator.abs() <= _epsilon) return e;
  final t = ((a.$1 - s.$1) * dy2 - (a.$2 - s.$2) * dx2) / denominator;
  return (s.$1 + t * dx1, s.$2 + t * dy1);
}

/// Clips one convex polygon against another using Sutherland-Hodgman.
List<Point> _intersectConvex(List<Point> subject, List<Point> clip) {
  var output = [...subject];
  for (var i = 0; i < clip.length && output.isNotEmpty; i++) {
    final a = clip[i], b = clip[(i + 1) % clip.length];
    final input = output;
    output = [];
    var previous = input.last;
    for (final current in input) {
      final currentInside = _cross(a, b, current) >= -_epsilon;
      final previousInside = _cross(a, b, previous) >= -_epsilon;
      if (currentInside) {
        if (!previousInside) output.add(_lineIntersection(previous, current, a, b));
        output.add(current);
      } else if (previousInside) {
        output.add(_lineIntersection(previous, current, a, b));
      }
      previous = current;
    }
  }
  return output;
}

/// Calculates exact planar intersection area for two simple polygon rings.
OverlapResult calculatePolygonOverlap(Polygon first, Polygon second) {
  final a = _normalize(first), b = _normalize(second);
  final areaA = signedArea(a).abs(), areaB = signedArea(b).abs();
  final trianglesA = _triangulate(a), trianglesB = _triangulate(b);
  var intersectionArea = 0.0;
  for (final ta in trianglesA) {
    for (final tb in trianglesB) {
      final intersection = _intersectConvex(ta, tb);
      if (intersection.length >= 3) intersectionArea += signedArea(intersection).abs();
    }
  }
  // Remove tiny floating point residue from edge-only contact.
  if (intersectionArea <= _epsilon * math.max(math.max(areaA, areaB), 1)) intersectionArea = 0;
  final unionArea = areaA + areaB - intersectionArea;
  return OverlapResult(
    intersectionArea: intersectionArea,
    percentageOfFirst: intersectionArea / areaA,
    percentageOfSecond: intersectionArea / areaB,
    intersectionOverUnion: unionArea == 0 ? 0 : intersectionArea / unionArea,
  );
}
