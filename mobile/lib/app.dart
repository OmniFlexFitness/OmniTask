import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:omniflex_design_system/omniflex_design_system.dart';

import 'core/router/app_router.dart';

class OmniTaskApp extends ConsumerWidget {
  const OmniTaskApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'OmniTask',
      debugShowCheckedModeBanner: false,
      theme: OmniFlexTheme.dark(),
      routerConfig: router,
    );
  }
}
