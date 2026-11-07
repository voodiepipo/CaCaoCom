import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// Tracks whether the phone has any network. Capture never depends on it; the
/// UI uses it to tell the agent that work is being kept on the device, and
/// [reconnected] tells the sync job when to start uploading (story 007).
class ConnectivityService extends ValueNotifier<bool> {
  /// [changes] and [check] default to connectivity_plus; tests pass their own.
  ConnectivityService({this._changes, this._check}) : super(false);

  final Stream<List<ConnectivityResult>>? _changes;
  final Future<List<ConnectivityResult>> Function()? _check;
  final _reconnected = StreamController<void>.broadcast();
  StreamSubscription<List<ConnectivityResult>>? _sub;

  /// Fires each time the phone goes from no network to some network.
  Stream<void> get reconnected => _reconnected.stream;

  Future<void> start() async {
    final connectivity = (_changes == null || _check == null) ? Connectivity() : null;
    try {
      _update(await (_check ?? connectivity!.checkConnectivity)());
    } catch (_) {
      value = false;
    }
    _sub = (_changes ?? connectivity!.onConnectivityChanged).listen(_update);
  }

  void _update(List<ConnectivityResult> results) {
    final wasOnline = value;
    value = results.any((r) => r != ConnectivityResult.none);
    if (!wasOnline && value) _reconnected.add(null);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _reconnected.close();
    super.dispose();
  }
}
