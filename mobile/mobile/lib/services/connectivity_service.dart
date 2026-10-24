import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// Tracks whether the phone has any network. Capture never depends on it; the
/// UI uses it to tell the agent that work is being kept on the device.
class ConnectivityService extends ValueNotifier<bool> {
  ConnectivityService() : super(false);

  final _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _sub;

  Future<void> start() async {
    try {
      _update(await _connectivity.checkConnectivity());
    } catch (_) {
      value = false;
    }
    _sub = _connectivity.onConnectivityChanged.listen(_update);
  }

  void _update(List<ConnectivityResult> results) =>
      value = results.any((r) => r != ConnectivityResult.none);

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
