import 'package:flutter/material.dart';

import '../../models/plot_record.dart';

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
