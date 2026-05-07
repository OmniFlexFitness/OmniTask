import 'package:flutter_riverpod/flutter_riverpod.dart';

// Placeholder. Phase 1 will wire firebase_auth + google_sign_in here, mirroring
// the multi-scope OAuth flow used by src/app/core/auth/auth.service.ts.
final authStateProvider = StateProvider<bool>((ref) => false);
