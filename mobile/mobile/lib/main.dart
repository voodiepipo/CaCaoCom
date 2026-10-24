import 'package:flutter/material.dart';

import 'data/plot_repository.dart';
import 'services/connectivity_service.dart';
import 'services/location_service.dart';
import 'services/session.dart';
import 'ui/home_screen.dart';
import 'ui/login_screen.dart';

const cocoa = Color(0xFF6D4C3D);
const cocoaDark = Color(0xFF2B1610);
const cream = Color(0xFFFBF7F3);

class AppServices {
  AppServices({required this.repo, required this.session, required this.connectivity, required this.location});
  final PlotRepository repo;
  final Session session;
  final ConnectivityService connectivity;
  final LocationService location;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final connectivity = ConnectivityService();
  await connectivity.start();
  final services = AppServices(
    repo: await PlotRepository.open(),
    session: await Session.load(),
    connectivity: connectivity,
    location: LocationService(),
  );
  runApp(CocaocomApp(services: services));
}

class CocaocomApp extends StatelessWidget {
  const CocaocomApp({super.key, required this.services});
  final AppServices services;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cocaocom Field',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: cocoa, primary: cocoa, surface: cream),
        scaffoldBackgroundColor: cream,
        appBarTheme: const AppBarTheme(backgroundColor: cocoaDark, foregroundColor: Colors.white),
      ),
      home: services.session.agentId == null
          ? LoginScreen(services: services)
          : HomeScreen(services: services),
    );
  }
}
