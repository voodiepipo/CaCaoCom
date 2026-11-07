import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/plot_record.dart';

class UploadFailed implements Exception {
  const UploadFailed(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Sends one plot to the server. Throws on any failure so the plot stays queued.
abstract class PlotUploader {
  Future<void> upload(PlotRecord plot);
}

/// Server address; override with `--dart-define=API_BASE_URL=https://…`.
/// The default reaches `npm start` on the host from the Android emulator.
const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:3000');

class HttpPlotUploader implements PlotUploader {
  HttpPlotUploader({http.Client? client, String baseUrl = apiBaseUrl, this.timeout = const Duration(seconds: 20)})
      : _client = client ?? http.Client(),
        _endpoint = Uri.parse('$baseUrl/api/plots/sync');

  final http.Client _client;
  final Uri _endpoint;
  final Duration timeout;

  @override
  Future<void> upload(PlotRecord plot) async {
    final http.Response res;
    try {
      res = await _client
          .post(_endpoint, headers: {'content-type': 'application/json'}, body: jsonEncode(toSyncJson(plot)))
          .timeout(timeout);
    } catch (e) {
      throw UploadFailed('Network error: $e');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw UploadFailed('Server returned ${res.statusCode}');
    }
  }
}

/// Body of `POST /api/plots/sync`. `localId` + `revision` identify the
/// version, so the server can recognise a repeated upload.
Map<String, Object?> toSyncJson(PlotRecord plot) => {
      'localId': plot.localId,
      'revision': plot.revision,
      'plotCode': plot.plotCode,
      'farmerId': plot.farmerId,
      'regionCode': plot.regionCode,
      'agentId': plot.agentId,
      'createdAt': plot.createdAt.toUtc().toIso8601String(),
      'points': plot.points.map((p) => p.toJson()).toList(),
      'mappedAreaHa': plot.areaHa,
      'landAreaHa': plot.landAreaHa,
      'deviceCheck': {
        'status': plot.checkStatus.name,
        'overlapPct': plot.overlapPct,
        'thresholdPct': plot.thresholdPct,
        'reason': plot.checkReason,
        'checkedAt': plot.checkedAt?.toUtc().toIso8601String(),
      },
    };
