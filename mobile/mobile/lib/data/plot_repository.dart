import 'package:sqflite/sqflite.dart';

import '../models/plot_record.dart';

/// Device storage for mapped plots (story 005). Everything is written to a
/// local SQLite file, so capture works with no signal; records stay
/// `pendingSync` until the sync job (story 007, sprint 2) uploads them.
class PlotRepository {
  PlotRepository._(this._db);

  final Database _db;

  static const _schemaVersion = 1;

  static Future<PlotRepository> open({DatabaseFactory? factory, String? path}) async {
    final dbFactory = factory ?? databaseFactory;
    final dbPath = path ?? '${await dbFactory.getDatabasesPath()}/cacaocom_field.db';
    final db = await dbFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(version: _schemaVersion, onCreate: _create),
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
        checked_at TEXT
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
