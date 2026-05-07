import 'package:flutter/material.dart';

/// OmniTask palette. Source of truth: AGENTS.md / GEMINI.md.
///
/// Keep in sync with the web Tailwind config until a generator script bridges
/// the two. Do not introduce new color values outside this file — the
/// OmniFlex code-review checklist forbids hardcoded `Color(0xFF...)` usages.
abstract final class OmniFlexColors {
  // Brand
  static const Color primaryPurple = Color(0xFF8B5CF6);
  static const Color primaryPurple40 = Color(0x668B5CF6); // 40% opacity — neon glow
  static const Color primaryPurple20 = Color(0x338B5CF6); // 20% opacity — subtle glow
  static const Color secondaryBlue = Color(0xFF3B82F6);
  static const Color accentCyan = Color(0xFF06B6D4);

  // Backgrounds (dark theme baseline)
  static const Color deepBackground = Color(0xFF0F0F0F);
  static const Color surface = Color(0xFF1A1A1A);
  static const Color glassSurface = Color(0x0DFFFFFF); // rgba(255,255,255,0.05)
  static const Color border = Color(0x14FFFFFF); // rgba(255,255,255,0.08) — glass borders + dividers
  static const Color shadow = Color(0x66000000); // rgba(0,0,0,0.4) — elevation shadow

  // Text
  static const Color textPrimary = Color(0xFFF5F5F5);
  static const Color textSecondary = Color(0xFFB3B3B3);
  static const Color textTertiary = Color(0xFF7A7A7A);

  // Status
  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);

  // Violet ramp (mirrors tailwind.config.js)
  static const Color violet50 = Color(0xFFF5F0FF);
  static const Color violet100 = Color(0xFFEFE5FF);
  static const Color violet200 = Color(0xFFDCC6FF);
  static const Color violet300 = Color(0xFFC19DFF);
  static const Color violet400 = Color(0xFFA36EFF);
  static const Color violet500 = Color(0xFF8225E6);
  static const Color violet600 = Color(0xFF6F19CC);
  static const Color violet700 = Color(0xFF560CA3);
  static const Color violet800 = Color(0xFF3E067A);
  static const Color violet900 = Color(0xFF2B0359);
  static const Color violet950 = Color(0xFF1B003D);

  static const MaterialColor violet = MaterialColor(0xFF8225E6, <int, Color>{
    50: violet50,
    100: violet100,
    200: violet200,
    300: violet300,
    400: violet400,
    500: violet500,
    600: violet600,
    700: violet700,
    800: violet800,
    900: violet900,
  });
}
