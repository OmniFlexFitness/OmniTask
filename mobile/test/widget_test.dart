import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:omnitask_mobile/app.dart';

void main() {
  setUpAll(() {
    // Don't hit the network during tests; fall back to the platform font
    // when Inter isn't already cached locally.
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('app boots and shows the My Tasks placeholder',
      (tester) async {
    await tester.pumpWidget(const ProviderScope(child: OmniTaskApp()));
    await tester.pumpAndSettle();

    expect(find.text('My Tasks'), findsOneWidget);
    expect(find.text('OmniTask'), findsOneWidget);
  });
}
