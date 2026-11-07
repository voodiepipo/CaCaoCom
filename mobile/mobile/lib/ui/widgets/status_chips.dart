import 'package:flutter/material.dart';

import '../../models/plot_record.dart';
import '../../services/sync_service.dart';

Widget _chip(String label, Color color, IconData icon) => Chip(
      avatar: Icon(icon, size: 16, color: color),
      label: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12)),
      backgroundColor: color.withValues(alpha: 0.12),
      side: BorderSide.none,
      visualDensity: VisualDensity.compact,
    );

Widget syncChip(SyncStatus status) => switch (status) {
      SyncStatus.pendingSync => _chip('Pending sync', Colors.orange.shade800, Icons.cloud_upload_outlined),
      SyncStatus.synced => _chip('Synced', Colors.blue.shade700, Icons.cloud_done_outlined),
    };

Widget checkChip(CheckStatus status) => switch (status) {
      CheckStatus.clean => _chip('Clean', Colors.green.shade700, Icons.verified_outlined),
      CheckStatus.flagged => _chip('Flagged', Colors.red.shade700, Icons.flag_outlined),
      CheckStatus.notChecked => _chip('Not checked', Colors.grey.shade700, Icons.help_outline),
    };

class ConnectivityBanner extends StatelessWidget {
  const ConnectivityBanner({super.key, required this.online});
  final ValueNotifier<bool> online;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: online,
      builder: (context, isOnline, _) => Container(
        width: double.infinity,
        color: isOnline ? Colors.green.shade700 : Colors.grey.shade800,
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
        child: Row(children: [
          Icon(isOnline ? Icons.wifi : Icons.wifi_off, color: Colors.white, size: 16),
          const SizedBox(width: 8),
          Text(
            isOnline ? 'Online' : 'Offline — work is saved on this phone',
            style: const TextStyle(color: Colors.white, fontSize: 13),
          ),
        ]),
      ),
    );
  }
}

/// Story 005/007: how many plots are still only on this phone, and whether
/// they are being uploaded right now.
class SyncStatusBar extends StatelessWidget {
  const SyncStatusBar({super.key, required this.sync, required this.online});
  final SyncService sync;
  final ValueNotifier<bool> online;

  String _time(DateTime t) => t.toLocal().toString().substring(11, 16);

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([sync, online]),
      builder: (context, _) {
        final (icon, color, text) = switch (sync) {
          SyncService(syncing: true) => (Icons.sync, Colors.blue.shade700, 'Uploading ${sync.pending} plot(s)…'),
          SyncService(pending: 0) => (
              Icons.cloud_done_outlined,
              Colors.blue.shade700,
              sync.lastSyncedAt == null ? 'All plots uploaded' : 'All plots uploaded · ${_time(sync.lastSyncedAt!)}'
            ),
          _ when !online.value => (
              Icons.cloud_off_outlined,
              Colors.orange.shade800,
              '${sync.pending} plot(s) pending sync — will upload when online'
            ),
          _ => (
              Icons.cloud_upload_outlined,
              Colors.orange.shade800,
              sync.lastError == null
                  ? '${sync.pending} plot(s) pending sync'
                  : '${sync.pending} plot(s) pending sync — last try failed'
            ),
        };
        return Container(
          width: double.infinity,
          color: color.withValues(alpha: 0.10),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(children: [
            sync.syncing
                ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: color))
                : Icon(icon, size: 16, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600))),
            TextButton(
              onPressed: sync.syncing || sync.pending == 0 || !online.value ? null : sync.syncNow,
              child: const Text('Sync now'),
            ),
          ]),
        );
      },
    );
  }
}
