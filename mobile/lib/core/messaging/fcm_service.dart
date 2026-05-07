import 'package:flutter_riverpod/flutter_riverpod.dart';

// Phase 3 stub. Full implementation will:
//   1. Request notification permission (iOS + Android 13+)
//   2. Register the FCM token at users/{uid}/fcmTokens/{tokenId} on login
//      and on onTokenRefresh; delete on logout.
//   3. Wire a top-level @pragma('vm:entry-point') background handler that
//      calls Firebase.initializeApp() inside its own isolate.
//   4. Display foreground notifications via flutter_local_notifications.
//   5. Deep-link via go_router to /tasks/:id on tap.
//
// Backend pairing: a new Cloud Function `sendTaskAssignmentPush` (sibling to
// sendTaskAssignmentEmail in functions/src/index.ts) fans out via
// admin.messaging().sendEachForMulticast and prunes
// messaging/registration-token-not-registered errors.
final fcmServiceReadyProvider = Provider<bool>((ref) => false);
