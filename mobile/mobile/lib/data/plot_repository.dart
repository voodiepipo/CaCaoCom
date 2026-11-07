import 'package:sqflite/sqflite.dart';

import '../models/plot_record.dart';
import '../services/plot_uploader.dart';

/// Device storage for mapped plots (story 005). Everything is written to a
/// local SQLite file, so capture works with no signal; records stay
/// `pendingSync` until [SyncService] (story 007) uploads them.
class PlotRepository {
  PlotRepository._(this._db);

  final Database _db;

  static const _schemaVersion = 2;

  static Future<PlotRepository> open({DatabaseFactory? factory, String? path}) async {
    final dbFactory = factory ?? databaseFactory;
    final dbPath = path ?? '${await dbFactory.getDatabasesPath()}/cacaocom_field.db';
    final db = await dbFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(version: _schemaVersion, onCreate: _create, onUpgrade: _upgrade),
    );
    return PlotRepository._(db);
  }

  static Future<void> _create(Database db, int version) async {
    await db.execute('''
      CREATE TABLE plots (
        local_id TEXT PRIMARY KEY,
        plot_code TEXT NOT NULL,
        farmer_id TEXT NOT NULL,
        region_code TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        points_json TEXT NOT NULL,
        area_ha REAL NOT NULL,
        sync_status TEXT NOT NULL,
        check_status TEXT NOT NULL,
        overlap_pct REAL,
        threshold_pct REAL,
        check_reason TEXT,
        checked_at TEXT,
        land_area_ha REAL,
        revision INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT
      )''');
    await db.execute('''
      CREATE TABLE plot_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id TEXT NOT NULL REFERENCES plots(local_id),
        action TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        at TEXT NOT NULL,
        detail TEXT
      )''');
    // Same rule as flag_audit on the server: history can only be appended.
    await db.execute('''
      CREATE TRIGGER plot_events_no_update BEFORE UPDATE ON plot_events
      BEGIN SELECT RAISE(ABORT, 'plot_events is append-only'); END''');
    await db.execute('''
      CREATE TRIGGER plot_events_no_delete BEFORE DELETE ON plot_events
      BEGIN SELECT RAISE(ABORT, 'plot_events is append-only'); END''');
  }

  static Future<void> _upgrade(Database db, int from, int to) async {
    if (from < 2) {
      await db.execute('ALTER TABLE plots ADD COLUMN land_area_ha REAL');
      await db.execute('ALTER TABLE plots ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
      await db.execute('ALTER TABLE plots ADD COLUMN synced_at TEXT');
    }
  }

  Future<void> close() => _db.close();

  /// Saves a newly mapped plot and its history entries in one transaction.
  Future<void> saveNewPlot(PlotRecord plot, {String? checkDetail}) async {
    final now = DateTime.now().toUtc().toIso8601String();
    await _db.transaction((txn) async {
      await txn.insert('plots', plot.toRow(), conflictAlgorithm: ConflictAlgorithm.abort);
      await txn.insert('plot_events', {
        'local_id': plot.localId,
        'action': 'captured',
        'agent_id': plot.agentId,
        'at': now,
        'detail': '${plot.points.length} points, ${plot.areaHa.toStringAsFixed(2)} ha, pending sync',
      });
      if (plot.checkStatus != CheckStatus.notChecked) {
        await txn.insert('plot_events', {
          'local_id': plot.localId,
          'action': 'device_check_${plot.checkStatus.name}',
          'agent_id': plot.agentId,
          'at': now,
          'detail': checkDetail ?? plot.checkReason,
        });
      }
    });
  }

  /// Records a later overlap result (for example from the server) on a plot.
  Future<void> updateCheck(PlotRecord plot, {required String action, required String agentId}) async {
    await _db.transaction((txn) async {
      await txn.update('plots', plot.toRow(), where: 'local_id = ?', whereArgs: [plot.localId]);
      await txn.insert('plot_events', {
        'local_id': plot.localId,
        'action': action,
        'agent_id': agentId,
        'at': DateTime.now().toUtc().toIso8601String(),
        'detail': plot.checkReason,
      });
    });
  }

  Future<List<PlotRecord>> allPlots() async {
    final rows = await _db.query('plots', orderBy: 'created_at DESC');
    return rows.map(PlotRecord.fromRow).toList();
  }

  Future<PlotRecord?> findPlot(String localId) async {
    final rows = await _db.query('plots', where: 'local_id = ?', whereArgs: [localId], limit: 1);
    return rows.isEmpty ? null : PlotRecord.fromRow(rows.first);
  }

  Future<int> countPendingSync() async {
    final rows = await _db.rawQuery(
      'SELECT COUNT(*) AS n FROM plots WHERE sync_status = ?',
      [SyncStatus.pendingSync.name],
    );
    return (rows.first['n'] as int?) ?? 0;
  }

  /// The upload queue: plots not yet on the server, oldest first.
  Future<List<PlotRecord>> pendingPlots() async {
    final rows = await _db.query('plots',
        where: 'sync_status = ?', whereArgs: [SyncStatus.pendingSync.name], orderBy: 'created_at ASC');
    return rows.map(PlotRecord.fromRow).toList();
  }

  /// Marks [uploaded] as synced, unless it was edited on the device while the
  /// upload was in flight. Returns false in that case so it stays queued.
  /// [check] is the server's overlap result; when it has a verdict it
  /// replaces the on-device check.
  Future<bool> markSynced(PlotRecord uploaded, {DateTime? at, ServerCheck? check}) async {
    final when = (at ?? DateTime.now()).toUtc().toIso8601String();
    final serverStatus = check?.checkStatus;
    return _db.transaction((txn) async {
      final n = await txn.update(
        'plots',
        {
          'sync_status': SyncStatus.synced.name,
          'synced_at': when,
          if (check?.farmerId != null) 'farmer_id': check!.farmerId,
          if (serverStatus != null) ...{
            'check_status': serverStatus.name,
            'overlap_pct': check!.overlapPct,
            'check_reason': 'Server check: overlap ${check.overlapPct?.toStringAsFixed(1)}% → ${check.status}',
            'checked_at': when,
          },
        },
        where: 'local_id = ? AND revision = ?',
        whereArgs: [uploaded.localId, uploaded.revision],
      );
      if (n == 0) return false;
      await txn.insert('plot_events', {
        'local_id': uploaded.localId,
        'action': 'synced',
        'agent_id': uploaded.agentId,
        'at': when,
        'detail': check == null ? 'Uploaded to server' : 'Uploaded: server plot #${check.serverId}, status ${check.status}',
      });
      return true;
    });
  }

  /// Story 3.1: stores the agent-entered land area, queues the plot for upload
  /// again and appends a history entry with the old and new value.
  Future<PlotRecord> updateLandArea(PlotRecord plot, double landAreaHa, {required String agentId}) async {
    return _db.transaction((txn) async {
      final rows = await txn.query('plots', where: 'local_id = ?', whereArgs: [plot.localId], limit: 1);
      if (rows.isEmpty) throw StateError('Plot ${plot.localId} is not on this device');
      final before = PlotRecord.fromRow(rows.first);
      await txn.rawUpdate(
        'UPDATE plots SET land_area_ha = ?, revision = revision + 1, sync_status = ? WHERE local_id = ?',
        [landAreaHa, SyncStatus.pendingSync.name, plot.localId],
      );
      await txn.insert('plot_events', {
        'local_id': plot.localId,
        'action': 'land_area_updated',
        'agent_id': agentId,
        'at': DateTime.now().toUtc().toIso8601String(),
        'detail': '${before.effectiveLandAreaHa.toStringAsFixed(2)} ha → ${landAreaHa.toStringAsFixed(2)} ha',
      });
      return before.copyWith(
        landAreaHa: landAreaHa,
        revision: before.revision + 1,
        syncStatus: SyncStatus.pendingSync,
      );
    });
  }

  Future<List<PlotEvent>> eventsFor(String localId) async {
    final rows = await _db.query('plot_events',
        where: 'local_id = ?', whereArgs: [localId], orderBy: 'id ASC');
    return rows
        .map((r) => PlotEvent(
              localId: r['local_id'] as String,
              action: r['action'] as String,
              agentId: r['agent_id'] as String,
              at: DateTime.parse(r['at'] as String),
              detail: r['detail'] as String?,
            ))
        .toList();
  }

  /// Raw access for tests that check the append-only triggers.
  Database get database => _db;
}
