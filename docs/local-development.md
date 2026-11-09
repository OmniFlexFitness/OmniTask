# Local development

Run the whole OmniTask stack on a laptop: the Angular app, Firebase Auth,
Firestore, Storage and the Cloud Functions, including the Claude-powered AI
features. Nothing touches the production Firebase project.

You still need an internet connection for two things: downloading packages
and emulator binaries the first time, and the Claude API itself.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 20 or newer (22 recommended) | Angular CLI, Cloud Functions runtime |
| Yarn 1 | `npm i -g yarn` if missing | Web app package manager (`yarn.lock` is committed) |
| Java JDK | 21 or newer ([Temurin](https://adoptium.net/temurin/releases/)) | The Firestore and Storage emulators are Java programs |
| Anthropic API key | any | AI buttons (subtasks, priority, due date, description). Create one at [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) |

You do **not** need the Firebase CLI installed globally, Google Cloud
credentials, or access to the `omnitask-475422` project.

## First run

```bash
git clone https://github.com/OmniFlexFitness/OmniTask.git
cd OmniTask
yarn install
yarn dev:local
```

`yarn dev:local` runs `scripts/local-dev.mjs`, which:

1. Checks Node and Java, installs `functions/` dependencies if needed.
2. Creates `functions/.secret.local` from `.secret.local.example` if it is
   missing, and warns when `ANTHROPIC_API_KEY` is blank.
3. Builds the Cloud Functions and keeps `tsc --watch` running.
4. Starts the Auth, Firestore, Functions and Storage emulators under the
   offline-only project `demo-omnitask`. The first run downloads the emulator
   JARs (a minute or two).
5. Starts `ng serve --configuration local` once the emulators are ready.

Then add your key, replacing the `placeholder` value:

```
# functions/.secret.local  (gitignored)
ANTHROPIC_API_KEY=sk-ant-...
```

Leave the other entries as `placeholder` unless you need those integrations;
a blank value makes the emulator look in Google Cloud Secret Manager and log
a red error.

Restart `yarn dev:local` after editing `.secret.local`; the emulator reads
secrets at startup.

Open:

- **App:** <http://localhost:4200>
- **Emulator UI:** <http://127.0.0.1:4000> (browse Firestore data, Auth users,
  function logs)

Sign in with any email and password, or use the fake Google sign-in popup the
Auth emulator provides. Accounts exist only in the emulator. The dashboard
seeds sample projects for a new user on first load.

Ctrl+C stops everything. Firestore and Auth data is exported to
`.emulator-data/` (gitignored) and imported again on the next start, so your
local data survives restarts. Delete that folder to start fresh.

## How the pieces fit

| Concern | Production | Local (`yarn dev:local`) |
|---|---|---|
| Firebase config | `src/environments/environment.ts` | `src/environments/environment.local.ts` (swapped in by the `local` build configuration in `angular.json`) |
| Project ID | `omnitask-475422` | `demo-omnitask`. Firebase treats `demo-*` projects as offline-only, so anything not emulated fails instead of reaching production |
| Auth / Firestore / Functions / Storage | Firebase | Emulator Suite, ports in `firebase.json` → `emulators` |
| AI features | Claude via `ANTHROPIC_API_KEY` in Secret Manager | Claude via `ANTHROPIC_API_KEY` in `functions/.secret.local` |
| Outbound email | Gmail SMTP | Dev mail sink: logged to the emulator console, never sent |
| Firebase Extensions | Deployed | Not available |

### AI features

The four AI callables (`generateSubtasks`, `suggestTaskPriority`,
`suggestDueDate`, `enhanceTaskDescription`) live in `functions/src/index.ts`
and call Claude through `functions/src/ai/claude.ts`. The same code runs
locally and in production.

- **Model:** `claude-opus-5-5` by default. Override with `ANTHROPIC_MODEL` in
  `functions/.env.local` (local) or `functions/.env` (production).
- **Structured outputs** guarantee the JSON shape, so there is no response
  parsing to go wrong.
- **No key:** the buttons return "AI features are not configured" instead of
  crashing. The emulator logs the exact fix.

### Email in the emulator

`sendTaskAssignmentEmail` fires on every task write and normally emails
assignees plus the admin inbox. In the emulator those messages are rendered
but not sent; look for `[mail-sink]` lines in the emulator output. To send
real mail from the emulator, set `EMULATOR_SEND_REAL_EMAIL=true` in
`functions/.env.local` and `NODEMAILER_SMTP_PASSWORD` in `.secret.local`.

## Running pieces separately

```bash
yarn emulators     # emulators only (same flags as dev:local, no import)
yarn start:local   # ng serve against already-running emulators
yarn start         # ng serve against PRODUCTION Firebase (the old default)
cd functions && npm run build:watch
```

## Not available locally

These need cloud credentials or infrastructure and are intentionally outside
the local stack. The UI still shows them; they fail with a clear error.

- **Firebase Extensions**: send-email, delete-user-data, resize-images,
  speech-to-text, multimodal-genai, vector-search.
- **Google OAuth integrations**: Google Tasks sync, Contacts/Directory,
  Sheets, Calendar. The Auth emulator issues fake Google tokens that Google's
  APIs reject. Add real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to
  `.secret.local` only if you need to debug these flows.
- **GitHub Issues integration**: needs the GitHub App secrets.
- **Scheduled functions** (`scheduledGoogleTasksSync`,
  `checkScheduledReminders`): the emulator does not fire schedules. Trigger
  them from the Emulator UI if needed.
- **Mobile (Flutter) app**: not yet wired to the emulators.

## Production secret

Production reads `ANTHROPIC_API_KEY` from Google Cloud Secret Manager. The
deploy workflow seeds it from the GitHub repository secret of the same name on
first deploy. To set or rotate it by hand:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY --project omnitask-475422
firebase deploy --only functions --project omnitask-475422
```

Use a separate key for production (for example an `omnitask-prod` key on the
`omnitask` service account) so the laptop key can be revoked independently.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Java ... was not found on PATH` | Install JDK 21+, reopen the terminal |
| `spawn .../functions/node_modules/.bin/firebase-functions EACCES` | `cd functions && npm ci` (the launcher does this when it detects the problem) |
| Port already in use (`4200`, `5001`, `8080`, `9099`, `9199`, `4000`) | Stop the other process, or change the port in both `firebase.json` and `src/environments/environment.local.ts` |
| AI button says "not configured" | Add `ANTHROPIC_API_KEY` to `functions/.secret.local`, restart `yarn dev:local` |
| AI button says the model is not available | Your key cannot use `claude-opus-5-5`; set `ANTHROPIC_MODEL` in `functions/.env.local` |
| Emulators start but the app shows production data | You ran `yarn start` instead of `yarn start:local` / `yarn dev:local` |
| `Error adding firestore function: ... Unable to parse JSON ... upstream` | An HTTP proxy is intercepting loopback traffic. `yarn dev:local` sets `NO_PROXY=127.0.0.1,localhost` for you; set it yourself when running `yarn emulators` directly |
| `Unable to access secret environment variables from Google Cloud Secret Manager` | A value in `functions/.secret.local` is blank. Use `placeholder` for anything you do not have |
| Weird template or schema errors after a big refactor | `rm -rf .angular/cache` |
