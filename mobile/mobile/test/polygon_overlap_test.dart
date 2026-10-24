// Same cases as test/geometry/polygonOverlap.test.ts on the backend.
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/geometry/polygon_overlap.dart';

void main() {
  const Polygon plotA = [(0, 0), (10, 0), (10, 10), (0, 10)];

  test('identical plots fully overlap regardless of winding or closure', () {
    final r = calculatePolygonOverlap(plotA, [(0, 10), (10, 10), (10, 0), (0, 0), (0, 10)]);
    expect(r.intersectionArea, 100);
    expect(r.percentageOfFirst, 1);
    expect(r.intersectionOverUnion, 1);
  });

  test('partial overlap', () {
    final r = calculatePolygonOverlap(plotA, [(5, 0), (15, 0), (15, 10), (5, 10)]);
    expect(r.intersectionArea, 50);
    expect(r.percentageOfFirst, 0.5);
    expect(r.intersectionOverUnion, closeTo(1 / 3, 1e-12));
  });

  test('disjoint and edge-touching plots have zero overlap', () {
    expect(calculatePolygonOverlap(plotA, [(20, 0), (30, 0), (30, 10), (20, 10)]).intersectionArea, 0);
    expect(calculatePolygonOverlap(plotA, [(10, 0), (20, 0), (20, 10), (10, 10)]).intersectionArea, 0);
  });

  test('concave and contained plots', () {
    final r = calculatePolygonOverlap(
      [(0, 0), (6, 0), (6, 2), (2, 2), (2, 6), (0, 6)],
      [(0.5, 0.5), (1.5, 0.5), (1.5, 1.5), (0.5, 1.5)],
    );
    expect(r.intersectionArea, closeTo(1, 1e-12));
    expect(r.percentageOfSecond, closeTo(1, 1e-12));
  });

  test('rejects degenerate input', () {
    expect(() => calculatePolygonOverlap([(0, 0), (1, 1)], plotA), throwsA(isA<InvalidPolygonException>()));
    expect(() => calculatePolygonOverlap([(0, 0), (1, 0), (2, 0)], plotA), throwsA(isA<InvalidPolygonException>()));
  });
}
