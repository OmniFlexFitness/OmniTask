#!/usr/bin/env node
/**
 * Live smoke test for the Claude integration in functions/src/ai/claude.ts.
 *
 * Makes ONE small request through generateJson() against the real Anthropic
 * API and checks the structured-output JSON comes back in the requested shape.
 * This catches what unit tests and the emulator cannot: a model ID, beta
 * header, or request parameter the API no longer accepts.
 *
 * Usage (after `npm run build`):
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/ai-smoke.mjs
 *
 * Runs in CI as the "Claude AI smoke test" step of the `validate` job in
 * .github/workflows/pr-validation.yml when the ANTHROPIC_API_KEY_CI (or, as a
 * fallback, ANTHROPIC_API_KEY) repository secret is set; skipped on fork PRs.
 * Costs a fraction of a cent.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set; nothing to test.');
  process.exit(2);
}

// defineSecret().value() reads process.env outside of a deploy, and the admin
// SDK needs a project id to initialize when lib/index.js is not loaded.
process.env.GCLOUD_PROJECT ??= 'demo-omnitask';

const { generateJson, claudeModel } = require('../lib/ai/claude.js');

const started = Date.now();
try {
  const result = await generateJson({
    task: 'ai-smoke',
    effort: 'low',
    maxTokens: 1024,
    system: 'You are a test fixture. Answer exactly as the schema requires.',
    prompt: '<task_title>\nSmoke test: reply with ok=true and one word in note.\n</task_title>',
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, note: { type: 'string' } },
      required: ['ok', 'note'],
      additionalProperties: false,
    },
  });

  if (result?.ok !== true || typeof result?.note !== 'string') {
    console.error('Unexpected response shape:', JSON.stringify(result));
    process.exit(1);
  }
  console.log(
    `ai-smoke OK: model=${claudeModel()} note="${result.note}" (${Date.now() - started} ms)`,
  );
} catch (err) {
  // HttpsError from generateJson carries a user-facing message plus the gRPC-style code.
  console.error('ai-smoke FAILED:', err?.code ?? '', err?.message ?? err);
  process.exit(1);
}
