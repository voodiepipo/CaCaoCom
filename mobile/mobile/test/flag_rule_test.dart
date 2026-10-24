import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:mobile/compliance/baseline.dart';
import 'package:mobile/compliance/flag_rule.dart';
import 'package:mobile/models/plot_record.dart';

void main() {
  group('009.2 threshold boundary cases', () {
    test('exactly 90% is Clean', () => expect(applyFlagRule(0.90).status, CheckStatus.clean));
    test('89.99% is Flagged', () => expect(applyFlagRule(0.8999).status, CheckStatus.flagged));
    test('90.01% is Clean', () => expect(applyFlagRule(0.9001).status, CheckStatus.clean));
    test('0% is Flagged', () => expect(applyFlagRule(0).status, CheckStatus.flagged));
    test('100% is Clean', () => expect(applyFlagRule(1).status, CheckStatus.clean));
    test('reason states the numbers', () {
      expect(applyFlagRule(0.5).reason, 'Overlap 50.0% is below the 90.0% threshold');
    });
    test('invalid threshold is rejected', () {
      expect(() => applyFlagRule(0.5, minimumOverlap: 1.1), throwsRangeError);
    });
  });

  group('009.1 plot vs satellite baseline on device', () {
    final c = wa01Baseline.center;
    List<LatLng> square(double lat, double lng, double half) => [
          LatLng(lat - half, lng - half),
          LatLng(lat - half, lng + half),
          LatLng(lat + half, lng + half),
          LatLng(lat + half, lng - half),
        ];

    test('plot inside the baseline is Clean at 100%', () {
      final r = checkPlotAgainstBaseline(square(c.latitude, c.longitude, 0.002), wa01Baseline);
      expect(r.overlapPct, closeTo(100, 0.01));
      expect(r.status, CheckStatus.clean);
    });

    test('plot outside the baseline is Flagged at 0%', () {
      final r = checkPlotAgainstBaseline(square(c.latitude, c.longitude + 0.05, 0.002), wa01Baseline);
      expect(r.overlapPct, 0);
      expect(r.status, CheckStatus.flagged);
    });

    test('plot half outside is Flagged', () {
      final r = checkPlotAgainstBaseline(square(c.latitude, c.longitude + 0.00746, 0.002), wa01Baseline);
      expect(r.overlapPct, inInclusiveRange(40, 60));
      expect(r.status, CheckStatus.flagged);
    });
  });
}
