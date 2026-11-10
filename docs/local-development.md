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

Click **Continue with Google**. Because the app is connected to the Auth
emulator, the popup is the emulator's fake Google sign-in: enter any email or
auto-generate a user; no real Google account or password is involved.
Accounts exist only in the emulator.

### Which account to sign in with

The local stack loads the same `firestore.rules` as production, so what an
account may do depends on its role, exactly as it does in production:

- **An ordinary new account** (any made-up email) starts with an empty
  dashboard. The sample projects are *not* created for it: the app writes them
  as one batch of projects and tasks, and the rules refuse that batch for
  anyone who is not an admin. The browser console shows `Failed to seed data`
  with a permission error (`PERMISSION_DENIED ... for 'create'`, which is the
  emulator's wording of `Missing or insufficient permissions`). The account
  itself works: it can create a project by hand and add tasks to it.
- **To get the sample projects and the admin screens**, use one of:
  1. In the fake Google popup choose **Add new account** and type the
     super-admin address in `firestore.rules` (the one `isSuperAdminEmail()`
     compares against; `SUPER_ADMIN_EMAIL` in `src/app/core/constants.ts` is
     the same address). No password is needed, the emulator does not check
     who you are. That account is made an admin on sign-in and gets the three
     sample projects on the first dashboard load.
  2. Or sign in with any email, open the Emulator UI at
     <http://127.0.0.1:4000/firestore>, open `users` > your document, change
     `role` from `user` to `admin`, and reload the app. The sample projects
     are created on the next dashboard load.

Either way the account exists only in the emulator. No real Google account is
touched, and no mail is sent unless you turned on real email (see
[Email in the emulator](#email-in-the-emulator)).

### Stopping, and where the data goes

Ctrl+C stops everything. Firestore and Auth data is exported to
`.emulator-data/` (gitignored) and imported again on the next start, so your
local data survives restarts. Delete that folder to start fresh.

The same export happens when the stack is stopped from the Build Console
(below). Windows cannot signal another program to shut down cleanly, so there
a stop from the console first asks the Emulator Hub to save the data and only
then ends the emulator processes, and a Ctrl+C waits for the emulators' own
export before cleaning up. Either way, stop with Ctrl+C or the console's
**Stop** button and let `Shutting down...` finish. Closing the terminal
window, or ending the processes in Task Manager, skips the export and loses
what changed since the last clean stop.

## Build Console

A small local control panel for this stack: the same page as the published
OmniTask Build Console, served from your checkout at <http://127.0.0.1:4310>
by `scripts/launch-console.mjs`. Its buttons act on this machine: **Start**
and **Stop** the stack (full, or emulators only), **Check** (the functions
build and tests, lint, the production build and the unit tests), pull, install
dependencies, run the Claude smoke test, open the key and settings files, and
a live log of everything those print.

```bash
yarn console            # start it and open its window
```

It opens in its own window without tabs or an address bar, using Chrome or
Edge; where neither is found it opens a normal browser tab. Starting it again
while it is running brings up the running console instead of a second one.

On Windows, install a Desktop shortcut and a Start menu entry once:

```bash
yarn console:shortcut            # creates "OmniTask Build Console"
yarn console:shortcut -Remove    # deletes both shortcuts
```

No administrator rights are needed. The shortcut runs
`node scripts\launch-console.mjs --detach --browser app` with the repository
as its working directory, so it keeps working after `git pull`; run
`yarn console:shortcut` again if you move the repository or reinstall Node.

What to know about it:

- **Local only.** The server listens on `127.0.0.1` and nothing else. Every
  request must come from the console's own page: the `Host` and `Origin`
  headers are checked, and the buttons send a token that is generated fresh on
  each run.
- **A fixed list of actions.** The page can only ask for the actions built
  into the launcher (start, stop, pull, install, smoke test, checks, open a
  file or folder, change the two local settings, reset local data). Nothing
  typed into the page ends up on a command line, and the Anthropic key is
  never sent to the page or written to the log.
- **It exits by itself.** When its window has been closed for two minutes and
  nothing is running, the launcher exits. It never stops a running stack on
  its own: use **Stop** first (that also saves your local data), then close
  the window.
- **Options.** `--port N` or `OMNITASK_CONSOLE_PORT` to use another port,
  `--browser app|default|none`, `--no-idle-exit` to keep it running. When
  started from the shortcut its own diagnostics go to `omnitask-console.log`
  in the temp folder (`%TEMP%` on Windows).

The launcher has its own tests: `node --test scripts/*.test.mjs`.

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

- **Model:** `claude-opus-5-5` (`DEFAULT_CLAUDE_MODEL` in
  `functions/src/ai/claude.ts`). Locally you can override it with
  `ANTHROPIC_MODEL` in `functions/.env.local`. That override does not reach
  production: `.env` files are gitignored and the deploy runs from a clean
  checkout, so to change the production model, edit the constant and deploy.
- **Limits:** titles up to 300 characters, descriptions and project context up
  to 8,000; longer input is rejected with a clear message before any Claude
  call. Output is capped per task (4k tokens for suggestions, 8k for
  description rewrites).
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
yarn console       # the Build Console: start, stop and check from a window
yarn emulators     # emulators only; imports/exports .emulator-data like dev:local
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
  `checkScheduledReminders`): not loaded, because the Pub/Sub emulator is not
  started (the log says `function ignored because the pubsub emulator does not
  exist`). To exercise one, add `pubsub` to `EMULATORS` in
  `scripts/local-dev.mjs` and publish an empty message to the topic
  `firebase-schedule-<functionName>` on the Pub/Sub emulator, or call it from
  `firebase functions:shell`.
- **Mobile (Flutter) app**: not yet wired to the emulators.

## Production secret

Production reads `ANTHROPIC_API_KEY` from Google Cloud Secret Manager. The
deploy workflow creates it from the GitHub repository secret of the same name
when it does not exist yet, and upgrades a deploy-time `placeholder` value
when the GitHub secret is added later. A real value already in Secret Manager
is never overwritten by the deploy; to set or rotate it by hand:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY --project omnitask-475422
firebase deploy --only functions --project omnitask-475422
```

Use separate keys so each can be revoked independently: one for your laptop
(`.secret.local`), one for production (for example `omnitask-prod` on the
`omnitask` service account, in Secret Manager / the `ANTHROPIC_API_KEY` GitHub
secret), and a low-limit one for CI (`ANTHROPIC_API_KEY_CI` GitHub secret,
used by the PR smoke test; it falls back to `ANTHROPIC_API_KEY` when unset).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Java ... was not found on PATH` | Install JDK 21+, reopen the terminal |
| `spawn .../functions/node_modules/.bin/firebase-functions EACCES` | `cd functions && npm ci` (the launcher does this when it detects the problem) |
| Port already in use (`4200`, `5001`, `8080`, `9099`, `9199`, `4000`) | Stop the other process, or change the port in both `firebase.json` and `src/environments/environment.local.ts` |
| AI button says "not configured" | Add `ANTHROPIC_API_KEY` to `functions/.secret.local`, restart `yarn dev:local` |
| AI button says the model is not available | Your key cannot use `claude-opus-5-5`; locally set `ANTHROPIC_MODEL` in `functions/.env.local`, in production change `DEFAULT_CLAUDE_MODEL` |
| AI button says the input is too long | Titles are capped at 300 characters and descriptions at 8,000 for AI calls; shorten the text |
| Emulators start but the app shows production data | You ran `yarn start` instead of `yarn start:local` / `yarn dev:local` |
| `Error adding firestore function: ... Unable to parse JSON ... upstream` | The Firebase CLI sends even its loopback calls through `HTTP(S)_PROXY` and ignores `NO_PROXY`. `yarn dev:local` / `yarn emulators` handle this: they download the emulator binaries through the proxy, then start the emulators with the proxy variables removed. If you run `firebase emulators:start` by hand behind a proxy, unset `HTTP_PROXY`/`HTTPS_PROXY` for that command |
| `Unable to access secret environment variables from Google Cloud Secret Manager` | A value in `functions/.secret.local` is blank. Use `placeholder` for anything you do not have |
| Weird template or schema errors after a big refactor | `rm -rf .angular/cache` |
| Blank page at `localhost:4200`; DevTools shows `GET /@vite/client` answering 500 (`Failed to update Vite client error overlay text`) | `node_modules` still has Vite 6, which the Angular dev server cannot patch. Run `yarn install` after pulling (the lockfile now resolves Vite 7), then restart |
| Empty dashboard for a new account; `PERMISSION_DENIED` or `Missing or insufficient permissions` in the browser console | Expected for an ordinary account: the sample projects are only created for an admin. See [Which account to sign in with](#which-account-to-sign-in-with) |
| Local data is gone after a restart on Windows | Fixed in the launcher: it used to end the emulators on Windows before they could export. Update your checkout, then stop with the console's **Stop** button or Ctrl+C in the terminal and wait for `Shutting down...` to finish; both save `.emulator-data/` first. Closing the terminal window or ending the processes in Task Manager still skips the export |
| The console shortcut seems to do nothing | Run `yarn console` in a terminal to see its message. If another program uses port 4310, set `OMNITASK_CONSOLE_PORT` to a free port |
