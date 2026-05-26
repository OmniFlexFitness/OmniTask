import 'package:flutter/material.dart';

import 'colors.dart';

/// Glow / glass effects. Use these instead of recreating BoxShadow inline —
/// the OmniFlex code-review checklist §3 forbids ad-hoc glow.
abstract final class OmniFlexEffects {
  static const List<BoxShadow> neonGlow = <BoxShadow>[
    BoxShadow(
      color: OmniFlexColors.primaryPurple40,
      blurRadius: 24,
      spreadRadius: 0,
    ),
  ];

  static const List<BoxShadow> subtleGlow = <BoxShadow>[
    BoxShadow(
      color: OmniFlexColors.primaryPurple20,
      blurRadius: 12,
      spreadRadius: 0,
    ),
  ];

  static const List<BoxShadow> elevation = <BoxShadow>[
    BoxShadow(
      color: OmniFlexColors.shadow,
      blurRadius: 16,
      offset: Offset(0, 4),
    ),
  ];

  static BoxDecoration glassPanel({double radius = 16}) => BoxDecoration(
        color: OmniFlexColors.glassSurface,
        borderRadius: BorderRadius.all(Radius.circular(radius)),
        border: Border.all(color: OmniFlexColors.border),
      );
}
