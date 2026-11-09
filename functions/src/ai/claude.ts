/**
 * Claude (Anthropic API) access for OmniTask's AI task features.
 *
 * Every AI callable (subtasks, priority, due date, description) goes through
 * `generateJson()`, which:
 *  - reads the API key from the ANTHROPIC_API_KEY Firebase secret
 *    (Secret Manager in production, functions/.secret.local in the emulator);
 *  - uses structured outputs (`output_config.format`) so the response is
 *    guaranteed to be JSON matching the caller's schema;
 *  - opts into server-side refusal fallback on models that support it, so a
 *    safety-classifier false positive is retried on another model instead of
 *    failing the button;
 *  - maps SDK errors to HttpsError codes with user-facing messages.
 *
 * The SDK is required lazily (same pattern as the other heavy SDKs in
 * index.ts) so it stays out of the shared gen2 container's cold start.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import type Anthropic from '@anthropic-ai/sdk';

/** Set via `firebase functions:secrets:set ANTHROPIC_API_KEY` (prod) or functions/.secret.local (emulator). */
export const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

/** Default model. Override with ANTHROPIC_MODEL in functions/.env (prod) or functions/.env.local (emulator). */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/**
 * Models that accept `output_config.effort`. Unknown/older models (e.g.
 * Haiku 4.5) reject it with a 400, so effort is only sent to these.
 */
const EFFORT_CAPABLE_MODELS = new Set([
  'claude-fable-5-1',
  'claude-fable-5',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5-5',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
]);

/** Models that accept server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_CAPABLE_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Value the deploy workflow seeds into Secret Manager before a real key is set. */
const PLACEHOLDER_SECRET_VALUE = 'placeholder';

export type ClaudeEffort = 'low' | 'medium' | 'high';

export interface ClaudeJsonRequest {
  /** Short label for logs, e.g. "generateSubtasks". */
  task: string;
  /** Stable instructions (role, rules, output expectations). */
  system: string;
  /** Per-request content: the task data to act on. */
  prompt: string;
  /** JSON schema the response must match (structured outputs). */
  schema: Record<string, unknown>;
  /** Thinking depth: `low` for classification-style calls, `medium` for generation. */
  effort: ClaudeEffort;
}

/** True when running inside the Firebase Functions emulator. */
export function isFunctionsEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

/** Model used for AI features: ANTHROPIC_MODEL if set, else the default. */
export function claudeModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
}

type AnthropicModule = typeof import('@anthropic-ai/sdk');
let _sdk: AnthropicModule | undefined;
function getSdk(): AnthropicModule {
  return (_sdk ??= require('@anthropic-ai/sdk') as AnthropicModule);
}

let _client: Anthropic | undefined;
let _clientApiKey: string | undefined;
function getClient(apiKey: string): Anthropic {
  if (!_client || _clientApiKey !== apiKey) {
    const { Anthropic: AnthropicClient } = getSdk();
    // Callables time out at 120s (see AI_CALLABLE_OPTIONS in index.ts). 55s x
    // (1 + 1 retry) keeps the worst case inside that window while still
    // retrying one 429/5xx/timeout.
    _client = new AnthropicClient({ apiKey, timeout: 55_000, maxRetries: 1 });
    _clientApiKey = apiKey;
  }
  return _client;
}

function notConfiguredError(): HttpsError {
  console.error(
    '[claude] ANTHROPIC_API_KEY is missing or invalid. ' +
      'Local: add it to functions/.secret.local and restart the emulators. ' +
      'Production: firebase functions:secrets:set ANTHROPIC_API_KEY, then redeploy functions.',
  );
  return new HttpsError(
    'failed-precondition',
    isFunctionsEmulator()
      ? 'AI features are not configured. Add your Anthropic API key to functions/.secret.local and restart the emulators.'
      : 'AI features are not configured yet. Ask an admin to add an Anthropic API key.',
  );
}

/**
 * Translate an Anthropic SDK error into an HttpsError the client can show.
 * Checked most-specific first so retryable and non-retryable failures stay
 * distinguishable.
 */
function toHttpsError(error: unknown, task: string): HttpsError {
  const sdk = getSdk();
  console.error(`[claude] ${task} failed:`, error);

  if (error instanceof sdk.AuthenticationError || error instanceof sdk.PermissionDeniedError) {
    return notConfiguredError();
  }
  if (error instanceof sdk.NotFoundError) {
    return new HttpsError(
      'failed-precondition',
      `The configured Claude model (${claudeModel()}) is not available to this API key. Check ANTHROPIC_MODEL.`,
    );
  }
  if (error instanceof sdk.RateLimitError) {
    return new HttpsError(
      'resource-exhausted',
      'Claude is handling too many requests right now. Wait a moment and try again.',
    );
  }
  if (error instanceof sdk.BadRequestError) {
    return new HttpsError(
      'internal',
      'The AI request was rejected. Try shortening the task description and try again.',
    );
  }
  if (error instanceof sdk.APIConnectionTimeoutError) {
    return new HttpsError('deadline-exceeded', 'Claude took too long to respond. Try again.');
  }
  if (error instanceof sdk.APIConnectionError) {
    return new HttpsError(
      'unavailable',
      'Could not reach Claude. Check your internet connection and try again.',
    );
  }
  if (error instanceof sdk.APIError) {
    return new HttpsError('unavailable', 'Claude is temporarily unavailable. Try again in a minute.');
  }
  return new HttpsError('internal', 'The AI request failed unexpectedly. Try again.');
}

/**
 * Run a single Claude request whose response must be JSON matching `schema`.
 * Throws HttpsError on any failure (never returns partial data).
 */
export async function generateJson<T>(request: ClaudeJsonRequest): Promise<T> {
  const apiKey = anthropicApiKey.value()?.trim();
  if (!apiKey || apiKey === PLACEHOLDER_SECRET_VALUE) {
    throw notConfiguredError();
  }

  const model = claudeModel();
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 16000,
    system: request.system,
    messages: [{ role: 'user', content: request.prompt }],
    output_config: {
      format: { type: 'json_schema', schema: request.schema },
      ...(EFFORT_CAPABLE_MODELS.has(model) ? { effort: request.effort } : {}),
    },
  };
  if (FALLBACK_CAPABLE_MODELS.has(model)) {
    params.betas = [SERVER_SIDE_FALLBACK_BETA];
    params.fallbacks = 'default';
  }

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await getClient(apiKey).beta.messages.create(params);
  } catch (error) {
    throw toHttpsError(error, request.task);
  }

  console.log(
    `[claude] ${request.task} model=${response.model} stop=${response.stop_reason} ` +
      `in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
  );

  if (response.stop_reason === 'refusal') {
    throw new HttpsError(
      'failed-precondition',
      'Claude declined this request. Rephrase the task and try again.',
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new HttpsError(
      'internal',
      "Claude's response was cut off. Try again with a shorter description.",
    );
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    console.error(`[claude] ${request.task} returned non-JSON output:`, text, error);
    throw new HttpsError('internal', 'Claude returned an unreadable response. Try again.');
  }
}
