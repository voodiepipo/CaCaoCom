import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

/// Reference satellite baseline bundled with the app so the overlap pre-check
/// works with no signal.
///
/// Same area as db/sample_data.sql: the fallback polygon for the largest forest
/// patch of JRC Global Forest Cover 2020 (V4), tile N10_W10, region WA01.
/// PostGIS builds it with ST_Buffer(point, 0.00746, 16), i.e. a 64-sided
/// polygon in lon/lat degrees, and so does this file.
class SatelliteBaseline {
  const SatelliteBaseline({
    required this.regionCode,
    required this.sourceName,
    required this.cutoffDate,
    required this.ring,
  });

  final String regionCode;
  final String sourceName;
  final DateTime cutoffDate;
  final List<LatLng> ring;

  LatLng get center {
    var lat = 0.0, lng = 0.0;
    for (final p in ring) {
      lat += p.latitude;
      lng += p.longitude;
    }
    return LatLng(lat / ring.length, lng / ring.length);
  }
}

const _wa01Lon = -2.535858;
const _wa01Lat = 6.157492;
const _wa01RadiusDeg = 0.00746;
const _bufferSegments = 64; // ST_Buffer quad_segs 16 x 4 quadrants

final SatelliteBaseline wa01Baseline = SatelliteBaseline(
  regionCode: 'WA01',
  sourceName: 'JRC Global Forest Cover 2020 (V4)',
  cutoffDate: DateTime.utc(2020, 12, 31),
  ring: List.generate(_bufferSegments, (i) {
    final angle = 2 * math.pi * i / _bufferSegments;
    return LatLng(
      _wa01Lat + _wa01RadiusDeg * math.sin(angle),
      _wa01Lon + _wa01RadiusDeg * math.cos(angle),
    );
  }),
);
