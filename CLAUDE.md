# omnitask — Claude Code Operating Notes

This file is read by Claude Code when invoked in this workspace. It mirrors `AGENTS.md` for shared conventions plus adds Claude-Code-specific workflow rules.

> **Hierarchy**: `GEMINI.md` (project map / source of truth) → `AGENTS.md` (agent-behavior + ecosystem context) → this file (Claude-Code-CLI-specific rules). When sections overlap, the more specific document wins for its narrow concern.

For canonical stack, brand, code conventions, and forbidden actions, see `AGENTS.md` and `GEMINI.md`. The lists below cover only the *additional* rules that apply when Claude Code is the executor.

---

## When Claude Code Should Plan First

Generate a plan in `docs/plans/{feature_name}.md` before implementing if any of these apply:

- The change touches more than 3 files
- The change adds a new feature directory under `src/app/features/`
- The change modifies Firestore security rules (`firestore.rules`) or Cloud Functions
- The change touches authentication, payment, role/permission, or other security-sensitive surfaces
- The change modifies the deploy chain (Dockerfile, nginx config, GitHub Actions workflows)
- The user's prompt is open-ended (e.g., "improve the dashboard") rather than scoped (e.g., "add empty-state illustration to dashboard")

Plans must include scope, files affected, implementation steps, test plan, and rollback considerations.

---

## Pre-Done Checklist

Before declaring any task complete, run and pass:

```bash
ng build --configuration production
ng test --watch=false --browsers=ChromeHeadless
ng lint    # if configured
```

If any step fails, fix and re-run before reporting completion. Do not paper over warnings with `// @ts-ignore` or `// eslint-disable-next-line` comments without justification in a code comment that names the specific rule and reason.

For Firebase Functions changes, additionally run:

```bash
cd functions && npm run build && npm run lint
```

---

## When to Reach for MCP Tools

Use MCP tools rather than guessing when:

- A prompt references a Figma component → use the Figma MCP to fetch the actual spec
- A prompt references a doc in Drive → use the Drive MCP (or `filesystem-drive-mirror`) to read it
- A prompt references a GitHub issue or PR → use the GitHub MCP to read the body and comments
- A prompt references "the spec" without a path → search Drive's Tech and Design folders before asking the user where it lives
- A prompt asks about Firestore data, deployed Functions, or Firebase project state → use the Firebase MCP rather than guessing or shelling out

Do not chain more than 3 MCP calls without surfacing intermediate results to the user.

---

## Obsidian Vault Integration

The Obsidian vault at `C:/OmniFlex Vault/` is canonical for cross-cutting OmniFlex knowledge.

Read these locations when relevant context is missing:
- `C:/OmniFlex Vault/Tech/` — technical decisions, ADRs, troubleshooting
- `C:/OmniFlex Vault/Knowledge/` — reference material
- `C:/OmniFlex Vault/Design/` — brand guidelines, design language
- `C:/OmniFlex Vault/Tech/antigravity-template/` — the canonical template this workspace was bootstrapped from; check here when propagating template updates back to the source

Write back to the vault only when explicitly instructed. Do not auto-update vault files based on session work.

---

## Output Format Rules

When Claude Code generates content for Bertin to consume directly (not code in the repo):

- **Copy-paste content** (commit messages, PR descriptions): always in code blocks
- **Long-form deliverables** (docs, scripts, multi-section drafts): file artifacts in `docs/` or `scripts/`
- **Decision support**: lead with the recommendation, then the reasoning. Do not list pros/cons without choosing
- **Technical explanations**: study-guide format with headers and bullets when substantive; prose for short answers

When generating content for end users of OmniTask (UI copy, push notifications, error messages, marketing strings):

- Apply the OmniFlex Voice (see `AGENTS.md` → Brand → Voice)
- Plain ASCII unless emoji or special characters are explicitly required
- No trailing periods on UI button labels or push notification titles
- Error messages: lead with what happened, then what the user can do
- Surface errors via `ToastService`, never as raw exceptions

---

## Code Review Mode

When prompted to review a diff or changeset, run the `omniflex-code-review` skill checklist before reporting findings. The checklist lives at `.antigravity/skills/omniflex-code-review/checklist.md`. Some items in that checklist were written for Flutter — apply the *spirit* (null-safety equivalents in TS, brand-token equivalents in Tailwind, etc.) and skip Flutter-specific items.

If any item in the checklist refers to Flutter packages, Dart, or pubspec.yaml, treat it as: "verify the Angular/TypeScript equivalent — strict types, no `any`, signal usage, modular Firebase API, no NgModules, etc."

Do not approve a change in review mode without explicitly running the checklist. If the user says "looks good, ship it" before checklist completion, complete the checklist anyway and surface anything found.

---

## Working Across Repos

Commands that span multiple OmniFlex repos (e.g., propagating a template update from `C:/OmniFlex Vault/Tech/antigravity-template/`) should be invoked from the parent directory `C:/Antigravity/` or wherever OmniFlex repos live, not from inside any individual repo. Cross-repo commands modify state in unexpected places, so:

- Confirm the list of repos affected before any write operation
- Operate on one repo at a time; commit between repos
- Surface any repo where the operation failed to apply cleanly

---

## Failure Modes to Anticipate

- **Firebase emulators not running**: integration tests will hang or hit production. Detect via `firebase emulators:exec` health check; surface clearly to user rather than waiting forever or silently using production.
- **Stale `node_modules`**: TypeScript "Cannot find module" errors that look like bad imports are often stale node_modules after a branch switch. Run `npm ci` (or `rm -rf node_modules && npm install`) before deeper investigation.
- **`functions/node_modules` drift**: the `functions/` directory has its own `package.json` and `node_modules`. After pulling, you may need `cd functions && npm ci` separately from the root install.
- **Angular cache poisoning**: weird template-not-found or schema errors after a major refactor often resolve with `rm -rf .angular/cache`.
- **Firebase Auth token expiry in dev**: causes "permission denied" Firestore errors that look like rules bugs. Refresh the auth state (sign out and back in) before assuming security rules are wrong.
- **Cloud Run deploy fails on push to `live`**: GitHub Actions deploy log is the source of truth. Don't push retry commits to `live` to "kick CI" — that ships untested code to production. Open a PR back to `live` instead.
- **Service account project mismatch**: `OMNIFLEX_FIREBASE_SERVICE_ACCOUNT` env var must reference a JSON key for project `omnitask-475422` for the Firebase MCP to work in this workspace. If it points elsewhere, the MCP will return 403s that look like permission bugs.
- **Antigravity MCP tool-name regex**: tool names with dots (`.`) fail Antigravity's `^[a-zA-Z0-9_-]` validation. If a server fails to register, scaffold a Node.js sanitizing proxy — don't disable the server.

---

## Mobile (Flutter)

A Flutter companion app lives at `mobile/`. It shares the `omnitask-475422` Firebase backend with the Angular web app — no separate database, no parallel auth. Roadmap and rationale: `docs/plans/omnitask-mobile-flutter.md`.

Stack: Flutter 3.27+ stable, Riverpod 2.x with `riverpod_generator`, `go_router`, FlutterFire (core/auth/firestore/functions/storage/messaging/app_check), `google_sign_in`, local design-system package at `mobile/packages/omniflex_design_system/`.

When working in `mobile/`:

- The Flutter side of `.antigravity/skills/omniflex-code-review/checklist.md` applies literally (the bullets that reference `AsyncValue`, `OmniFlexColors`, `pubspec.yaml`, App Check, `go_router`, etc.). The "spirit-not-letter" guidance above is for the Angular side only.
- Pre-done checklist for mobile changes: `cd mobile && flutter analyze && flutter test` (and `flutter build apk --debug` / `flutter build ios --no-codesign` if platform code changed). CI lives at `.github/workflows/mobile-ci.yml`.
- Never commit `lib/firebase_options.dart`, `android/app/google-services.json`, or `ios/Runner/GoogleService-Info.plist` — distribute via secrets manager.
- The Cloud Run web deploy chain (`.github/workflows/deploy-cloudrun.yml`) ignores `mobile/` via `.dockerignore`. Mobile pushes to `live` should not be made until intentional release.
