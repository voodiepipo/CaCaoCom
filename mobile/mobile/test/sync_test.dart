import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/plot_repository.dart';
import 'package:mobile/models/plot_record.dart';
import 'package:mobile/services/connectivity_service.dart';
import 'package:mobile/services/plot_uploader.dart';
import 'package:mobile/services/sync_service.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

const _wifi = [ConnectivityResult.wifi];
const _mobile = [ConnectivityResult.mobile];
const _none = [ConnectivityResult.none];

/// Records every upload. [failWhen] decides which calls fail; [gate], when
/// set, holds each upload until the test completes it.
class FakeUploader implements PlotUploader {
  final uploaded = <(String, int)>[];
  int calls = 0;
  bool Function(int call, PlotRecord plot) failWhen = (_, _) => false;
  Completer<void>? gate;

  @override
  Future<void> upload(PlotRecord plot) async {
    final call = ++calls;
    if (gate != null) await gate!.future;
    if (failWhen(call, plot)) throw const UploadFailed('Network error: connection reset');
    uploaded.add((plot.localId, plot.revision));
  }
}

PlotRecord plot(String id, {int minute = 0}) => PlotRecord(
      localId: id,
      plotCode: 'P-$id',
      farmerId: 'F-$id',
      regionCode: 'WA01',
      agentId: 'AG-017',
      createdAt: DateTime.utc(2026, 11, 1, 9, minute),
      points: [
        for (final (lat, lng) in [(6.15, -2.54), (6.15, -2.53), (6.16, -2.53)])
          BoundaryPoint(latitude: lat, longitude: lng, capturedAt: DateTime.utc(2026, 11, 1, 9), source: PointSource.gps, accuracyM: 4),
      ],
      areaHa: 6.1,
    );

void main() {
  sqfliteFfiInit();

  group('007 connectivity listener', () {
    late StreamController<List<ConnectivityResult>> net;
    late ConnectivityService connectivity;

    setUp(() => net = StreamController<List<ConnectivityResult>>());
    tearDown(() => connectivity.dispose());

    Future<void> settle() => Future<void>.delayed(Duration.zero);

    test('starts offline when the phone has no network', () async {
      connectivity = ConnectivityService(changes: net.stream, check: () async => _none);
      await connectivity.start();
      expect(connectivity.value, isFalse);
    });

    test('a failing connectivity check is treated as offline', () async {
      connectivity = ConnectivityService(changes: net.stream, check: () async => throw Exception('no plugin'));
      await connectivity.start();
      expect(connectivity.value, isFalse);
    });

    test('reconnected fires only on offline → online, not on wifi ↔ mobile', () async {
      connectivity = ConnectivityService(changes: net.stream, check: () async => _none);
      await connectivity.start();
      var fired = 0;
      connectivity.reconnected.listen((_) => fired++);

      for (final r in [_wifi, _mobile, _wifi, _none, _none, _mobile, _none, _wifi]) {
        net.add(r);
        await settle();
      }
      expect(fired, 3);
      expect(connectivity.value, isTrue);
    });
  });

  group('007 sync across intermittent connectivity', () {
    late PlotRepository repo;
    late StreamController<List<ConnectivityResult>> net;
    late ConnectivityService connectivity;
    late FakeUploader uploader;
    late SyncService sync;

    Future<void> start({bool online = false}) async {
      connectivity = ConnectivityService(changes: net.stream, check: () async => online ? _wifi : _none);
      await connectivity.start();
      sync = SyncService(repo: repo, uploader: uploader, connectivity: connectivity);
      await sync.start();
    }

    /// Lets the listener fire and any started run finish.
    Future<void> settle() async {
      await Future<void>.delayed(Duration.zero);
      while (sync.syncing) {
        await sync.syncNow();
      }
    }

    Future<void> goOnline() async {
      net.add(_wifi);
      await settle();
    }

    Future<void> goOffline() async {
      net.add(_none);
      await Future<void>.delayed(Duration.zero);
    }

    setUp(() async {
      repo = await PlotRepository.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath);
      net = StreamController<List<ConnectivityResult>>.broadcast();
      uploader = FakeUploader();
    });

    tearDown(() async {
      sync.dispose();
      connectivity.dispose();
      await repo.close();
    });

    test('offline: plots stay pending and nothing is uploaded', () async {
      await start();
      await repo.saveNewPlot(plot('a'));
      await sync.syncNow();
      expect(uploader.calls, 0);
      expect(await repo.countPendingSync(), 1);
    });

    test('plots saved offline upload on reconnect, oldest first', () async {
      await start();
      await repo.saveNewPlot(plot('b', minute: 2));
      await repo.saveNewPlot(plot('a', minute: 1));
      await repo.saveNewPlot(plot('c', minute: 3));
      await sync.refreshPending();
      expect(sync.pending, 3);

      await goOnline();

      expect(uploader.uploaded.map((u) => u.$1), ['a', 'b', 'c']);
      expect(await repo.countPendingSync(), 0);
      expect(sync.pending, 0);
      expect(sync.lastSyncedAt, isNotNull);
      final a = (await repo.findPlot('a'))!;
      expect(a.syncStatus, SyncStatus.synced);
      expect(a.syncedAt, isNotNull);
      expect((await repo.eventsFor('a')).map((e) => e.action), ['captured', 'synced']);
    });

    test('pending plots upload at start-up when already online', () async {
      await repo.saveNewPlot(plot('a'));
      await start(online: true);
      await settle();
      expect(uploader.uploaded.single.$1, 'a');
      expect(await repo.countPendingSync(), 0);
    });

    test('network fails mid-queue: done plots stay synced, the rest stay pending, then finish on reconnect', () async {
      await start();
      for (var i = 0; i < 4; i++) {
        await repo.saveNewPlot(plot('p$i', minute: i));
      }
      uploader.failWhen = (call, _) => call == 3;

      await goOnline();
      expect(uploader.uploaded.map((u) => u.$1), ['p0', 'p1']);
      expect(await repo.countPendingSync(), 2);
      expect(sync.lastError, contains('connection reset'));

      await goOffline();
      await goOnline();
      expect(uploader.uploaded.map((u) => u.$1), ['p0', 'p1', 'p2', 'p3']);
      expect(await repo.countPendingSync(), 0);
      expect(sync.lastError, isNull);
    });

    test('flapping connection never loses or double-syncs a plot', () async {
      await start();
      for (var i = 0; i < 10; i++) {
        await repo.saveNewPlot(plot('p$i', minute: i));
      }
      // Every third upload attempt drops.
      uploader.failWhen = (call, _) => call % 3 == 0;

      for (var round = 0; round < 10 && await repo.countPendingSync() > 0; round++) {
        await goOffline();
        await goOnline();
      }

      expect(await repo.countPendingSync(), 0);
      expect((await repo.allPlots()).length, 10);
      final ids = uploader.uploaded.map((u) => u.$1).toList();
      expect(ids.toSet().length, 10);
      expect(ids.length, 10, reason: 'each plot is marked synced after exactly one successful upload');
      for (var i = 0; i < 10; i++) {
        final synced = (await repo.eventsFor('p$i')).where((e) => e.action == 'synced');
        expect(synced.length, 1);
      }
    });

    test('going offline during a run stops after the current plot', () async {
      await start();
      for (var i = 0; i < 3; i++) {
        await repo.saveNewPlot(plot('p$i', minute: i));
      }
      uploader.gate = Completer<void>();
      net.add(_wifi);
      await Future<void>.delayed(Duration.zero);
      expect(sync.syncing, isTrue);

      await goOffline();
      uploader.gate!.complete();
      await settle();

      expect(uploader.uploaded.map((u) => u.$1), ['p0']);
      expect(await repo.countPendingSync(), 2);
    });

    test('Sync now during a run joins it instead of uploading twice', () async {
      await start();
      await repo.saveNewPlot(plot('a'));
      uploader.gate = Completer<void>();
      net.add(_wifi);
      await Future<void>.delayed(Duration.zero);

      final first = sync.syncNow();
      final second = sync.syncNow();
      expect(identical(first, second), isTrue);
      uploader.gate!.complete();
      await Future.wait([first, second]);

      expect(uploader.calls, 1);
      expect(await repo.countPendingSync(), 0);
    });

    test('a plot saved while uploading is picked up in the same run', () async {
      await start();
      await repo.saveNewPlot(plot('a', minute: 1));
      uploader.gate = Completer<void>();
      net.add(_wifi);
      await Future<void>.delayed(Duration.zero);

      await repo.saveNewPlot(plot('b', minute: 2));
      uploader.gate!.complete();
      await settle();

      expect(uploader.uploaded.map((u) => u.$1), ['a', 'b']);
      expect(await repo.countPendingSync(), 0);
    });

    test('a plot edited while uploading stays pending and the new version is sent', () async {
      await start();
      await repo.saveNewPlot(plot('a'));
      uploader.gate = Completer<void>();
      net.add(_wifi);
      await Future<void>.delayed(Duration.zero);

      await repo.updateLandArea(plot('a'), 7.5, agentId: 'AG-017');
      uploader.gate!.complete();
      await settle();

      expect(uploader.uploaded, [('a', 0), ('a', 1)]);
      final a = (await repo.findPlot('a'))!;
      expect(a.syncStatus, SyncStatus.synced);
      expect(a.landAreaHa, 7.5);
    });
  });

  group('007 HTTP uploader', () {
    test('posts the plot as JSON to /api/plots/sync', () async {
      late http.Request sent;
      final uploader = HttpPlotUploader(
        baseUrl: 'http://api.test',
        client: MockClient((req) async {
          sent = req;
          return http.Response('{"status":"ok"}', 201);
        }),
      );
      await uploader.upload(plot('a').copyWith(landAreaHa: 5.5, revision: 2));

      expect(sent.method, 'POST');
      expect(sent.url.toString(), 'http://api.test/api/plots/sync');
      final body = jsonDecode(sent.body) as Map<String, Object?>;
      expect(body['localId'], 'a');
      expect(body['revision'], 2);
      expect(body['agentId'], 'AG-017');
      expect(body['landAreaHa'], 5.5);
      expect((body['points'] as List).length, 3);
    });

    test('a non-2xx response throws so the plot stays queued', () async {
      final uploader = HttpPlotUploader(client: MockClient((_) async => http.Response('down', 503)));
      expect(() => uploader.upload(plot('a')), throwsA(isA<UploadFailed>()));
    });

    test('a network error throws UploadFailed', () async {
      final uploader = HttpPlotUploader(client: MockClient((_) async => throw http.ClientException('no route')));
      expect(() => uploader.upload(plot('a')), throwsA(isA<UploadFailed>()));
    });
  });
}
