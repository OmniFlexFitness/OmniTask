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

---

## Addendum: Build Console launcher and Windows-safe shutdown

### Scope

1. **Build Console as a local program.** The console page that is published
   as an Artifact also runs from the checkout: `scripts/launch-console.mjs`
   serves `scripts/console/console.html` on `http://127.0.0.1:4310`, and its
   Start / Stop / Check buttons act on the local stack. A Windows shortcut
   (Desktop + Start menu) starts it like an installed program. Plain Node, no
   new dependencies, no administrator rights.
2. **Managed stop for `scripts/local-dev.mjs`.** When started with an IPC
   channel (as the console does) it stops on a `{ type: 'shutdown' }` message
   and when the channel closes.
3. **Windows-safe shutdown.** `taskkill /T /F` used to end the emulators
   before they could export `.emulator-data/`. Now: after a console Ctrl+C the
   launcher waits for the emulators' own export (until the Emulator Hub port
   closes, at most 30 s) and only then removes what is left; for every other
   stop it first asks the Emulator Hub to export (`POST /_admin/export`, at
   most 30 s) and then ends the process trees. POSIX behaviour is unchanged
   (SIGINT to each child's process group); the last-resort exit deadline went
   from 15 s to 45 s so a slow export is not cut off.
4. **Dev server fix.** The `vite` resolution moves from `^6.4.3` to `^7.3.7`.
   `@angular/build` 21.2 is written for Vite 7 and patches its client; with
   Vite 6 forced in, `GET /@vite/client` answered 500 and the app never
   rendered under `ng serve`. 7.3.7 is the first 7.x release outside the range
   of every advisory the 6.4.3 pin was added for.

Security model of the console server: loopback only, `Host` and `Origin`
checked on every request, a per-run token on the API, JSON bodies only, and a
fixed allowlist of actions with fixed argument lists.

### Files affected

| File | Change |
|---|---|
| `scripts/launch-console.mjs` | New: local HTTP server + process manager for the console |
| `scripts/launch-console.test.mjs` | New: `node --test` tests for the launcher |
| `scripts/console/console.html` | New: the console page (Artifact body format) |
| `scripts/console/omnitask-console.ico` | New: multi-size (16 to 256 px) brand icon for the shortcut |
| `scripts/console-shortcut.ps1` | New: installs / removes the Desktop and Start menu shortcuts |
| `scripts/local-dev.mjs` | IPC stop + disconnect, hub export before a Windows kill, Node started without a shell on Windows, "up" reported only when all four emulators are listening |
| `.gitignore` | `firebase-export-*/` (working folder a failed emulator export leaves behind) |
| `package.json`, `yarn.lock` | `console`, `console:shortcut` scripts; `vite` resolution `^7.3.7` |
| `.github/workflows/pr-validation.yml` | Step: `node --test scripts/*.test.mjs` |
| `docs/local-development.md`, `README.md` | Build Console section, corrected sign-in guidance, troubleshooting rows |

### Test plan

- `node --test scripts/*.test.mjs` (launcher guard, parsing, wrapping, actions).
- `yarn build`, `yarn lint`, `yarn test --no-watch --no-progress --browsers=ChromeHeadless`.
- `ng serve --configuration local`: `/@vite/client` answers 200 and the login
  page renders.
- Linux/macOS, emulators only: write a Firestore document, stop once with an
  IPC `shutdown` message and once with SIGINT; each time `.emulator-data/`
  must contain the document and no emulator, Java or `tsc` process may remain.
- Windows (manual, on the laptop): `yarn console:shortcut`, open the shortcut,
  Start, add a task in the app, Stop; Start again and confirm the task is
  still there. Repeat with `yarn dev:local` and Ctrl+C in a terminal.

### Rollback

- Revert the commits. The console is additive: nothing in the app, the
  Functions or the deploy chain depends on it.
- Remove installed shortcuts with `yarn console:shortcut -Remove` (or delete
  `OmniTask Build Console.lnk` from the Desktop and the Start menu).
- If only the Vite change must go, restoring `"vite": "^6.4.3"` and running
  `yarn install` brings back the previous lockfile state, and with it the
  broken dev server.
