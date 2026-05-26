import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'colors.dart';

/// OmniFlex type scale. All user-facing text must use one of these styles.
///
/// Powered by `google_fonts` so the Inter family is fetched at first launch
/// without needing to bundle the .ttf files. In tests / offline contexts,
/// set `GoogleFonts.config.allowRuntimeFetching = false` and the styles
/// fall back to the platform default font.
abstract final class OmniFlexTypography {
  static TextStyle get displayLarge => GoogleFonts.inter(
        textStyle: const TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.w700,
          height: 1.2,
          color: OmniFlexColors.textPrimary,
          letterSpacing: -0.5,
        ),
      );

  static TextStyle get displayMedium => GoogleFonts.inter(
        textStyle: const TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w700,
          height: 1.25,
          color: OmniFlexColors.textPrimary,
          letterSpacing: -0.25,
        ),
      );

  static TextStyle get headline => GoogleFonts.inter(
        textStyle: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          height: 1.3,
          color: OmniFlexColors.textPrimary,
        ),
      );

  static TextStyle get title => GoogleFonts.inter(
        textStyle: const TextStyle(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          height: 1.35,
          color: OmniFlexColors.textPrimary,
        ),
      );

  static TextStyle get body => GoogleFonts.inter(
        textStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w400,
          height: 1.45,
          color: OmniFlexColors.textPrimary,
        ),
      );

  static TextStyle get bodySecondary => GoogleFonts.inter(
        textStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w400,
          height: 1.45,
          color: OmniFlexColors.textSecondary,
        ),
      );

  static TextStyle get caption => GoogleFonts.inter(
        textStyle: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w400,
          height: 1.4,
          color: OmniFlexColors.textSecondary,
        ),
      );

  static TextStyle get button => GoogleFonts.inter(
        textStyle: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          height: 1.2,
          color: OmniFlexColors.textPrimary,
          letterSpacing: 0.2,
        ),
      );
}
