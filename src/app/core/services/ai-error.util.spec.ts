import { aiErrorMessage, GENERIC_AI_ERROR_MESSAGE, isCallableError } from './ai-error.util';

describe('aiErrorMessage', () => {
  it('returns the backend message for a callable error', () => {
    const err = {
      code: 'functions/failed-precondition',
      message: 'AI features are not configured. Add your Anthropic API key.',
    };
    expect(isCallableError(err)).toBeTrue();
    expect(aiErrorMessage(err)).toBe('AI features are not configured. Add your Anthropic API key.');
  });

  it("falls back to the generic message when the callable message is just 'internal'", () => {
    expect(aiErrorMessage({ code: 'functions/internal', message: 'internal' })).toBe(
      GENERIC_AI_ERROR_MESSAGE,
    );
  });

  it('falls back to the generic message for non-callable errors', () => {
    expect(aiErrorMessage(new Error('Failed to fetch'))).toBe(GENERIC_AI_ERROR_MESSAGE);
    expect(aiErrorMessage(undefined)).toBe(GENERIC_AI_ERROR_MESSAGE);
    expect(aiErrorMessage({ code: 'auth/invalid', message: 'x' })).toBe(GENERIC_AI_ERROR_MESSAGE);
  });
});
