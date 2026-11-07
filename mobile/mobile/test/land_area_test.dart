import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/plot_repository.dart';
import 'package:mobile/models/plot_record.dart';
import 'package:mobile/ui/widgets/land_area_field.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

PlotRecord plot() => PlotRecord(
      localId: 'AG-017-1',
      plotCode: 'P-001',
      farmerId: 'F-001',
      regionCode: 'WA01',
      agentId: 'AG-017',
      createdAt: DateTime.utc(2026, 11, 1, 9),
      points: [
        for (final (lat, lng) in [(6.15, -2.54), (6.15, -2.53), (6.16, -2.53)])
          BoundaryPoint(latitude: lat, longitude: lng, capturedAt: DateTime.utc(2026, 11, 1, 9), source: PointSource.gps, accuracyM: 4),
      ],
      areaHa: 6.1,
    );

void main() {
  sqfliteFfiInit();

  group('3.1 land area input', () {
    test('accepts dot or comma decimals', () {
      expect(parseLandArea('2.5'), 2.5);
      expect(parseLandArea(' 2,75 '), 2.75);
      expect(parseLandArea('12'), 12);
    });

    test('rejects empty, zero, negative and non-numbers', () {
      for (final bad in ['', '  ', '0', '-1', 'abc', '1.2.3', 'NaN', 'Infinity']) {
        expect(parseLandArea(bad), isNull, reason: bad);
      }
    });

    testWidgets('dialog shows an error for bad input and returns the new value', (tester) async {
      double? result = -1;
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async => result = await showLandAreaDialog(context, current: 6.1, mappedAreaHa: 6.1),
            child: const Text('open'),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('Mapped: 6.10 ha'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('landAreaField')), 'abc');
      await tester.tap(find.text('Save'));
      await tester.pump();
      expect(find.text('Enter a number above 0'), findsOneWidget);
      expect(result, -1, reason: 'dialog stays open on bad input');

      await tester.enterText(find.byKey(const Key('landAreaField')), '7,25');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(result, 7.25);
    });

    testWidgets('cancel returns null', (tester) async {
      double? result = -1;
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async => result = await showLandAreaDialog(context, current: 6.1, mappedAreaHa: 6.1),
            child: const Text('open'),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(result, isNull);
    });
  });

  group('3.1 land area edit and history entry', () {
    late PlotRepository repo;

    setUp(() async => repo = await PlotRepository.open(factory: databaseFactoryFfi, path: inMemoryDatabasePath));
    tearDown(() => repo.close());

    test('new plot without an entered land area falls back to the mapped area', () async {
      await repo.saveNewPlot(plot());
      final saved = (await repo.findPlot('AG-017-1'))!;
      expect(saved.landAreaHa, isNull);
      expect(saved.effectiveLandAreaHa, 6.1);
    });

    test('land area entered on the plot form is stored', () async {
      await repo.saveNewPlot(plot().copyWith(landAreaHa: 5.8));
      expect((await repo.findPlot('AG-017-1'))!.landAreaHa, 5.8);
    });

    test('edit persists the value, keeps the mapped area and re-queues the plot', () async {
      await repo.saveNewPlot(plot());
      await repo.markSynced((await repo.findPlot('AG-017-1'))!);
      expect(await repo.countPendingSync(), 0);

      final returned = await repo.updateLandArea(plot(), 7.25, agentId: 'AG-021');
      final saved = (await repo.findPlot('AG-017-1'))!;

      expect(saved.landAreaHa, 7.25);
      expect(saved.areaHa, 6.1);
      expect(saved.revision, 1);
      expect(saved.syncStatus, SyncStatus.pendingSync);
      expect(returned.landAreaHa, saved.landAreaHa);
      expect(returned.revision, saved.revision);
      expect(await repo.countPendingSync(), 1);
    });

    test('each edit appends a history entry with old → new value and who made it', () async {
      await repo.saveNewPlot(plot());
      await repo.updateLandArea(plot(), 7.25, agentId: 'AG-021');
      await repo.updateLandArea(plot(), 7, agentId: 'AG-017');

      final events = await repo.eventsFor('AG-017-1');
      expect(events.map((e) => e.action), ['captured', 'land_area_updated', 'land_area_updated']);
      expect(events[1].detail, '6.10 ha → 7.25 ha');
      expect(events[1].agentId, 'AG-021');
      expect(events[2].detail, '7.25 ha → 7.00 ha', reason: 'old value comes from the stored plot, not a stale copy');
      expect(events[2].agentId, 'AG-017');
      expect((await repo.findPlot('AG-017-1'))!.revision, 2);
    });

    test('land area history cannot be changed or deleted', () async {
      await repo.saveNewPlot(plot());
      await repo.updateLandArea(plot(), 7.25, agentId: 'AG-021');
      expect(
        () => repo.database.rawUpdate("UPDATE plot_events SET detail = 'x' WHERE action = 'land_area_updated'"),
        throwsA(isA<DatabaseException>()),
      );
      expect(
        () => repo.database.rawDelete("DELETE FROM plot_events WHERE action = 'land_area_updated'"),
        throwsA(isA<DatabaseException>()),
      );
    });

    test('editing a plot that is not on the device fails without a history entry', () async {
      expect(() => repo.updateLandArea(plot(), 7, agentId: 'AG-017'), throwsStateError);
      expect(await repo.eventsFor('AG-017-1'), isEmpty);
    });
  });

  test('upgrading a sprint 1 database keeps its plots and adds the new columns', () async {
    final dir = await Directory.systemTemp.createTemp('cacaocom_migrate');
    final path = '${dir.path}/field.db';
    final v1 = await databaseFactoryFfi.openDatabase(path, options: OpenDatabaseOptions(version: 1, onCreate: (db, _) async {
      await db.execute('''
        CREATE TABLE plots (
          local_id TEXT PRIMARY KEY, plot_code TEXT NOT NULL, farmer_id TEXT NOT NULL,
          region_code TEXT NOT NULL, agent_id TEXT NOT NULL, created_at TEXT NOT NULL,
          points_json TEXT NOT NULL, area_ha REAL NOT NULL, sync_status TEXT NOT NULL,
          check_status TEXT NOT NULL, overlap_pct REAL, threshold_pct REAL,
          check_reason TEXT, checked_at TEXT)''');
      await db.execute('''
        CREATE TABLE plot_events (id INTEGER PRIMARY KEY AUTOINCREMENT, local_id TEXT NOT NULL,
          action TEXT NOT NULL, agent_id TEXT NOT NULL, at TEXT NOT NULL, detail TEXT)''');
    }));
    final row = plot().toRow()..removeWhere((k, _) => ['land_area_ha', 'revision', 'synced_at'].contains(k));
    await v1.insert('plots', row);
    await v1.close();

    final repo = await PlotRepository.open(factory: databaseFactoryFfi, path: path);
    final old = (await repo.findPlot('AG-017-1'))!;
    expect(old.revision, 0);
    expect(old.landAreaHa, isNull);
    await repo.updateLandArea(old, 5, agentId: 'AG-017');
    expect((await repo.findPlot('AG-017-1'))!.landAreaHa, 5);
    await repo.close();
    await dir.delete(recursive: true);
  });
}
