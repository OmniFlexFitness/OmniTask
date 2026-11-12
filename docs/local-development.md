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
3. On the first run only: fetches the Firebase CLI (through `npx`, unless
   `firebase` is installed globally) and downloads the Firestore, Storage and
   Emulator UI files. This is the slow part of a first run and can take
   several minutes; npm prints nothing while it fetches the CLI. Both are
   cached on the machine, so later starts skip this step.
4. Builds the Cloud Functions and keeps `tsc --watch` running.
5. Starts the Auth, Firestore, Functions and Storage emulators under the
   offline-only project `demo-omnitask`, and waits up to three minutes for
   them to answer.
6. Starts `ng serve --configuration local` once the emulators are ready.

Ctrl+C (or **Stop** in the Build Console) works at every step, including
during an install or a download; the next start runs the unfinished step
again.

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
account may do depends on its role, exactly as it does in production.

After sign-in the app opens **Dashboard** (your own tasks), which is empty
for every new account. The sample projects are created by the **Workspace**
page (next to Dashboard in the top bar), the first time it is opened by an
account that has no project yet:

- **An ordinary new account** (any made-up email) does not get them. The app
  writes the sample projects as one batch of projects and tasks, and the rules
  refuse that batch for anyone who is not an admin. On opening Workspace the
  browser console shows `Failed to seed data` with a permission error
  (`PERMISSION_DENIED ... for 'create'`, which is the emulator's wording of
  `Missing or insufficient permissions`). The account itself works: it can
  create a project by hand and add tasks to it.
- **To get the sample projects and the admin screens**, use one of:
  1. In the fake Google popup choose **Add new account** and type the
     super-admin address in `firestore.rules` (the one `isSuperAdminEmail()`
     compares against; `SUPER_ADMIN_EMAIL` in `src/app/core/constants.ts` is
     the same address). No password is needed, the emulator does not check
     who you are. That account is made an admin on sign-in; open
     **Workspace** and the three sample projects are created.
  2. Or sign in with any email, open the Emulator UI at
     <http://127.0.0.1:4000/firestore>, open `users` > your document, change
     `role` from `user` to `admin`, reload the app and open **Workspace**.

  Workspace only creates them for an account without any project. If you
  already added a task from Dashboard (that creates a `Personal` project),
  click **+ Sample Data** at the bottom of the Workspace sidebar instead.

Either way the account exists only in the emulator. No real Google account is
touched, and no mail is sent unless you turned on real email (see
[Email in the emulator](#email-in-the-emulator)).

### The built-in local profile

Every local start makes sure one account exists, so you do not have to type
an address into the fake popup or promote anyone to admin by hand:

- **Who:** `bertin.kenol@omniflexfitness.com`, shown in the popup's account
  list as **Bertin Kenol**. Pick it instead of **Add new account**.
- **What is created:** the account in the Auth emulator (verified, with a
  Google identity so the popup lists it) and its profile document
  `users/<uid>` in the Firestore emulator: name, email, domain, role `admin`,
  all permissions including super-admin, job title, time zone, email
  notifications on and the default dashboard settings. The avatar is the
  OmniFlex logo (`assets/images/logo.png`, the one the navbar uses) instead of
  a letter placeholder. Opening **Workspace** creates the sample projects.
- **Where the data lives:** `scripts/local-user.json`, committed, plain data.
  `scripts/local-user.mjs` applies it to the running emulators over loopback
  HTTP once `Emulators are up.` is printed, and the script then prints
  `Local profile ready: Bertin Kenol (...)`. It is fixture data for the
  Emulator Suite only: nothing in it is read by, or sent to, the production
  project.
- **Existing data is respected.** If `.emulator-data/` already holds an
  account with that address (with a random uid, from before this existed), its
  uid is kept and only the name, photo and verified flag are brought in line.
  The profile is updated field by field. Name, photo, role and permissions
  always follow the fixture; job title, time zone, notification setting and
  dashboard settings are only a starting value, so changes you make in the app
  survive a restart, as do `lastLoginAt`, pinned projects, sheet ids, tokens and
  everything else; `createdAt` is only set when missing.
- **Add new account with the same address** makes the emulator replace the
  name and photo until the next start. Pick the listed account instead. A start that finds
  everything in place writes nothing. If the emulators cannot be reached, or
  answer an error, a warning is printed and the stack carries on.
- **To change it:** edit `scripts/local-user.json` and restart. To change a
  field that is not in the file, change it in the Emulator UI.
- **To turn it off:** set `OMNITASK_NO_LOCAL_USER=1` for the start (for
  example `OMNITASK_NO_LOCAL_USER=1 yarn dev:local`), or delete
  `scripts/local-user.json`; nothing is seeded then, and nothing already in
  `.emulator-data/` is removed.

Tests: `node --test scripts/local-user.test.mjs`.

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

On Windows the stack is also ended the moment the Build Console's own process
is ended (Task Manager, a crash, its terminal window closed): Windows ends
the stack together with it, so the stack gets no chance to stop its
emulators. Only on macOS and Linux does the stack notice that the console is
gone and shut down by itself. After such a hard stop the emulators can stay
behind and keep their ports; the console then shows **Running outside the
console** and refuses Start. End them by hand: `netstat -ano | findstr :4400`
prints the process ID in the last column, then
`taskkill /PID <that number> /T /F`.

### Ports Windows has reserved

Windows sets aside blocks of TCP ports for Hyper-V, WSL 2 and Docker Desktop,
and chooses the blocks again at every boot. A port inside a block cannot be
opened although nothing is using it. Started by hand, the Firebase CLI then
stops with `Port 9099 is not open on 127.0.0.1, could not start Authentication
Emulator` (Node calls it `listen EACCES`), and which port is hit changes from
one boot to the next.

**What happens automatically.** `yarn dev:local`, `yarn emulators` and the
Build Console test the stack's ports before they start anything: the app
(4200), the emulators (9099, 8080, 5001, 9199), the Emulator UI (4000) and the
Emulator Hub (4400). A port that cannot be opened and that nothing answers on
is replaced by the next usable one, for this run only, and the start says so:

```text
[dev:local] Port 9099 (sign-in) is reserved by Windows; using 9100 instead.
```

The emulators and the app both follow, so there is nothing to edit:
`firebase.json` and `src/environments/environment.local.ts` stay as they are,
and the next start uses the usual port again if Windows has released it. Your
local data is kept. One exception: an image uploaded while the file-storage
port was moved is saved with that port in its address, so it shows as broken in
a later run that uses a different storage port; upload it again. If the app's own port moves (4200 to 4201, say),
the browser treats that as another site, so you sign in once more.

A port that another program is really using is never replaced. The start
stops with `Port 8080 (database) is in use` and starts nothing, so that a
second stack cannot come up next to one that is still running.

**Seeing which ports are in use.** The addresses printed under
`OmniTask local stack is up.` and `Emulators are up.` are the real ones, and a
line below them lists the replacements. While the stack runs, all seven ports
are in `.local-dev-ports.json` in the repository root (the Build Console
reads its port tiles and links from that file):

```json
{"app":4200,"auth":9100,"firestore":8080,"functions":5001,"storage":9199,"ui":4000,"hub":4400,"remapped":["auth"]}
```

**Running the app in a second terminal.** After `yarn emulators` replaced an
emulator port, plain `yarn start:local` would still look for the usual one.
The `Emulators are up.` message then prints the command to use instead, for
example `yarn ng serve --configuration local-remapped`. That configuration
reads a file the emulator start generates, so it works only while those
emulators are running.

**Optional: keep a port for good.** Nothing here is needed for the stack to
work. If you would rather have the usual port back permanently, an
administrator can take it out of the pool Windows reserves from. In a terminal
opened with **Run as administrator**:

```bat
netsh interface ipv4 show excludedportrange protocol=tcp

net stop winnat
netsh interface ipv4 add excludedportrange protocol=tcp startport=9099 numberofports=1
net start winnat
```

The first command lists the blocks that are reserved right now. The `add`
line is the documented way to exclude a port range, and it is permanent
unless you add `store=active` (see Microsoft's
[`netsh interface` reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/netsh-interface));
an exclusion you add yourself keeps the port out of the blocks Windows hands
to Hyper-V, while a program that asks for exactly that port still gets it.
Microsoft's
[Hyper-V troubleshooting guide](https://learn.microsoft.com/en-us/troubleshoot/windows-server/virtualization/hyper-v-installation-configuration-operational-failure)
describes the same conflict and the same remedy: reserve the ports an
application needs yourself.
Stopping `winnat` around it is common practice rather than something
Microsoft documents: it releases the current blocks, because the `add` is
refused while the port sits inside one, and it interrupts WSL and Docker
networking for a moment. Repeat the `add` line for every port you want to
keep, and undo one with `delete excludedportrange` and the same numbers.

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

- **Local only, and for a computer only you use.** The server listens on
  `127.0.0.1` and nothing else. The `Host` and `Origin` headers of every
  request are checked and the buttons send a token that is generated fresh on
  each run, which keeps other websites out. It does not keep out other
  programs or other user accounts on the same computer: anything that can
  reach `127.0.0.1` can load the page, read the token from it and press the
  same buttons. Do not run the console on a shared machine.
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
| Auth / Firestore / Functions / Storage | Firebase | Emulator Suite, ports in `firebase.json` → `emulators` (a port Windows has reserved is replaced for that run, see [Ports Windows has reserved](#ports-windows-has-reserved)) |
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
| The first start sits at `Fetching the Firebase CLI...` or `Downloading the Firebase emulators...` for minutes | Expected on the first run only: the CLI is several hundred npm packages and npm prints nothing while it fetches them, and the emulators are about 200 MB. Let it finish; later starts skip both. They are kept outside the repository: the CLI in npm's cache (`%LOCALAPPDATA%\npm-cache\_npx` on Windows, `~/.npm/_npx` elsewhere), the emulators in `.cache/firebase/emulators` in your home folder |
| `Emulators did not become ready in time` on the very first start, with no emulator output before it | An older checkout fetched the Firebase CLI inside the three-minute wait for the emulators, and the stop then discarded the unfinished fetch, so every start failed the same way. Update your checkout: the fetch is now its own step without a time limit |
| `The Firebase CLI could not be fetched` | Check the internet connection (and the proxy settings, if you use one), then start again. The launcher already removes an unfinished fetch and retries once; if it still fails, delete the folder the message names and start again |
| `spawn .../functions/node_modules/.bin/firebase-functions EACCES` | `cd functions && npm ci` (the launcher does this when it detects the problem) |
| `Port 8080 (database) is in use` (or `4200`, `5001`, `9099`, `9199`, `4000`, `4400`) and nothing starts | Another program, or an earlier run of the stack, is listening on that port. Stop it and start again. To find it on Windows: `netstat -ano \| findstr :8080`, then `taskkill /PID <number in the last column> /T /F`; on macOS/Linux: `lsof -i :8080`. Only if the other program has to keep the port, change the number in both `firebase.json` and `src/environments/environment.local.ts` |
| `Port 9099 is not open on 127.0.0.1, could not start Authentication Emulator`, or `listen EACCES`, although nothing uses the port (Windows) | Windows has reserved the port for Hyper-V, WSL or Docker for this boot. `yarn dev:local`, `yarn emulators` and the Build Console move to the next usable port by themselves and print `Port 9099 (sign-in) is reserved by Windows; using 9100 instead.`; update your checkout if you do not see that line. You only meet the raw error when you run `firebase emulators:start` by hand. See [Ports Windows has reserved](#ports-windows-has-reserved) |
| AI button says "not configured" | Add `ANTHROPIC_API_KEY` to `functions/.secret.local`, restart `yarn dev:local` |
| AI button says the model is not available | Your key cannot use `claude-opus-5-5`; locally set `ANTHROPIC_MODEL` in `functions/.env.local`, in production change `DEFAULT_CLAUDE_MODEL` |
| AI button says the input is too long | Titles are capped at 300 characters and descriptions at 8,000 for AI calls; shorten the text |
| Emulators start but the app shows production data | You ran `yarn start` instead of `yarn start:local` / `yarn dev:local` |
| `Error adding firestore function: ... Unable to parse JSON ... upstream` | The Firebase CLI sends even its loopback calls through `HTTP(S)_PROXY` and ignores `NO_PROXY`. `yarn dev:local` / `yarn emulators` handle this: they download the emulator binaries through the proxy, then start the emulators with the proxy variables removed. If you run `firebase emulators:start` by hand behind a proxy, unset `HTTP_PROXY`/`HTTPS_PROXY` for that command |
| `Unable to access secret environment variables from Google Cloud Secret Manager` | A value in `functions/.secret.local` is blank. Use `placeholder` for anything you do not have |
| Weird template or schema errors after a big refactor | `rm -rf .angular/cache` |
| Blank page at `localhost:4200`; DevTools shows `GET /@vite/client` answering 500 (`Failed to update Vite client error overlay text`) | `node_modules` still has Vite 6, which the Angular dev server cannot patch. Run `yarn install` after pulling (the lockfile now resolves Vite 7), then restart |
| No sample projects after signing in | They are created by the **Workspace** page, not by the Dashboard page you land on, and only for an admin account. Open Workspace; if the account already has a project, use **+ Sample Data** at the bottom of its sidebar. `PERMISSION_DENIED` or `Missing or insufficient permissions` in the browser console on that page is expected for an ordinary account. See [Which account to sign in with](#which-account-to-sign-in-with) |
| Local data is gone after a restart on Windows | Fixed in the launcher: it used to end the emulators on Windows before they could export. Update your checkout, then stop with the console's **Stop** button or Ctrl+C in the terminal and wait for `Shutting down...` to finish; both save `.emulator-data/` first. Closing the terminal window or ending the processes in Task Manager still skips the export |
| The console shortcut seems to do nothing | Run `yarn console` in a terminal to see its message. If another program uses port 4310, or Windows has reserved it for this session (`listen EACCES`), set `OMNITASK_CONSOLE_PORT` to a free port |
| The console shortcut says its target `node.cmd` was changed or moved | The shortcut was made by an older `yarn console:shortcut`, which stored the path of a temporary wrapper that yarn creates instead of `node.exe`. Update your checkout and run `yarn console:shortcut` again; it overwrites both shortcuts |
| The console shows **Running outside the console** and refuses Start, but no terminal is running the stack | Emulators were left behind by a hard stop (see [Stopping, and where the data goes](#stopping-and-where-the-data-goes)). On Windows: `netstat -ano \| findstr :4400`, then `taskkill /PID <number in the last column> /T /F`. On macOS/Linux: `lsof -ti :4400 \| xargs kill -INT` |
