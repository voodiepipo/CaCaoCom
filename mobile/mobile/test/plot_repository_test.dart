import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/plot_repository.dart';
import 'package:mobile/models/plot_record.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();
  late PlotRepository repo;

  setUp(() async => repo = await PlotRepository.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath));
  tearDown(() => repo.close());

  PlotRecord plot() => PlotRecord(
        localId: 'AG-017-1',
        plotCode: 'P-001',
        farmerId: 'F-001',
        regionCode: 'WA01',
        agentId: 'AG-017',
        createdAt: DateTime.utc(2026, 10, 24, 9),
        points: [
          for (final (lat, lng) in [(6.15, -2.54), (6.15, -2.53), (6.16, -2.53)])
            BoundaryPoint(latitude: lat, longitude: lng, capturedAt: DateTime.utc(2026, 10, 24, 9), source: PointSource.gps, accuracyM: 4),
        ],
        areaHa: 6.1,
        checkStatus: CheckStatus.flagged,
        checkReason: 'Overlap 50.0% is below the 90.0% threshold',
      );

  test('005: saved plot is stored locally and marked pending sync', () async {
    await repo.saveNewPlot(plot());
    final saved = (await repo.allPlots()).single;
    expect(saved.syncStatus, SyncStatus.pendingSync);
    expect(saved.points.length, 3);
    expect(saved.points.first.accuracyM, 4);
    expect(await repo.countPendingSync(), 1);
  });

  test('history records agent ID and timestamp and is append-only', () async {
    await repo.saveNewPlot(plot());
    final events = await repo.eventsFor('AG-017-1');
    expect(events.map((e) => e.action), ['captured', 'device_check_flagged']);
    expect(events.every((e) => e.agentId == 'AG-017'), isTrue);
    expect(() => repo.database.rawUpdate("UPDATE plot_events SET detail = 'x'"), throwsA(isA<DatabaseException>()));
    expect(() => repo.database.rawDelete('DELETE FROM plot_events'), throwsA(isA<DatabaseException>()));
  });
}
