import 'package:flutter/material.dart';

import '../main.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.services});
  final AppServices services;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _controller = TextEditingController(text: 'AG-017');

  Future<void> _start() async {
    if (_controller.text.trim().isEmpty) return;
    await widget.services.session.signIn(_controller.text);
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => HomeScreen(services: widget.services)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.eco, size: 64, color: cocoa),
              const SizedBox(height: 12),
              Text('Cocaocom Field',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: cocoaDark, fontWeight: FontWeight.bold)),
              const Text('Offline plot mapping for field agents', textAlign: TextAlign.center),
              const SizedBox(height: 32),
              TextField(
                controller: _controller,
                decoration: const InputDecoration(labelText: 'Agent ID', border: OutlineInputBorder()),
                textCapitalization: TextCapitalization.characters,
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: _start, child: const Text('Start')),
            ],
          ),
        ),
      ),
    );
  }
}
