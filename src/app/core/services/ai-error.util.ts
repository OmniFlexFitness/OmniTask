/**
 * Pick a user-facing message for a failed AI callable.
 *
 * The Cloud Functions in functions/src/ai/claude.ts throw HttpsError with
 * messages written for end users (e.g. "AI features are not configured..."),
 * so those are shown as-is. Transport-level failures (offline, emulator not
 * running) have no useful message and get a generic one.
 *
 * The check is duck-typed on the `functions/...` error code rather than
 * `instanceof FirebaseError`: the app bundle contains more than one copy of
 * `@firebase/util` (via @angular/fire and firebase), so the class identity
 * check is not reliable, but the error shape is.
 */
export const GENERIC_AI_ERROR_MESSAGE =
  'The AI assistant could not complete that request. Try again in a moment.';

/** True for the error object `httpsCallable()` rejects with. */
export function isCallableError(err: unknown): err is { code: string; message: string } {
  if (typeof err !== 'object' || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return typeof code === 'string' && code.startsWith('functions/') && typeof message === 'string';
}

export function aiErrorMessage(err: unknown): string {
  if (isCallableError(err)) {
    // The callable surfaced an HttpsError: its message is already user-facing,
    // except for 'internal' carrying the SDK's default text.
    const message = err.message.trim();
    if (message && !/^internal$/i.test(message)) {
      return message;
    }
  }
  return GENERIC_AI_ERROR_MESSAGE;
}
