import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../compliance/baseline.dart';
import '../main.dart';
import '../models/plot_record.dart';
import '../services/offline_tiles.dart';
import 'widgets/land_area_field.dart';
import 'widgets/status_chips.dart';

class PlotDetailScreen extends StatefulWidget {
  const PlotDetailScreen({super.key, required this.services, required this.plot});
  final AppServices services;
  final PlotRecord plot;

  @override
  State<PlotDetailScreen> createState() => _PlotDetailScreenState();
}

class _PlotDetailScreenState extends State<PlotDetailScreen> {
  late PlotRecord plot = widget.plot;
  late Future<List<PlotEvent>> _events = services.repo.eventsFor(plot.localId);

  AppServices get services => widget.services;

  @override
  void initState() {
    super.initState();
    services.sync.addListener(_reload);
  }

  @override
  void dispose() {
    services.sync.removeListener(_reload);
    super.dispose();
  }

  /// Picks up changes made by the sync job (e.g. Pending sync → Synced).
  Future<void> _reload() async {
    final fresh = await services.repo.findPlot(plot.localId);
    if (!mounted || fresh == null) return;
    setState(() {
      plot = fresh;
      _events = services.repo.eventsFor(plot.localId);
    });
  }

  Future<void> _editLandArea() async {
    final value = await showLandAreaDialog(context, current: plot.effectiveLandAreaHa, mappedAreaHa: plot.areaHa);
    if (value == null || value == plot.effectiveLandAreaHa) return;
    await services.repo.updateLandArea(plot, value, agentId: services.session.agentId ?? plot.agentId);
    await _reload();
    await services.sync.refreshPending();
    unawaited(services.sync.syncNow());
  }

  String _time(DateTime t) => t.toLocal().toString().substring(0, 19);

  @override
  Widget build(BuildContext context) {
    final ring = plot.ring;
    return Scaffold(
      appBar: AppBar(title: Text('Plot ${plot.plotCode}')),
      body: ListView(children: [
        SizedBox(
          height: 240,
          child: FlutterMap(
            options: MapOptions(
              initialCameraFit: CameraFit.coordinates(coordinates: ring, padding: const EdgeInsets.all(32)),
            ),
            children: [
              offlineTileLayer(),
              PolygonLayer(polygons: [
                Polygon(points: wa01Baseline.ring, color: Colors.green.withValues(alpha: 0.18), borderColor: Colors.green.shade800, borderStrokeWidth: 2),
                Polygon(points: ring, color: cocoa.withValues(alpha: 0.35), borderColor: cocoaDark, borderStrokeWidth: 3),
              ]),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: 6, children: [syncChip(plot.syncStatus), checkChip(plot.checkStatus)]),
            const SizedBox(height: 8),
            _row('Farmer ID', plot.farmerId),
            _row('Region', plot.regionCode),
            _row('Agent ID', plot.agentId),
            _row('Captured at', _time(plot.createdAt)),
            _row('Mapped area', '${plot.areaHa.toStringAsFixed(2)} ha'),
            Row(children: [
              Expanded(child: _row('Land area', '${plot.effectiveLandAreaHa.toStringAsFixed(2)} ha')),
              IconButton(
                key: const Key('editLandArea'),
                onPressed: _editLandArea,
                icon: const Icon(Icons.edit, size: 18),
                tooltip: 'Edit land area',
              ),
            ]),
            _row('Synced at', plot.syncedAt == null ? 'Not yet — saved on this phone' : _time(plot.syncedAt!)),
            _row('Overlap with baseline', plot.overlapPct == null ? '–' : '${plot.overlapPct}%'),
            _row('Threshold', plot.thresholdPct == null ? '–' : '${plot.thresholdPct}%'),
            _row('Result', plot.checkReason ?? '–'),
            const SizedBox(height: 16),
            Text('Boundary points', style: Theme.of(context).textTheme.titleMedium),
            for (var i = 0; i < plot.points.length; i++)
              Text(
                '${i + 1}. ${plot.points[i].latitude.toStringAsFixed(6)}, ${plot.points[i].longitude.toStringAsFixed(6)}'
                '  ${plot.points[i].source == PointSource.gps ? 'GPS ±${plot.points[i].accuracyM?.toStringAsFixed(0)} m' : 'manual'}'
                '  ${_time(plot.points[i].capturedAt).substring(11)}',
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
            const SizedBox(height: 16),
            Text('History (cannot be edited)', style: Theme.of(context).textTheme.titleMedium),
            FutureBuilder<List<PlotEvent>>(
              future: _events,
              builder: (context, snap) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final e in snap.data ?? const <PlotEvent>[])
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.history, size: 18),
                      title: Text('${e.action} · ${e.agentId}'),
                      subtitle: Text('${_time(e.at)}\n${e.detail ?? ''}'),
                    ),
                ],
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 160, child: Text(label, style: const TextStyle(color: Colors.black54))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ]),
      );
}
