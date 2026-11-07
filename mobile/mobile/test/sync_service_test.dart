import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/plot_repository.dart';
import 'package:mobile/models/plot_record.dart';
import 'package:mobile/services/connectivity_service.dart';
import 'package:mobile/services/plot_uploader.dart';
import 'package:mobile/services/sync_service.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Story 007 end to end: SyncService + HttpPlotUploader against the
/// FastAPI `POST /api/v1/plots` response shape.
void main() {
  sqfliteFfiInit();
  late PlotRepository repo;
  late ConnectivityService online;

  setUp(() async {
    repo = await PlotRepository.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
    online = ConnectivityService()..value = true;
  });
  tearDown(() => repo.close());

  PlotRecord plot(String id, {String farmer = 'F-005', int minute = 0}) => PlotRecord(
        localId: id,
        plotCode: 'P-005',
        farmerId: farmer,
        regionCode: 'WA01',
        agentId: 'AG-017',
        createdAt: DateTime.utc(2026, 11, 8, 9, minute),
        points: [
          for (final (lat, lng) in [(6.15, -2.54), (6.15, -2.53), (6.16, -2.53)])
            BoundaryPoint(latitude: lat, longitude: lng, capturedAt: DateTime.utc(2026, 11, 8, 9), source: PointSource.gps),
        ],
        areaHa: 6.1,
        checkStatus: CheckStatus.clean,
      );

  SyncService service(MockClientHandler handler) => SyncService(
        repo: repo,
        connectivity: online,
        uploader: HttpPlotUploader(client: MockClient(handler), baseUrl: 'http://api'),
      );

  test('007: pending plot is uploaded, marked synced and takes the server check', () async {
    await repo.saveNewPlot(plot('AG-017-1'));
    final sync = service((req) async {
      expect(req.url.toString(), 'http://api/plots');
      return http.Response(jsonEncode({'id': 42, 'status': 'FLAGGED', 'overlap_percent': 40.0}), 201);
    });

    await sync.syncNow();
    expect(sync.lastError, isNull);

    final saved = (await repo.allPlots()).single;
    expect(saved.syncStatus, SyncStatus.synced);
    expect(saved.checkStatus, CheckStatus.flagged);
    expect(saved.overlapPct, 40.0);
    expect(await repo.countPendingSync(), 0);
    final synced = (await repo.eventsFor('AG-017-1')).last;
    expect(synced.action, 'synced');
    expect(synced.detail, contains('#42'));
  });

  test('server rejection keeps that plot pending, reports why, and the rest still upload', () async {
    await repo.saveNewPlot(plot('AG-017-1', minute: 1));
    await repo.saveNewPlot(plot('AG-017-2', farmer: 'F-006', minute: 2));
    final sync = service((req) async {
      final farmer = (jsonDecode(req.body) as Map)['farmer_id'];
      return farmer == 5
          ? http.Response(jsonEncode({'detail': 'Plot area exceeds the allowed maximum'}), 422)
          : http.Response(jsonEncode({'id': 7, 'status': 'CLEAN', 'overlap_percent': 0.0}), 201);
    });

    await sync.syncNow();
    expect(sync.lastError, contains('exceeds the allowed maximum'));
    expect((await repo.findPlot('AG-017-1'))!.syncStatus, SyncStatus.pendingSync);
    expect((await repo.findPlot('AG-017-2'))!.syncStatus, SyncStatus.synced);
    expect(sync.pending, 1);
  });

  test('unknown farmer is created on the server and the plot syncs under its server ID', () async {
    await repo.saveNewPlot(plot('AG-017-1', farmer: 'F-009'));
    final sync = service((req) async {
      if (req.url.path == '/farmers') return http.Response(jsonEncode({'id': 10}), 201);
      return (jsonDecode(req.body) as Map)['farmer_id'] == 10
          ? http.Response(jsonEncode({'id': 42, 'status': 'CLEAN', 'overlap_percent': 0.0}), 201)
          : http.Response(jsonEncode({'detail': 'Farmer 9 not found'}), 404);
    });

    await sync.syncNow();
    expect(sync.lastError, isNull);
    final saved = (await repo.allPlots()).single;
    expect(saved.syncStatus, SyncStatus.synced);
    expect(saved.farmerId, 'F-010');
  });

  test('does nothing while offline', () async {
    await repo.saveNewPlot(plot('AG-017-1'));
    online.value = false;
    var calls = 0;
    final sync = service((_) async {
      calls++;
      return http.Response('{}', 201);
    });

    await sync.syncNow();
    expect(calls, 0);
    expect(await repo.countPendingSync(), 1);
  });
}
