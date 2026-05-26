import 'package:flutter/material.dart';
import 'package:omniflex_design_system/omniflex_design_system.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(OmniFlexSpacing.lg),
          child: Text(
            'Workspace dashboard — coming in Phase 1',
            style: OmniFlexTypography.body,
          ),
        ),
      ),
    );
  }
}
