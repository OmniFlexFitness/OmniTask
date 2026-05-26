import 'package:flutter/material.dart';
import 'package:omniflex_design_system/omniflex_design_system.dart';

class MyTasksScreen extends StatelessWidget {
  const MyTasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Tasks')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(OmniFlexSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('OmniTask', style: OmniFlexTypography.displayLarge),
              const SizedBox(height: OmniFlexSpacing.md),
              Text(
                'Mobile scaffold ready. Auth + task feed lands in Phase 1.',
                style: OmniFlexTypography.body,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
