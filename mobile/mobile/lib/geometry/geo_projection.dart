import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import 'polygon_overlap.dart';

const double _earthRadiusM = 6371008.8;

/// Projects lon/lat points to local planar metres (equirectangular around
/// [origin]). Accurate enough for farm-sized plots, and it lets the planar
/// overlap code work on GPS coordinates.
class LocalProjection {
  LocalProjection(this.origin) : _cosLat = math.cos(origin.latitudeInRad);

  final LatLng origin;
  final double _cosLat;

  Point project(LatLng p) => (
        (p.longitudeInRad - origin.longitudeInRad) * _cosLat * _earthRadiusM,
        (p.latitudeInRad - origin.latitudeInRad) * _earthRadiusM,
      );

  Polygon projectAll(Iterable<LatLng> points) => points.map(project).toList();
}

LatLng centroidOf(List<LatLng> points) {
  var lat = 0.0, lng = 0.0;
  for (final p in points) {
    lat += p.latitude;
    lng += p.longitude;
  }
  return LatLng(lat / points.length, lng / points.length);
}

/// Area of a lon/lat ring in hectares, or null if the ring is not a valid polygon yet.
double? areaHectares(List<LatLng> ring) {
  if (ring.length < 3) return null;
  try {
    final projected = LocalProjection(centroidOf(ring)).projectAll(ring);
    return polygonArea(projected) / 10000;
  } on InvalidPolygonException {
    return null;
  }
}
