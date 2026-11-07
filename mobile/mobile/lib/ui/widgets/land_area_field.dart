import 'package:flutter/material.dart';

/// Reads a hectare value typed by the agent. Accepts `2.5` or `2,5`;
/// returns null for anything that is not a positive number.
double? parseLandArea(String text) {
  final value = double.tryParse(text.trim().replaceAll(',', '.'));
  if (value == null || !value.isFinite || value <= 0) return null;
  return value;
}

/// Story 3.1: editable land area on the plot form.
class LandAreaField extends StatelessWidget {
  const LandAreaField({super.key, required this.controller, this.mappedAreaHa});
  final TextEditingController controller;

  /// Shown as a hint so the agent can compare with what was mapped.
  final double? mappedAreaHa;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      key: const Key('landAreaField'),
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        labelText: 'Land area (ha)',
        suffixText: 'ha',
        helperText: mappedAreaHa == null ? null : 'Mapped: ${mappedAreaHa!.toStringAsFixed(2)} ha',
      ),
      autovalidateMode: AutovalidateMode.onUserInteraction,
      validator: (v) => parseLandArea(v ?? '') == null ? 'Enter a number above 0' : null,
    );
  }
}

/// Dialog for changing the land area of a saved plot. Returns the new value,
/// or null if the agent cancels.
Future<double?> showLandAreaDialog(BuildContext context, {required double current, required double mappedAreaHa}) {
  final controller = TextEditingController(text: current.toStringAsFixed(2));
  final formKey = GlobalKey<FormState>();
  return showDialog<double>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Update land area'),
      content: Form(key: formKey, child: LandAreaField(controller: controller, mappedAreaHa: mappedAreaHa)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            if (!formKey.currentState!.validate()) return;
            Navigator.pop(context, parseLandArea(controller.text));
          },
          child: const Text('Save'),
        ),
      ],
    ),
  );
}
