import 'dart:convert';

import 'package:latlong2/latlong.dart';

enum SyncStatus { pendingSync, synced }

enum CheckStatus { notChecked, clean, flagged }

enum PointSource { gps, manual }

/// One vertex of a plot boundary, with when and how it was captured.
class BoundaryPoint {
  const BoundaryPoint({
    required this.latitude,
    required this.longitude,
    required this.capturedAt,
    required this.source,
    this.accuracyM,
  });

  final double latitude;
  final double longitude;
  final DateTime capturedAt;
  final PointSource source;

  /// GPS horizontal accuracy in metres; null for points placed by hand.
  final double? accuracyM;

  LatLng get latLng => LatLng(latitude, longitude);

  Map<String, Object?> toJson() => {
        'lat': latitude,
        'lng': longitude,
        'at': capturedAt.toUtc().toIso8601String(),
        'src': source.name,
        'acc': accuracyM,
      };

  factory BoundaryPoint.fromJson(Map<String, Object?> json) => BoundaryPoint(
        latitude: (json['lat'] as num).toDouble(),
        longitude: (json['lng'] as num).toDouble(),
        capturedAt: DateTime.parse(json['at'] as String),
        source: PointSource.values.byName(json['src'] as String),
        accuracyM: (json['acc'] as num?)?.toDouble(),
      );
}

/// A plot boundary mapped by a field agent and stored on the device.
class PlotRecord {
  const PlotRecord({
    required this.localId,
    required this.plotCode,
    required this.farmerId,
    required this.regionCode,
    required this.agentId,
    required this.createdAt,
    required this.points,
    required this.areaHa,
    this.syncStatus = SyncStatus.pendingSync,
    this.checkStatus = CheckStatus.notChecked,
    this.overlapPct,
    this.thresholdPct,
    this.checkReason,
    this.checkedAt,
  });

  final String localId;
  final String plotCode;
  final String farmerId;
  final String regionCode;
  final String agentId;
  final DateTime createdAt;
  final List<BoundaryPoint> points;
  final double areaHa;
  final SyncStatus syncStatus;
  final CheckStatus checkStatus;
  final double? overlapPct;
  final double? thresholdPct;
  final String? checkReason;
  final DateTime? checkedAt;

  List<LatLng> get ring => points.map((p) => p.latLng).toList();

  PlotRecord copyWith({
    SyncStatus? syncStatus,
    CheckStatus? checkStatus,
    double? overlapPct,
    double? thresholdPct,
    String? checkReason,
    DateTime? checkedAt,
  }) =>
      PlotRecord(
        localId: localId,
        plotCode: plotCode,
        farmerId: farmerId,
        regionCode: regionCode,
        agentId: agentId,
        createdAt: createdAt,
        points: points,
        areaHa: areaHa,
        syncStatus: syncStatus ?? this.syncStatus,
        checkStatus: checkStatus ?? this.checkStatus,
        overlapPct: overlapPct ?? this.overlapPct,
        thresholdPct: thresholdPct ?? this.thresholdPct,
        checkReason: checkReason ?? this.checkReason,
        checkedAt: checkedAt ?? this.checkedAt,
      );

  Map<String, Object?> toRow() => {
        'local_id': localId,
        'plot_code': plotCode,
        'farmer_id': farmerId,
        'region_code': regionCode,
        'agent_id': agentId,
        'created_at': createdAt.toUtc().toIso8601String(),
        'points_json': jsonEncode(points.map((p) => p.toJson()).toList()),
        'area_ha': areaHa,
        'sync_status': syncStatus.name,
        'check_status': checkStatus.name,
        'overlap_pct': overlapPct,
        'threshold_pct': thresholdPct,
        'check_reason': checkReason,
        'checked_at': checkedAt?.toUtc().toIso8601String(),
      };

  factory PlotRecord.fromRow(Map<String, Object?> row) => PlotRecord(
        localId: row['local_id'] as String,
        plotCode: row['plot_code'] as String,
        farmerId: row['farmer_id'] as String,
        regionCode: row['region_code'] as String,
        agentId: row['agent_id'] as String,
        createdAt: DateTime.parse(row['created_at'] as String),
        points: (jsonDecode(row['points_json'] as String) as List)
            .map((p) => BoundaryPoint.fromJson((p as Map).cast<String, Object?>()))
            .toList(),
        areaHa: (row['area_ha'] as num).toDouble(),
        syncStatus: SyncStatus.values.byName(row['sync_status'] as String),
        checkStatus: CheckStatus.values.byName(row['check_status'] as String),
        overlapPct: (row['overlap_pct'] as num?)?.toDouble(),
        thresholdPct: (row['threshold_pct'] as num?)?.toDouble(),
        checkReason: row['check_reason'] as String?,
        checkedAt: row['checked_at'] == null ? null : DateTime.parse(row['checked_at'] as String),
      );
}

/// Append-only history entry for a plot (who did what, and when).
class PlotEvent {
  const PlotEvent({
    required this.localId,
    required this.action,
    required this.agentId,
    required this.at,
    this.detail,
  });

  final String localId;
  final String action;
  final String agentId;
  final DateTime at;
  final String? detail;
}
