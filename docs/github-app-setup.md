# GitHub App Setup — OmniTask Issues Integration (Phase 1)

This guide creates the **OmniTask Sync** GitHub App and configures the secrets the
Cloud Functions need. Phase 1 covers connection, issue create/link, and open↔closed
status sync. Later phases add fields, sub-issues, dependencies, Projects v2, and
linked branches.

## 1. Create the GitHub App

GitHub → **Settings → Developer settings → GitHub Apps → New GitHub App**.

- **Name:** `OmniTask Sync` (the bot identity becomes `omnitask-sync[bot]`).
- **Homepage URL:** your OmniTask origin (e.g. `https://omnitask-475422.web.app`).
- **Callback URL (user authorization):** `https://<your-origin>/auth/github/callback`
  - Add `http://localhost:4200/auth/github/callback` too for local dev.
  - Enable **Request user authorization (OAuth) during installation**.
  - Enable **Expire user authorization tokens** (gives refresh tokens we rotate).
- **Webhook URL:** the deployed `githubWebhook` function URL, e.g.
  `https://us-central1-omnitask-475422.cloudfunctions.net/githubWebhook`.
- **Webhook secret:** generate a strong random string — this becomes `GITHUB_WEBHOOK_SECRET`.

### Permissions (Phase 1 — least privilege)

| Scope | Access | Why |
|-------|--------|-----|
| Repository → **Issues** | Read & write | Create/link issues, sync open/closed state |
| Repository → **Metadata** | Read-only | Mandatory; repo enumeration |

> **Deferred:** `Contents: Read & write` (needed only for `createLinkedBranch` in
> Phase 3) and `Pull requests: Read` (branch→PR mirror, Phase 3) are intentionally
> **not** requested yet, so the App holds no code-write scope until that feature ships.
> Issue Types / Issue Fields read access (org-level) is added in Phase 2 when those
> are consumed.

### Subscribe to webhook events (Phase 1)

- **Issues** (`opened`, `edited`, `closed`, `reopened`).

> Later phases add `sub_issues`, `issue_dependencies`, `create`/`delete`, `pull_request`,
> and issue-field events.

## 2. Generate credentials

After creating the App:

1. Note the **App ID** → `GITHUB_APP_ID`.
2. Note the **Client ID** → `GITHUB_CLIENT_ID`.
3. **Generate a client secret** → `GITHUB_CLIENT_SECRET`.
4. **Generate a private key** (downloads a `.pem`) → `GITHUB_APP_PRIVATE_KEY`.

## 3. Store secrets in Firebase

All tokens are server-side only; nothing reaches the browser. Set via the Firebase CLI:

```bash
firebase functions:secrets:set GITHUB_APP_ID
firebase functions:secrets:set GITHUB_CLIENT_ID
firebase functions:secrets:set GITHUB_CLIENT_SECRET
firebase functions:secrets:set GITHUB_WEBHOOK_SECRET

# Private key: paste the full PEM. Newlines are preserved; the function also
# tolerates a single-line PEM with literal "\n" escapes.
firebase functions:secrets:set GITHUB_APP_PRIVATE_KEY
```

Then deploy:

```bash
firebase deploy --only functions
```

## 4. Install the App

Install **OmniTask Sync** on the org or account whose repos you want to link, selecting
the specific repositories (least privilege). A user must complete the in-app
**Settings → GitHub Issues → Connect GitHub** flow afterward so OmniTask gets a
user-to-server token bound to their identity.

## 5. Verify the round-trip (Phase 1 demo)

1. **Connect:** Settings → GitHub Issues → Connect GitHub → authorize → returns to Settings
   showing "Connected as <login>".
2. **Create + link:** link a task with *Create new issue* → confirm the issue appears in the
   repo with the hidden `<!-- omnitask:task:{id} -->` marker and an OmniTask backlink.
3. **OmniTask → GitHub:** mark the task **Done** → the issue closes (via `syncTaskStatusToGithub`).
4. **GitHub → OmniTask:** reopen the issue on GitHub → the task returns to **To Do** (via the
   `githubWebhook` receiver). Closing it again sets the task back to **Done**.

## Token & data model notes

- **Per-user identity:** each user connects their own GitHub account; the user-to-server
  refresh token is stored at `users/{uid}/private/githubOAuth` (admin-SDK only, denied to
  all clients by Firestore rules). Connection status (no tokens) lives at
  `github_connections/{uid}`.
- **Idempotency:** inbound webhooks dedupe on `X-GitHub-Delivery` via
  `github_sync_events/{deliveryId}`. Signatures are verified with HMAC-SHA256 over the raw
  body before any processing.
- **Reverse uniqueness:** `github_issue_links/{owner}__{repo}__{number}` ensures one GitHub
  issue maps to at most one task, written in the same transaction as the task link.
