import 'package:flutter/material.dart';

import '../main.dart';
import '../models/plot_record.dart';
import 'capture_screen.dart';
import 'login_screen.dart';
import 'plot_detail_screen.dart';
import 'widgets/status_chips.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.services});
  final AppServices services;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<PlotRecord> _plots = [];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    final plots = await widget.services.repo.allPlots();
    if (mounted) setState(() => _plots = plots);
  }

  Future<void> _mapNewPlot() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => CaptureScreen(services: widget.services)),
    );
    _reload();
  }

  Future<void> _signOut() async {
    await widget.services.session.signOut();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => LoginScreen(services: widget.services)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pending = _plots.where((p) => p.syncStatus == SyncStatus.pendingSync).length;
    final flagged = _plots.where((p) => p.checkStatus == CheckStatus.flagged).length;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cocaocom Field'),
        actions: [
          Center(child: Text(widget.services.session.agentId ?? '')),
          IconButton(onPressed: _signOut, icon: const Icon(Icons.logout), tooltip: 'Sign out'),
        ],
      ),
      body: Column(children: [
        ConnectivityBanner(online: widget.services.connectivity),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            _stat('On device', _plots.length, cocoa),
            _stat('Pending sync', pending, Colors.orange.shade800),
            _stat('Flagged', flagged, Colors.red.shade700),
          ]),
        ),
        Expanded(
          child: _plots.isEmpty
              ? const Center(child: Text('No plots yet. Tap "Map plot" to start.'))
              : ListView.separated(
                  itemCount: _plots.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final p = _plots[i];
                    return ListTile(
                      leading: const Icon(Icons.crop_square, color: cocoa),
                      title: Text('${p.plotCode} · Farmer ${p.farmerId}'),
                      subtitle: Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        Text('${p.areaHa.toStringAsFixed(2)} ha · ${p.points.length} pts'),
                        syncChip(p.syncStatus),
                        checkChip(p.checkStatus),
                      ]),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => PlotDetailScreen(services: widget.services, plot: p),
                      )),
                    );
                  },
                ),
        ),
      ]),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _mapNewPlot,
        icon: const Icon(Icons.add_location_alt),
        label: const Text('Map plot'),
      ),
    );
  }

  Widget _stat(String label, int value, Color color) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(children: [
              Text('$value', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
              Text(label, style: const TextStyle(fontSize: 12)),
            ]),
          ),
        ),
      );
}
