# GitHub Issues Integration — Phase 1 Plan

> Status: **DRAFT, awaiting approval.** Phase 1 only. Per the build prompt, stop after Phase 1
> and demo the connection flow + a create→close round-trip before continuing.

## Decisions locked in (from review)

- **Architecture:** Firebase-native. The build prompt's Postgres/Prisma/Next.js/BullMQ stack does
  not exist here. OmniTask is Angular 21 + Firestore + Cloud Functions (Node 20). We keep the
  prompt's data model + sync semantics but re-target the platform:
  - Prisma tables → **Firestore collections**
  - Next.js Route Handler webhook → **HTTPS Cloud Function** (`githubWebhook`)
  - BullMQ retryable queue → **Cloud Tasks** queue draining to a worker function (`processGithubSyncJob`)
  - "Encrypt tokens at rest" → tokens stored only in `users/{uid}/private/*` (admin-SDK only, never
    client-readable, mirroring the existing Google OAuth pattern); envelope encryption via Cloud KMS
    is a hardening follow-up tracked below.
- **Identity:** **Per-user GitHub identity** (GitHub App user-to-server tokens). Mirrors the existing
  per-user Google OAuth token storage. Writes are attributed to the acting user's installation token.
- **Data-model column spec:** The authoritative `OmniTask_GitHub_Integration_Spec.md §5` is not in the
  repo; user will paste it. **The Firestore schema below is provisional** and will be reconciled with §5
  before any migration/seed code is written.

## Hard constraints honored (prompt §"Hard constraints")

1. All GitHub API calls server-side (Cloud Functions); tokens never reach the browser.
2. **GitHub App** (installation + user-to-server tokens), not classic OAuth. Webhooks on the App.
3. Hybrid client: REST (Octokit `@octokit/rest`) for issues; GraphQL (`@octokit/graphql`) reserved for
   Projects v2 / linked branches in Phase 3.
4. Capability-detect per connection; defer Issue Types / Issue Fields / Projects to Phase 2–3.
5. Webhooks: verify `X-Hub-Signature-256` (HMAC-SHA256 over raw body), dedupe on `X-GitHub-Delivery`,
   process async (enqueue + return 200 fast).
6. Conflict handling by `updated_at`, last-writer-wins, `sync_state='conflict'` flag, echo-loop
   suppression for our own bot writes.
7. Every outbound write is a queued, retryable, diff-based job; never orphan an issue — keep it, mark
   `error`, expose "Retry sync."

## Phase 1 scope (only this ships now)

- GitHub App setup docs (`docs/github-app-setup.md`).
- Per-user connection / OAuth flow (connect, status, disconnect) under Settings.
- Firestore data model + security rules for the new collections.
- Create-issue on link + **close ↔ Done** bidirectional sync (status only).
- Webhook receiver with signature verification + idempotency dedupe.
- Tests: signature verification, idempotency dedupe, conflict resolution, and an
  **unlinked-task regression test** proving no behavior change.

Explicitly **out of scope** for Phase 1 (later phases): Issue Types, Issue Fields (Priority/Effort),
sub-issues, dependencies, Projects v2, linked branches, participants mirror, conflict UI, security-alert
reference linking.

## Status mapping (Phase 1)

OmniTask `status` is `'todo' | 'in-progress' | 'done'`. GitHub issue state is binary `open`/`closed`.

- `done` → GitHub `closed`
- `todo` / `in-progress` → GitHub `open`
- Inbound `closed` → `done`; inbound `reopened` → `todo` **only if** the task is currently `done`
  (preserves `in-progress` set on the OmniTask side — flagged as an open question below).

Richer statuses driving a Project "Status" field is a Phase 3 concern.

## Files affected (Phase 1)

**New — Cloud Functions (`functions/src/`):**
- `github/app.ts` — GitHub App JWT, installation + user-to-server token exchange/refresh.
- `github/octokit.ts` — authenticated REST client factory (rate-limit + backoff aware).
- `github/connection.ts` — `onCall` functions: `startGithubAuth`, `completeGithubAuth`, `disconnectGithub`.
- `github/webhook.ts` — `githubWebhook` HTTPS function (verify sig → dedupe → enqueue → 200).
- `github/sync.ts` — `processGithubSyncJob` worker (diff-based outbound writes) + Cloud Tasks enqueue helper.
- `github/links.ts` — `onCall` `linkTaskToGithub` / `unlinkTaskFromGithub` (create-new + link-existing).
- `github/types.ts` — typed GitHub payloads (sourced from `@octokit/openapi-types`; no `any`).
- `functions/src/index.ts` — export the new functions; add `defineSecret` entries.

**New — Angular (`src/app/`):**
- `core/services/github.service.ts` — calls the callable functions; exposes connection signal.
- `core/models/github.model.ts` — client-side types for links/connection state.
- `features/settings/github-connection.component.{ts,html}` — connect/disconnect UI + status.
- A "Link to GitHub" entry point on the task detail surface (minimal in Phase 1: create/link + status).

**Modified:**
- `firestore.rules` — rules for new collections (read own connection state; `private` token doc denied
  to all clients; link/field/event docs written only by Functions).
- `firestore.indexes.json` — indexes for `github_sync_events` (delivery_id) and task-link lookups.
- `functions/package.json` — add `@octokit/rest`, `@octokit/auth-app`, `@octokit/graphql`,
  `@octokit/webhooks-methods`, `@google-cloud/tasks`.

## Provisional Firestore data model (reconcile with §5)

Top-level collections (named to match the prompt's table list; final fields pending §5 paste):

- `github_connections/{uid}` — per-user: `githubLogin`, `installationId`, `accountType`
  (`'user' | 'org'`), `scopes`, `capabilities` (cached), `state`
  (`'connected' | 'needs_reauth' | 'error'`), timestamps. **Token material is NOT here** — it lives in
  `users/{uid}/private/githubOAuth` (admin-SDK only), mirroring `googleOAuth`.
- `tasks/{taskId}` links via `task_github_links/{taskId}` (doc id = taskId enforces the UNIQUE 1:1):
  `repoOwner`, `repoName`, `issueNumber`, `issueNodeId`, `htmlUrl`, `state`, `lastSyncedAt`,
  `syncState` (`'synced' | 'pending' | 'error' | 'conflict'`), `lastError`.
- `task_github_field_values/{...}` — flexible field storage (Phase 2; stubbed schema only now).
- `task_github_relationships/{...}` — Phase 2.
- `task_github_actors/{...}` — Phase 2.
- `github_sync_events/{deliveryId}` — audit + idempotency; **doc id = `X-GitHub-Delivery`** gives the
  UNIQUE-on-delivery_id guarantee for free. Fields: `event`, `action`, `receivedAt`, `processedAt`,
  `status`, `payloadDigest`.

## Implementation steps (Phase 1)

1. Add deps to `functions/package.json`; `npm ci` in `functions/`.
2. `docs/github-app-setup.md`: App creation, permissions (Issues RW, Contents RW for branches later,
   Metadata RO), webhook URL + secret, user-to-server callback. List required secrets.
3. `github/app.ts` + secrets (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`,
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) via `defineSecret`.
4. Connection callables + token storage in `users/{uid}/private/githubOAuth`.
5. Firestore rules + indexes for new collections; deny client access to token doc.
6. `linkTaskToGithub`: create issue (`POST /repos/{o}/{r}/issues`) with hidden marker
   `<!-- omnitask:task:{id} -->` + backlink; persist `task_github_links`; enqueue nothing (synchronous
   create is fine, but record an event). Support link-existing by URL/number.
7. Outbound status sync: `onDocumentWritten('tasks/{taskId}')` → if linked and `status` changed →
   enqueue diff job → worker PATCHes issue `state`. Suppress echo when the write originated from inbound.
8. `githubWebhook`: verify sig (`@octokit/webhooks-methods` `verify`), dedupe via
   `github_sync_events/{deliveryId}` create-if-absent, enqueue, return 200. Worker handles
   `issues.closed`/`issues.reopened` → task status with conflict rules.
9. Angular: `github.service.ts`, settings connection component, minimal task link control.
10. Tests (see below). Run the pre-done checklist.

## Test plan (Definition of Done, Phase 1)

- **Functions unit tests** (`functions/`, jest via `firebase-functions-test`):
  - signature verification: valid passes, tampered body / bad secret rejected (401).
  - idempotency: duplicate `X-GitHub-Delivery` is a no-op.
  - conflict resolution: out-of-order `updated_at` → last-writer-wins; true conflict → `syncState='conflict'`.
  - echo suppression: a webhook caused by our own write does not re-trigger an outbound write.
- **Angular** (`ng test --watch=false --browsers=ChromeHeadless`): github.service + connection component.
- **Regression:** an unlinked task create/update/complete produces **zero** GitHub calls and identical
  Firestore writes vs. baseline.
- **No tokens in client bundle:** grep built bundle for secret names; assert token doc is rules-denied.
- Pre-done checklist (CLAUDE.md): `ng build --configuration production`, `ng test`, `ng lint`;
  `cd functions && npm run build && npm run lint`.

## Rollback

- Feature is additive and gated on an existing `task_github_links` doc; no link ⇒ legacy code path
  untouched (regression test guards this).
- Revert = remove exported functions + UI entry point; new collections are inert if unread.
- Disable live traffic by removing the webhook in the GitHub App without code changes.

## Open questions to resolve before / during Phase 2 (from prompt)

- 1:1 task↔issue (assumed; enforced by doc-id uniqueness) or multiple links?
- Task delete = unlink (default assumed) or close issue?
- `in-progress` preservation on GitHub `reopened` (see status mapping) — confirm desired behavior.
- Labels: pass-through or first-class?
- Per-user identity confirmed; how to handle a task whose linker later disconnects (fallback to a
  shared service installation?).
