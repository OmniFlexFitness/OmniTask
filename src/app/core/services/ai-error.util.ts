import { FirebaseError } from '@angular/fire/app';

/**
 * Pick a user-facing message for a failed AI callable.
 *
 * The Cloud Functions in functions/src/ai/claude.ts throw HttpsError with
 * messages written for end users (e.g. "AI features are not configured..."),
 * so those are shown as-is. Transport-level failures (offline, emulator not
 * running) have no useful message and get a generic one.
 */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    // The callable surfaced an HttpsError: message is already user-facing,
    // except for 'internal' with the SDK's default text.
    if (err.message && !/^internal$/i.test(err.message.trim())) {
      return err.message;
    }
  }
  return 'The AI assistant could not complete that request. Try again in a moment.';
}
