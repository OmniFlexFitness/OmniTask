import 'package:flutter/material.dart';

import 'colors.dart';
import 'radii.dart';
import 'typography.dart';

abstract final class OmniFlexTheme {
  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);
    final colorScheme = ColorScheme.fromSeed(
      seedColor: OmniFlexColors.primaryPurple,
      brightness: Brightness.dark,
      surface: OmniFlexColors.surface,
      primary: OmniFlexColors.primaryPurple,
      secondary: OmniFlexColors.secondaryBlue,
      tertiary: OmniFlexColors.accentCyan,
      error: OmniFlexColors.danger,
    );

    return base.copyWith(
      colorScheme: colorScheme,
      scaffoldBackgroundColor: OmniFlexColors.deepBackground,
      canvasColor: OmniFlexColors.deepBackground,
      appBarTheme: AppBarTheme(
        backgroundColor: OmniFlexColors.deepBackground,
        foregroundColor: OmniFlexColors.textPrimary,
        elevation: 0,
        titleTextStyle: OmniFlexTypography.headline,
      ),
      textTheme: base.textTheme.copyWith(
        displayLarge: OmniFlexTypography.displayLarge,
        displayMedium: OmniFlexTypography.displayMedium,
        headlineMedium: OmniFlexTypography.headline,
        titleMedium: OmniFlexTypography.title,
        bodyMedium: OmniFlexTypography.body,
        bodySmall: OmniFlexTypography.caption,
        labelLarge: OmniFlexTypography.button,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: OmniFlexColors.primaryPurple,
          foregroundColor: OmniFlexColors.textPrimary,
          textStyle: OmniFlexTypography.button,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(OmniFlexRadii.md)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        ),
      ),
      cardTheme: const CardThemeData(
        color: OmniFlexColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(OmniFlexRadii.lg)),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: OmniFlexColors.border,
        space: 1,
        thickness: 1,
      ),
    );
  }
}
