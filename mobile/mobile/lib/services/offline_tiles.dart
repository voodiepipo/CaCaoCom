import 'package:flutter_map/flutter_map.dart';

/// Map tiles are cached on the device for a year, so any area the agent has
/// viewed once still shows with no signal.
TileLayer offlineTileLayer() => TileLayer(
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      userAgentPackageName: 'com.cacaocom.field',
      tileProvider: NetworkTileProvider(
        cachingProvider: BuiltInMapCachingProvider.getOrCreateInstance(
          overrideFreshAge: const Duration(days: 365),
        ),
        silenceExceptions: true,
      ),
    );
