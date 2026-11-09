# Plan: Fully local backend + Claude-powered AI features

## Goal

Make OmniTask runnable end-to-end on a laptop with one command, with every
AI feature powered by the Claude API (Anthropic API key) instead of Vertex AI.
An internet connection is still needed for the Claude API itself and for
first-time package downloads; nothing else touches production.

## Current state (findings)

- **AI features**: four callable Cloud Functions in `functions/src/index.ts`
  (`generateSubtasks`, `suggestTaskPriority`, `suggestDueDate`,
  `enhanceTaskDescription`) call Vertex AI `gemini-1.5-flash`. That model
  family was retired by Google, and Vertex needs GCP credentials, so it can't
  run locally anyway.
- **No emulator setup**: `firebase.json` has no `emulators` block, and
  `src/app/app.config.ts` hardcodes the production Firebase project with no
  `connect*Emulator` calls. Running `ng serve` today talks to production.
- **Deploy chain quirks that constrain this change**:
  - `functions/lib/` is git-tracked and deployed as committed (no build step in
    `deploy-cloudrun.yml`), so it must be rebuilt and committed.
  - `deploy-cloudrun.yml` pre-creates placeholder secrets because
    `firebase deploy --non-interactive` aborts on any bound secret missing from
    Secret Manager. A new `ANTHROPIC_API_KEY` secret must be added to that list.
  - `functions/node_modules/` was git-tracked (legacy, committed from Windows, so
    `.bin` entries lacked the executable bit and the Functions emulator failed
    with `EACCES` on macOS/Linux). #212 untracked it; every environment now runs
    `cd functions && npm ci`, and the launcher does so when the tree is missing
    or stale.
- **Email**: `sendTaskAssignmentEmail` fires on every task write and sends real
  Gmail SMTP mail (always including the admin inbox). Unsafe to run locally.
- **No `ToastService`** exists despite the docs; `DialogService.alert()` is the
  app's user-facing error channel. The AI components only `console.error`.

## Decisions

1. **Claude everywhere, one code path.** The four AI functions call Claude in
   both production and the emulator. Local and prod behave identically, and
   the retired Gemini dependency goes away.
2. **Model**: `claude-opus-5-5` (`DEFAULT_CLAUDE_MODEL` in code; `ANTHROPIC_MODEL`
   in `functions/.env.local` overrides it in the emulator only, since `.env`
   files are gitignored and never reach the CI deploy).
   - Effort tuned per task: `low` for classification-style suggestions
     (priority, due date), `medium` for generation (subtasks, description).
   - **Structured outputs** (`output_config.format` JSON schema) guarantee
     parseable JSON. This replaces the old regex-strip-markdown-then-`JSON.parse`.
   - **Server-side refusal fallback** (`fallbacks: "default"`) is on for the
     models that support it.
3. **Credential**: `ANTHROPIC_API_KEY` is a Firebase secret (`defineSecret`).
   Locally it lives in `functions/.secret.local` (gitignored). In production
   it is seeded into Secret Manager from the GitHub repository secret by the
   deploy workflow, or set with `firebase functions:secrets:set`.
4. **Emulators run under a `demo-omnitask` project ID** so nothing can reach
   production by accident.
5. **Angular `local` build configuration** with `fileReplacements`; production
   builds are unaffected.
6. **Dev mail sink** inside the emulator (nodemailer `jsonTransport`), opt out
   with `EMULATOR_SEND_REAL_EMAIL=true`.
7. **One cross-platform launcher** (`scripts/local-dev.mjs`, plain Node).
8. **Live verification in CI**: `functions/scripts/ai-smoke.mjs` makes one real
   Claude call in PR validation when the repository secret is present.
9. **AI failures are shown to the user** via `DialogService.alert()`.

## Files affected

| File | Change |
|---|---|
| `functions/src/ai/claude.ts` | New: lazy Anthropic client, JSON helper, error mapping |
| `functions/src/index.ts` | Rewire 4 AI callables to Claude; drop Vertex; dev mail sink |
| `functions/scripts/ai-smoke.mjs` | New: live one-request smoke test |
| `functions/package.json`, `package-lock.json` | `+@anthropic-ai/sdk`, `-@google-cloud/vertexai` |
| `functions/lib/**` | Rebuilt output (deploy uses committed `lib/`) |
| `functions/.secret.local.example` | New: template for local secrets |
| `firebase.json` | `emulators` block |
| `src/environments/environment{,.local}.ts` | New: prod + local Firebase config |
| `src/app/app.config.ts` | Read config from environment; connect emulators when enabled |
| `src/app/core/services/ai-error.util.ts` | New: user-facing message for failed AI calls |
| `task-ai-actions.ts`, `task-ai-suggestions.ts` | Surface AI failures via `DialogService` |
| `angular.json` | `local` build + serve configurations |
| `package.json` | `dev:local`, `emulators`, `start:local` scripts |
| `scripts/local-dev.mjs` | New launcher |
| `.gitignore` | `.secret.local`, `.emulator-data/` |
| `.github/workflows/deploy-cloudrun.yml` | Seed `ANTHROPIC_API_KEY` secret |
| `.github/workflows/pr-validation.yml` | Functions unit tests + AI smoke test |
| `docs/local-development.md`, `README.md`, `GEMINI.md`, `AGENTS.md` | Docs |

## Out of scope (documented as "not available locally")

Firebase Extensions, Google OAuth-backed features, GitHub Issues integration,
scheduled functions, mobile emulator wiring.

## Test plan

- `cd functions && npm run build && npm test`
- `ng build --configuration production`, `ng build --configuration local`,
  `ng lint`, `ng test --watch=false --browsers=ChromeHeadless`
- Boot the emulators under `demo-omnitask` and verify:
  - Callables reject unauthenticated calls.
  - With no API key, the callable returns a clear `failed-precondition`
    message, not a crash.
  - With a key (or a mock API), each callable returns schema-valid JSON and
    the request carries the expected model, beta header and `output_config`.
  - A task write in the Firestore emulator triggers the mail sink, not SMTP.
- CI: the `Claude AI smoke test` step passes on the PR.

## Rollback

- Revert the PR.
- Prod-side effects are limited to one extra Secret Manager secret, which is
  harmless if left in place.
