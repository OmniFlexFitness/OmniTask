import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:omnitask_mobile/app.dart';

void main() {
  testWidgets('app boots and shows the My Tasks placeholder',
      (tester) async {
    await tester.pumpWidget(const ProviderScope(child: OmniTaskApp()));
    await tester.pumpAndSettle();

    expect(find.text('My Tasks'), findsOneWidget);
    expect(find.text('OmniTask'), findsOneWidget);
  });
}
