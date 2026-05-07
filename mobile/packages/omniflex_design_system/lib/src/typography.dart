import 'package:flutter/material.dart';

import 'colors.dart';

/// OmniFlex type scale. All user-facing text must use one of these styles.
abstract final class OmniFlexTypography {
  static const String _family = 'Inter';

  static const TextStyle displayLarge = TextStyle(
    fontFamily: _family,
    fontSize: 32,
    fontWeight: FontWeight.w700,
    height: 1.2,
    color: OmniFlexColors.textPrimary,
    letterSpacing: -0.5,
  );

  static const TextStyle displayMedium = TextStyle(
    fontFamily: _family,
    fontSize: 24,
    fontWeight: FontWeight.w700,
    height: 1.25,
    color: OmniFlexColors.textPrimary,
    letterSpacing: -0.25,
  );

  static const TextStyle headline = TextStyle(
    fontFamily: _family,
    fontSize: 20,
    fontWeight: FontWeight.w600,
    height: 1.3,
    color: OmniFlexColors.textPrimary,
  );

  static const TextStyle title = TextStyle(
    fontFamily: _family,
    fontSize: 17,
    fontWeight: FontWeight.w600,
    height: 1.35,
    color: OmniFlexColors.textPrimary,
  );

  static const TextStyle body = TextStyle(
    fontFamily: _family,
    fontSize: 15,
    fontWeight: FontWeight.w400,
    height: 1.45,
    color: OmniFlexColors.textPrimary,
  );

  static const TextStyle bodySecondary = TextStyle(
    fontFamily: _family,
    fontSize: 15,
    fontWeight: FontWeight.w400,
    height: 1.45,
    color: OmniFlexColors.textSecondary,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: _family,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    height: 1.4,
    color: OmniFlexColors.textSecondary,
  );

  static const TextStyle button = TextStyle(
    fontFamily: _family,
    fontSize: 15,
    fontWeight: FontWeight.w600,
    height: 1.2,
    color: OmniFlexColors.textPrimary,
    letterSpacing: 0.2,
  );
}
