import 'package:latlong2/latlong.dart';

import '../geometry/geo_projection.dart';
import '../geometry/polygon_overlap.dart';
import '../models/plot_record.dart';
import 'baseline.dart';

/// Story 009.2 threshold: plots whose overlap is below this share are flagged.
const double defaultMinimumOverlap = 0.90;

class OverlapCheck {
  const OverlapCheck({
    required this.overlapRatio,
    required this.thresholdRatio,
    required this.status,
    required this.reason,
  });

  /// Share of the submitted plot that lies inside the baseline, 0..1 (story 009.1).
  final double overlapRatio;
  final double thresholdRatio;
  final CheckStatus status;
  final String reason;

  double get overlapPct => _pct(overlapRatio);
  double get thresholdPct => _pct(thresholdRatio);
}

double _pct(double ratio) => (ratio * 10000).round() / 100;

/// Applies the 009.2 rule to an overlap ratio. A ratio equal to the threshold
/// passes, matching the server (`>=`).
OverlapCheck applyFlagRule(double overlapRatio, {double minimumOverlap = defaultMinimumOverlap}) {
  if (!minimumOverlap.isFinite || minimumOverlap < 0 || minimumOverlap > 1) {
    throw RangeError('minimumOverlap must be between 0 and 1');
  }
  final overlapPct = _pct(overlapRatio), thresholdPct = _pct(minimumOverlap);
  final flagged = overlapRatio < minimumOverlap;
  return OverlapCheck(
    overlapRatio: overlapRatio,
    thresholdRatio: minimumOverlap,
    status: flagged ? CheckStatus.flagged : CheckStatus.clean,
    reason: flagged
        ? 'Overlap $overlapPct% is below the $thresholdPct% threshold'
        : 'Overlap $overlapPct% meets the $thresholdPct% threshold',
  );
}

/// Story 009.1 on the device: the share of the submitted plot's area that
/// overlaps the satellite baseline, then the 009.2 flag rule.
OverlapCheck checkPlotAgainstBaseline(
  List<LatLng> plot,
  SatelliteBaseline baseline, {
  double minimumOverlap = defaultMinimumOverlap,
}) {
  final projection = LocalProjection(baseline.center);
  final overlap = calculatePolygonOverlap(
    projection.projectAll(plot),
    projection.projectAll(baseline.ring),
  );
  return applyFlagRule(overlap.percentageOfFirst, minimumOverlap: minimumOverlap);
}
