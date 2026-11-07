import 'dart:async';

import 'package:flutter/foundation.dart';

import '../data/plot_repository.dart';
import 'connectivity_service.dart';
import 'plot_uploader.dart';

/// Story 007: uploads queued plots in the background whenever the phone is
/// online — at start-up, on every reconnect, or when the agent taps Sync now.
///
/// Plots go one at a time, oldest first. A network or server failure stops
/// the run and leaves that plot and the rest queued for the next trigger; a
/// plot the server rejects is skipped for this run. Nothing is removed from
/// the device.
class SyncService extends ChangeNotifier {
  SyncService({required this.repo, required this.uploader, required this.connectivity});

  final PlotRepository repo;
  final PlotUploader uploader;
  final ConnectivityService connectivity;

  StreamSubscription<void>? _sub;
  Future<void>? _running;

  bool get syncing => _running != null;
  int pending = 0;
  DateTime? lastSyncedAt;
  String? lastError;

  Future<void> start() async {
    _sub = connectivity.reconnected.listen((_) => syncNow());
    await refreshPending();
    if (connectivity.value) unawaited(syncNow());
  }

  Future<void> refreshPending() async {
    pending = await repo.countPendingSync();
    notifyListeners();
  }

  /// Starts a run, or joins the one already going.
  Future<void> syncNow() {
    final running = _running;
    if (running != null) return running;
    final run = _running = _run().whenComplete(() {
      _running = null;
      notifyListeners();
    });
    notifyListeners();
    return run;
  }

  Future<void> _run() async {
    lastError = null;
    // Plots the server rejected this run; they stay queued for the next one.
    final rejected = <String>{};
    try {
      // Re-read the queue each time so plots saved mid-run are picked up.
      while (connectivity.value) {
        final queue = (await repo.pendingPlots()).where((p) => !rejected.contains(p.localId));
        if (queue.isEmpty) break;
        final plot = queue.first;
        try {
          final check = await uploader.upload(plot);
          if (await repo.markSynced(plot, check: check)) lastSyncedAt = DateTime.now();
        } on PlotRejected catch (e) {
          rejected.add(plot.localId);
          lastError = '$e';
        }
        await refreshPending();
      }
    } catch (e) {
      lastError = '$e';
    }
    await refreshPending();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
