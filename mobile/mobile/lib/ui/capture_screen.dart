import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

import '../compliance/baseline.dart';
import '../compliance/flag_rule.dart';
import '../geometry/geo_projection.dart';
import '../geometry/polygon_overlap.dart' show InvalidPolygonException;
import '../main.dart';
import '../models/plot_record.dart';
import '../services/offline_tiles.dart';
import 'widgets/status_chips.dart';

/// Story 005: map a plot boundary point by point, fully offline.
class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key, required this.services});
  final AppServices services;

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  final _points = <BoundaryPoint>[];
  bool _tapMode = true;
  bool _busy = false;
  Position? _lastFix;
  StreamSubscription<Position>? _gps;

  @override
  void initState() {
    super.initState();
    _startGps();
  }

  Future<void> _startGps() async {
    try {
      await widget.services.location.ensurePermission();
      _gps = widget.services.location.positions().listen(
            (p) => setState(() => _lastFix = p),
            onError: (_) {},
          );
    } catch (_) {
      // No GPS (e.g. emulator without location): tap mode still works.
    }
  }

  @override
  void dispose() {
    _gps?.cancel();
    super.dispose();
  }

  void _addTapped(LatLng p) {
    if (!_tapMode) return;
    setState(() => _points.add(BoundaryPoint(
          latitude: p.latitude,
          longitude: p.longitude,
          capturedAt: DateTime.now().toUtc(),
          source: PointSource.manual,
        )));
  }

  Future<void> _addGpsPoint() async {
    setState(() => _busy = true);
    try {
      final fix = await widget.services.location.currentFix();
      setState(() => _points.add(BoundaryPoint(
            latitude: fix.latitude,
            longitude: fix.longitude,
            capturedAt: DateTime.now().toUtc(),
            source: PointSource.gps,
            accuracyM: fix.accuracy,
          )));
    } catch (e) {
      _snack('GPS: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  Future<void> _save() async {
    final ring = _points.map((p) => p.latLng).toList();
    final area = areaHectares(ring);
    if (area == null) {
      _snack('Boundary is not a valid shape. Undo the last point.');
      return;
    }
    final OverlapCheck check;
    try {
      check = checkPlotAgainstBaseline(ring, wa01Baseline);
    } on InvalidPolygonException {
      _snack('Boundary lines cross each other. Undo and redraw.');
      return;
    }

    final count = (await widget.services.repo.allPlots()).length + 1;
    if (!mounted) return;
    final ids = await _askIds('P-${count.toString().padLeft(3, '0')}', 'F-${count.toString().padLeft(3, '0')}');
    if (ids == null) return;

    final now = DateTime.now().toUtc();
    final plot = PlotRecord(
      localId: '${widget.services.session.agentId}-${now.microsecondsSinceEpoch}',
      plotCode: ids.$1,
      farmerId: ids.$2,
      regionCode: wa01Baseline.regionCode,
      agentId: widget.services.session.agentId ?? 'UNKNOWN',
      createdAt: now,
      points: List.of(_points),
      areaHa: area,
      checkStatus: check.status,
      overlapPct: check.overlapPct,
      thresholdPct: check.thresholdPct,
      checkReason: check.reason,
      checkedAt: now,
    );
    await widget.services.repo.saveNewPlot(plot);
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Saved on this phone'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 6, children: [syncChip(plot.syncStatus), checkChip(plot.checkStatus)]),
          const SizedBox(height: 8),
          Text('Area: ${area.toStringAsFixed(2)} ha'),
          Text(check.reason),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      ),
    );
    if (mounted) Navigator.of(context).pop();
  }

  Future<(String, String)?> _askIds(String plotCode, String farmerId) {
    final plotCtl = TextEditingController(text: plotCode);
    final farmerCtl = TextEditingController(text: farmerId);
    return showDialog<(String, String)>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Save plot'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: plotCtl, decoration: const InputDecoration(labelText: 'Plot ID')),
          TextField(controller: farmerCtl, decoration: const InputDecoration(labelText: 'Farmer ID')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(context, (plotCtl.text.trim(), farmerCtl.text.trim())),
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ring = _points.map((p) => p.latLng).toList();
    final area = areaHectares(ring);
    return Scaffold(
      appBar: AppBar(title: const Text('Map plot boundary')),
      body: Column(children: [
        ConnectivityBanner(online: widget.services.connectivity),
        Expanded(
          child: FlutterMap(
            options: MapOptions(
              initialCenter: wa01Baseline.center,
              initialZoom: 15,
              onTap: (_, p) => _addTapped(p),
            ),
            children: [
              offlineTileLayer(),
              PolygonLayer(polygons: [
                Polygon(
                  points: wa01Baseline.ring,
                  color: Colors.green.withValues(alpha: 0.18),
                  borderColor: Colors.green.shade800,
                  borderStrokeWidth: 2,
                ),
                if (ring.length >= 3)
                  Polygon(points: ring, color: cocoa.withValues(alpha: 0.35), borderColor: cocoaDark, borderStrokeWidth: 3),
              ]),
              if (ring.length == 2)
                PolylineLayer(polylines: [Polyline(points: ring, color: cocoaDark, strokeWidth: 3)]),
              MarkerLayer(markers: [
                for (var i = 0; i < ring.length; i++)
                  Marker(
                    point: ring[i],
                    width: 24,
                    height: 24,
                    child: CircleAvatar(
                      backgroundColor: cocoaDark,
                      child: Text('${i + 1}', style: const TextStyle(color: Colors.white, fontSize: 11)),
                    ),
                  ),
                if (_lastFix != null)
                  Marker(
                    point: LatLng(_lastFix!.latitude, _lastFix!.longitude),
                    width: 18,
                    height: 18,
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.blue,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 3),
                      ),
                    ),
                  ),
              ]),
            ],
          ),
        ),
        Material(
          elevation: 8,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                Text('${_points.length} points'),
                const SizedBox(width: 12),
                Text(area == null ? 'Area: –' : 'Area: ${area.toStringAsFixed(2)} ha'),
                const Spacer(),
                Text(_lastFix == null ? 'GPS: no fix' : 'GPS ±${_lastFix!.accuracy.toStringAsFixed(0)} m',
                    style: TextStyle(color: (_lastFix?.accuracy ?? 99) > 10 ? Colors.orange.shade800 : Colors.green.shade700)),
              ]),
              Row(children: [
                const Text('Tap map to add point'),
                Switch(value: _tapMode, onChanged: (v) => setState(() => _tapMode = v)),
                const Spacer(),
                const Icon(Icons.square, color: Colors.green, size: 14),
                const Text(' Forest baseline 2020', style: TextStyle(fontSize: 12)),
              ]),
              Row(children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _addGpsPoint,
                    icon: const Icon(Icons.my_location),
                    label: Text(_busy ? 'Getting fix…' : 'Add GPS point'),
                  ),
                ),
                IconButton(
                  onPressed: _points.isEmpty ? null : () => setState(_points.removeLast),
                  icon: const Icon(Icons.undo),
                  tooltip: 'Undo',
                ),
                FilledButton.tonal(
                  onPressed: _points.length >= 3 ? _save : null,
                  child: const Text('Save'),
                ),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }
}
