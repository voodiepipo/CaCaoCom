import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../models/plot_record.dart';

class UploadFailed implements Exception {
  const UploadFailed(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The server rejected this one plot (bad data, unknown farmer). Retrying
/// won't help, but the rest of the queue can still go up.
class PlotRejected extends UploadFailed {
  const PlotRejected(super.message);
}

/// What the server's overlap check said about an uploaded plot.
class ServerCheck {
  const ServerCheck({required this.serverId, required this.status, this.overlapPct, this.farmerId});
  final Object? serverId;
  final String? status;
  final double? overlapPct;

  /// Set when the farmer was created during upload and got a different
  /// server ID than the one typed on the phone; the local record takes it.
  final String? farmerId;

  /// The server check is authoritative once a baseline exists for the region.
  CheckStatus? get checkStatus => switch (status) {
        'CLEAN' => CheckStatus.clean,
        'FLAGGED' => CheckStatus.flagged,
        _ => null,
      };
}

/// Sends one plot to the server. Throws on any failure so the plot stays queued.
abstract class PlotUploader {
  Future<ServerCheck?> upload(PlotRecord plot);
}

/// Server address; override with `--dart-define=API_BASE_URL=https://…/api/v1`.
/// The default reaches the FastAPI backend on the host from the Android emulator.
const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:8000/api/v1');

class HttpPlotUploader implements PlotUploader {
  HttpPlotUploader({http.Client? client, String baseUrl = apiBaseUrl, this.timeout = const Duration(seconds: 20)})
      : _client = client ?? http.Client(),
        _endpoint = Uri.parse('$baseUrl/plots'),
        _farmersEndpoint = Uri.parse('$baseUrl/farmers');

  final http.Client _client;
  final Uri _endpoint;
  final Uri _farmersEndpoint;
  final Duration timeout;

  @override
  Future<ServerCheck> upload(PlotRecord plot) async {
    final farmerId = int.tryParse(plot.farmerId.replaceAll(RegExp(r'\D'), ''));
    if (farmerId == null) throw PlotRejected('${plot.plotCode}: farmer ID "${plot.farmerId}" has no number');

    var res = await _post(_endpoint, uploadBody(plot, farmerId));
    // Farmers aren't managed on the phone yet, so a new farmer ID is normal:
    // create the farmer and send the plot again.
    String? newFarmerId;
    if (res.statusCode == 404 && _isFarmerMissing(res.body)) {
      final serverFarmerId = await _createFarmer(plot);
      if (serverFarmerId != farmerId) newFarmerId = 'F-${serverFarmerId.toString().padLeft(3, '0')}';
      res = await _post(_endpoint, uploadBody(plot, serverFarmerId));
    }
    _check(res, plot);

    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return ServerCheck(
      serverId: body['id'],
      status: body['status'] as String?,
      overlapPct: (body['overlap_percent'] as num?)?.toDouble(),
      farmerId: newFarmerId,
    );
  }

  Future<int> _createFarmer(PlotRecord plot) async {
    final res = await _post(_farmersEndpoint, {'full_name': 'Farmer ${plot.farmerId}', 'region': plot.regionCode});
    _check(res, plot);
    return (jsonDecode(res.body) as Map)['id'] as int;
  }

  Future<http.Response> _post(Uri url, Map<String, Object?> body) async {
    try {
      return await _client
          .post(url, headers: {'content-type': 'application/json'}, body: jsonEncode(body))
          .timeout(timeout);
    } catch (e) {
      throw UploadFailed('Network error: $e');
    }
  }

  void _check(http.Response res, PlotRecord plot) {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      throw PlotRejected('${plot.plotCode}: server said ${res.statusCode}: ${_detail(res.body)}');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw UploadFailed('Server returned ${res.statusCode}');
    }
  }

  static bool _isFarmerMissing(String body) => RegExp(r'^Farmer \d+ not found$').hasMatch(_detail(body));

  static String _detail(String body) {
    try {
      final detail = (jsonDecode(body) as Map)['detail'];
      return detail is String ? detail : jsonEncode(detail);
    } catch (_) {
      return body;
    }
  }
}

/// Body of `POST /plots`. GeoJSON wants [lon, lat] and a closed ring.
Map<String, Object?> uploadBody(PlotRecord plot, int farmerId) {
  final ring = [for (final p in plot.points) [p.longitude, p.latitude]];
  if (ring.isNotEmpty) ring.add(ring.first);
  return {
    'client_id': clientIdFor(plot.localId),
    'farmer_id': farmerId,
    'region': plot.regionCode,
    'boundary': {'type': 'Polygon', 'coordinates': [ring]},
    'captured_by_agent_id': plot.agentId,
    'captured_at': plot.createdAt.toUtc().toIso8601String(),
  };
}

/// Stable UUID for a local plot ID, so re-uploads hit the same server row
/// (the server dedupes on `client_id`).
String clientIdFor(String localId) => const Uuid().v5(Namespace.url.value, 'cacaocom:plot:$localId');
