#!/usr/bin/env node
/**
 * OmniTask one-command local stack.
 *
 *   yarn dev:local                      # emulators + functions + ng serve
 *   yarn emulators                      # = node scripts/local-dev.mjs --emulators-only
 *
 * Starts, in order:
 *   1. Preflight: Node/Java checks, dependency install, functions/.secret.local
 *   2. First run only: fetch the Firebase CLI and the emulator downloads, so
 *      that the wait in step 4 only ever measures the emulators starting
 *   3. Cloud Functions build + `tsc --watch`
 *   4. Firebase emulators (Auth, Firestore, Functions, Storage) under the
 *      offline-only project `demo-omnitask`, importing and persisting data in
 *      .emulator-data/
 *   5. `ng serve --configuration local` (points the app at the emulators)
 *
 * Ctrl+C stops everything, at any step; the emulators export their data on exit.
 * The Build Console (scripts/launch-console.mjs) starts this script with an
 * IPC channel and stops it with a { type: 'shutdown' } message instead.
 * Plain Node, no extra dependencies, works on Windows/macOS/Linux.
 * Full guide: docs/local-development.md
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  accessSync,
  constants,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { connect as netConnect } from 'node:net';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(ROOT, 'functions');
const IS_WINDOWS = process.platform === 'win32';
const EMULATORS_ONLY = process.argv.includes('--emulators-only');

// Windows looks for a bare command name (java, yarn, npm, npx, firebase) in
// the working directory, which is the repository, before PATH, so a file of
// that name in the checkout would run instead of the installed tool. This
// variable switches that lookup off in cmd.exe, which runs every such command
// here (see spawnArgs), and in Node's own spawn from Node 22 on. The children
// inherit it.
if (IS_WINDOWS) process.env.NoDefaultCurrentDirectoryInExePath = '1';

/** Must match src/environments/environment.local.ts (demo- prefix = offline only). */
const LOCAL_PROJECT_ID = 'demo-omnitask';
/** Emulators to run. Extensions are intentionally excluded (production-only). */
const EMULATORS = 'auth,firestore,functions,storage';
/** What the CLI has to download before those can start (Auth and Functions ship inside it). */
const EMULATOR_DOWNLOADS = ['firestore', 'storage', 'ui'];
/** Firebase CLI version used when no global `firebase` binary is installed. */
const FIREBASE_TOOLS_SPEC = 'firebase-tools@15';
/** Emulator hub (fixed port from firebase.json defaults) used to detect readiness. */
const EMULATOR_HUB_HOST = '127.0.0.1';
const EMULATOR_HUB_PORT = 4400;
const EMULATOR_HUB_URL = `http://${EMULATOR_HUB_HOST}:${EMULATOR_HUB_PORT}/emulators`;
/** Hub endpoint that writes an export while the emulators keep running. */
const EMULATOR_HUB_EXPORT_PATH = '/_admin/export';
const EXPORT_DIR = '.emulator-data';

/** How long the hub gets to write an export before a Windows stop gives up on it. */
const HUB_EXPORT_TIMEOUT_MS = 30_000;
/** How long one check of the hub port waits for the connection to be accepted or refused. */
const HUB_REFUSAL_TIMEOUT_MS = 5_000;
/** How long the children get to exit by themselves after a Ctrl+C in a Windows console. */
const CONSOLE_INTERRUPT_GRACE_MS = 30_000;
/**
 * Last resort: exit even if a child never reports its exit. Counted from the
 * moment the children were told to stop, and long enough for the emulators to
 * finish an export of a large local database (it used to be 15 s, which a
 * slow export could overrun).
 */
const EXIT_DEADLINE_MS = 45_000;
/**
 * POSIX: how long a preparation step gets to exit after SIGINT before it is
 * killed. npm needs several seconds to undo a half-done install, and killing
 * it during that would leave the half-done install behind.
 */
const STEP_KILL_AFTER_MS = 20_000;

/** JS entry points run directly with the current Node binary (no npm/yarn wrapper). */
const TSC_BIN = join(FUNCTIONS_DIR, 'node_modules', 'typescript', 'bin', 'tsc');
const NG_BIN = join(ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

const children = new Set();
/** The children started by runStep(): installs and downloads, which hold nothing worth saving. */
const stepChildren = new WeakSet();
let shuttingDown = false;
/** True once `emulators:start` was spawned, i.e. there may be data worth exporting. */
let emulatorsStarted = false;

const log = (msg) => console.log(`\x1b[36m[dev:local]\x1b[0m ${msg}`);
const warn = (msg) => console.warn(`\x1b[33m[dev:local]\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\x1b[31m[dev:local]\x1b[0m ${msg}`);
  shutdown(1);
};

/**
 * Build spawn arguments. Node 24 deprecates passing an args array together
 * with `shell: true` (DEP0190), so on Windows, where .cmd shims (yarn, npm,
 * npx, firebase) need a shell, the command is a single pre-built string. All
 * arguments of those commands are fixed literals without spaces, so plain
 * joining is safe.
 *
 * The Node binary itself is a real executable and is always started without a
 * shell: its path (C:\Program Files\nodejs\node.exe) and the script paths
 * under the repo may contain spaces, which a joined command line would split.
 */
function spawnArgs(cmd, args) {
  if (!IS_WINDOWS || cmd === process.execPath) return [cmd, args, { shell: false }];
  return [[cmd, ...args].join(' '), [], { shell: true }];
}

/** Rejection of a preparation step that ended because the stack is being stopped. */
class Stopped extends Error {}

/**
 * Run a preparation step (an install, a download, the first build) to
 * completion, with its output visible and no time limit. Rejects on a
 * non-zero exit.
 *
 * The child is tracked like the long-running ones instead of being run with
 * spawnSync, which would block this process until the step ends: a Ctrl+C or
 * the Build Console's stop message is then handled while a long install is
 * still running, and shutdown() stops the step like any other child.
 */
function runStep(cmd, args, opts = {}) {
  if (shuttingDown) return Promise.reject(new Stopped());
  const [file, argv, shellOpt] = spawnArgs(cmd, args);
  return new Promise((done, failed) => {
    const child = spawn(file, argv, {
      stdio: ['ignore', 'inherit', 'inherit'],
      detached: !IS_WINDOWS,
      ...shellOpt,
      ...opts,
    });
    children.add(child);
    stepChildren.add(child);
    child.once('error', (err) => {
      children.delete(child);
      failed(err);
    });
    child.once('exit', (code, signal) => {
      children.delete(child);
      const settle = () => {
        if (shuttingDown) failed(new Stopped());
        else if (code === 0) done();
        else failed(new Error(`${cmd} ${args.join(' ')} exited with ${signal ?? `code ${code}`}`));
      };
      // As in start(): after a Ctrl+C in a Windows console the step ends
      // before our own SIGINT handler has run. Do not report that as a failure.
      if (IS_WINDOWS && code !== 0) setTimeout(settle, 250);
      else settle();
    });
  });
}

/**
 * Start a long-running child and track it for shutdown.
 *
 * On POSIX each child gets its own process group (`detached`), so shutdown()
 * can signal the whole tree with kill(-pid): `npx firebase-tools` is a
 * wrapper around the real CLI, and signaling only the wrapper would orphan
 * the emulators without an export. On Windows there is no signal that reaches
 * another process tree, so shutdown() saves the data first and then ends the
 * tree with `taskkill /T /F` (see shutdown()).
 */
function start(name, cmd, args, opts = {}) {
  const [file, argv, shellOpt] = spawnArgs(cmd, args);
  const child = spawn(file, argv, {
    stdio: 'inherit',
    detached: !IS_WINDOWS,
    ...shellOpt,
    ...opts,
  });
  children.add(child);
  child.on('exit', (code, signal) => {
    children.delete(child);
    const report = () => {
      if (!shuttingDown) {
        fail(`${name} exited unexpectedly (${signal ?? `code ${code}`}). Stopping the stack.`);
      }
    };
    // A Ctrl+C in a Windows console ends the children directly. Let our own
    // SIGINT handler run first, so that a normal stop is not reported as a
    // crash (and does not take the "save, then taskkill" path meant for one).
    if (IS_WINDOWS) setTimeout(report, 250);
    else report();
  });
  return child;
}

const hasExited = (child) => child.exitCode !== null || child.signalCode !== null;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/** POSIX: deliver a signal to a child's whole process group. */
function signalTree(child, signal) {
  if (hasExited(child)) return;
  try {
    process.kill(-child.pid, signal); // whole process group
  } catch {
    child.kill(signal);
  }
}

/**
 * POSIX: SIGINT to a child's whole process group so it can clean up. A
 * preparation step has no data to save, so one that does not react to the
 * signal is killed in the end rather than left behind when this script exits.
 */
function interruptTree(child) {
  signalTree(child, 'SIGINT');
  if (stepChildren.has(child)) {
    setTimeout(() => signalTree(child, 'SIGKILL'), STEP_KILL_AFTER_MS).unref();
  }
}

/**
 * Full path of taskkill.exe. It is started without a shell, and before Node 22
 * a bare name would be looked up in the working directory (the repository)
 * first.
 */
function taskkillPath() {
  const winDir = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const file = join(winDir, 'System32', 'taskkill.exe');
  return existsSync(file) ? file : 'taskkill';
}

/**
 * Windows: end a child's whole process tree at once. `taskkill /F` gives the
 * tree no chance to clean up, so anything worth saving must be saved first.
 */
function killTree(child) {
  if (hasExited(child)) return;
  spawnSync(taskkillPath(), ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
}

/**
 * Ask the running Emulator Hub to write an export to .emulator-data/ now.
 * This is the same request the Firebase CLI sends itself for
 * `--export-on-exit`; it is used where the CLI never gets the chance to
 * (Windows stops that end the tree with taskkill).
 *
 * Sent with node:http rather than fetch so that no `Origin` header can ever
 * be attached: the hub answers 403 to any request that carries one.
 * Never rejects: resolves to { ok, detail } so a failed export cannot keep
 * the stack from stopping.
 */
function exportViaHub(timeoutMs = HUB_EXPORT_TIMEOUT_MS) {
  return new Promise((done) => {
    const body = JSON.stringify({ path: join(ROOT, EXPORT_DIR), initiatedBy: 'local-dev' });
    let settled = false;
    let timer;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done({ ok, detail });
    };
    const req = httpRequest(
      {
        host: EMULATOR_HUB_HOST,
        port: EMULATOR_HUB_PORT,
        path: EMULATOR_HUB_EXPORT_PATH,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (text.length < 2000) text += chunk;
        });
        res.on('end', () =>
          finish(res.statusCode === 200, `HTTP ${res.statusCode} ${text.trim().slice(0, 300)}`.trim()),
        );
      },
    );
    // The hub answers only when the export is complete, so this bounds the whole export.
    timer = setTimeout(() => {
      const seconds = Math.round(timeoutMs / 1000);
      req.destroy(new Error(`no answer from the Emulator Hub within ${seconds} s`));
    }, timeoutMs);
    req.on('error', (err) =>
      finish(false, err.code === 'ECONNREFUSED' ? 'the Emulator Hub is not running' : err.message),
    );
    req.end(body);
  });
}

/**
 * True when nothing listens on the hub port (a refused connection, not merely
 * a slow one). Windows takes about two seconds to refuse a connection to a
 * closed loopback port, so the wait for an answer has to be longer than that:
 * with one second this never saw the port close.
 */
function hubPortClosed() {
  return new Promise((done) => {
    const socket = netConnect({ host: EMULATOR_HUB_HOST, port: EMULATOR_HUB_PORT });
    const finish = (closed) => {
      socket.destroy();
      done(closed);
    };
    socket.setTimeout(HUB_REFUSAL_TIMEOUT_MS, () => finish(false));
    socket.once('connect', () => finish(false));
    socket.once('error', (err) => finish(err.code === 'ECONNREFUSED'));
  });
}

/**
 * Windows, after a Ctrl+C in the console. The console already delivered the
 * Ctrl+C to every process in it, so the emulators are running their own
 * export-on-exit; killing them now would cut that export short. Wait until
 * the children are gone, or until the hub port closes: the CLI stops the hub
 * only after the export is on disk, so from then on only wrappers can be left
 * (typically cmd.exe sitting at "Terminate batch job (Y/N)?").
 */
async function waitAfterConsoleInterrupt() {
  const started = Date.now();
  while (children.size > 0 && Date.now() - started < CONSOLE_INTERRUPT_GRACE_MS) {
    if (await hubPortClosed()) {
      await sleep(1000); // let the CLI finish exiting by itself
      return;
    }
    await sleep(500);
  }
}

/**
 * Stop every child, then exit.
 *
 * `cause` is 'interrupt' for SIGINT (Ctrl+C) and 'request' for everything
 * else: the console's managed stop, a lost IPC channel, SIGTERM, or one child
 * dying. The distinction only matters on Windows:
 *
 *   POSIX              SIGINT to each child's process group. The emulators
 *                      export .emulator-data on SIGINT.
 *   Windows interrupt  Wait for the children to finish by themselves (see
 *                      waitAfterConsoleInterrupt), then taskkill what is left.
 *   Windows request    Nothing has told the emulators to stop, and taskkill
 *                      would end them before they could export. Ask the hub
 *                      to export first, then taskkill.
 *
 * A stop that arrives before the emulators were started (during an install or
 * a download) has nothing to save: on Windows the tree is ended at once.
 */
async function shutdown(exitCode = 0, cause = 'request') {
  if (shuttingDown) return;
  shuttingDown = true;
  log('Shutting down...');

  try {
    if (!IS_WINDOWS) {
      for (const child of children) interruptTree(child);
    } else {
      if (!emulatorsStarted) {
        // Nothing to export, and no hub to wait for or to ask.
      } else if (cause === 'interrupt') {
        await waitAfterConsoleInterrupt();
      } else {
        log(`Saving emulator data to ${EXPORT_DIR}/ ...`);
        const result = await exportViaHub();
        if (result.ok) log('Emulator data saved.');
        else warn(`Emulator data was not saved (${result.detail}).`);
      }
      for (const child of children) killTree(child);
    }
  } catch (err) {
    // Stopping must always end in process.exit, whatever went wrong on the way.
    warn(`Problem while stopping: ${err instanceof Error ? err.message : String(err)}`);
  }

  const pending = [...children].map((c) => new Promise((res) => c.once('exit', res)));
  const deadline = new Promise((res) => setTimeout(res, EXIT_DEADLINE_MS).unref());
  await Promise.race([Promise.all(pending), deadline]);
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(0, 'interrupt'));
process.on('SIGTERM', () => shutdown(0));

// Managed mode: the Build Console starts this script with an IPC channel and
// stops it with a message, because a hidden Windows process has no console to
// receive a Ctrl+C. A closed channel means the console is gone, so stop too
// rather than keep a stack running that nothing can control.
if (process.send) {
  process.on('message', (m) => {
    if (m && m.type === 'shutdown') shutdown(0);
  });
  process.on('disconnect', () => shutdown(0));
  // The console also owns our output pipes. If it dies they break, and an
  // unhandled EPIPE would end this process before the children are stopped.
  process.stdout.on('error', () => {});
  process.stderr.on('error', () => {});
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------
/** Output of a short command that answers at once, or null when it is missing or failed. */
function capture(cmd, args, opts = {}) {
  const [file, argv, shellOpt] = spawnArgs(cmd, args);
  const r = spawnSync(file, argv, { encoding: 'utf8', ...shellOpt, ...opts });
  return r.error || r.status !== 0 ? null : r;
}

function versionOf(cmd, args) {
  const r = capture(cmd, args);
  return r ? `${r.stdout}${r.stderr}`.trim() : null;
}

async function preflight() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    throw new Error(`Node 20 or newer is required (found ${process.version}).`);
  }

  // The Firestore and Storage emulators are Java programs.
  if (!versionOf('java', ['-version'])) {
    throw new Error(
      'Java (JDK 21+) is required by the Firestore and Storage emulators but was not found on PATH.\n' +
        '  Install Temurin: https://adoptium.net/temurin/releases/  then reopen your terminal.',
    );
  }

  if (!EMULATORS_ONLY && !existsSync(NG_BIN)) {
    log('Installing web app dependencies (yarn install)...');
    await runStep('yarn', ['install', '--frozen-lockfile'], { cwd: ROOT });
  }

  // functions/node_modules is not tracked in git (see #212); install it when
  // missing or stale. The emulator spawns .bin/firebase-functions, so on
  // macOS/Linux it must also be executable.
  const fnBin = join(FUNCTIONS_DIR, 'node_modules', '.bin', 'firebase-functions');
  let fnBinOk = existsSync(fnBin);
  if (fnBinOk && !IS_WINDOWS) {
    try {
      accessSync(fnBin, constants.X_OK);
    } catch {
      fnBinOk = false;
    }
  }
  const sdkOk = existsSync(join(FUNCTIONS_DIR, 'node_modules', '@anthropic-ai', 'sdk'));
  if (!fnBinOk || !sdkOk || !existsSync(TSC_BIN)) {
    log('Installing Cloud Functions dependencies (npm ci in functions/)...');
    await runStep('npm', ['ci'], { cwd: FUNCTIONS_DIR });
  }

  // Local secrets for the Functions emulator.
  const secretFile = join(FUNCTIONS_DIR, '.secret.local');
  if (!existsSync(secretFile)) {
    copyFileSync(join(FUNCTIONS_DIR, '.secret.local.example'), secretFile);
    warn('Created functions/.secret.local from the example. Add your ANTHROPIC_API_KEY to it.');
  }
  const secrets = readFileSync(secretFile, 'utf8');
  const keyLine = secrets.split(/\r?\n/).find((l) => l.startsWith('ANTHROPIC_API_KEY='));
  const keyValue = keyLine ? keyLine.slice('ANTHROPIC_API_KEY='.length).trim() : '';
  // "placeholder" is what .secret.local.example ships with; the functions
  // treat it as "not configured" (see functions/src/ai/claude.ts).
  if (!keyValue || keyValue === 'placeholder') {
    warn(
      'ANTHROPIC_API_KEY is not set in functions/.secret.local. The app will run, but the AI buttons\n' +
        '  will report "AI features are not configured" until you add a key and restart.',
    );
  }
}

const PROXY_VARS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
const proxyConfigured = () => PROXY_VARS.some((k) => process.env[k]);

/**
 * Environment for the emulator process. The Firebase CLI routes every request,
 * including its own loopback calls to the emulators, through HTTP(S)_PROXY and
 * ignores NO_PROXY, so behind a corporate proxy trigger registration fails
 * with "Unable to parse JSON ... upstream". The emulator binaries are
 * downloaded beforehand (see ensureEmulatorBinaries), so the proxy variables
 * are dropped for the emulator process itself.
 */
function emulatorEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (proxyConfigured()) {
    for (const k of PROXY_VARS) delete env[k];
  }
  return env;
}

// ---------------------------------------------------------------------------
// Firebase CLI and emulator downloads
//
// Both are fetched before the emulators are started, each as its own visible
// step without a time limit. Left to `emulators:start` they would run inside
// the readiness wait: on a slow first run that wait expired while npx was
// still installing the CLI without printing anything, the stop killed the
// install half way, nothing was cached, and the next start failed the same way.
// ---------------------------------------------------------------------------

const hasFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

/** Where npm keeps its cache unless it is configured otherwise. */
function usualNpmCacheDir() {
  const fromEnv = process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE;
  if (fromEnv) return resolve(fromEnv);
  if (IS_WINDOWS) {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'npm-cache');
  }
  return join(homedir(), '.npm');
}

/** The cache folder npm itself reports (one short npm call; this sees a `cache=` line in .npmrc). */
function configuredNpmCacheDir() {
  const r = capture('npm', ['config', 'get', 'cache'], { cwd: ROOT });
  const answer = r ? r.stdout.trim().split(/\r?\n/).pop().trim() : '';
  return answer ? resolve(answer) : null;
}

/**
 * The folders npx may have installed `firebase-tools@15` into, most likely first.
 *
 * npx keeps the packages of one command in <npm cache>/_npx/<hash>, where the
 * hash is the first 16 hex digits of the SHA-512 of the package spec
 * (libnpmexec). npm is only asked for its cache folder when the caller looks
 * past the usual one, which keeps a normal start free of extra CLI calls.
 */
function* npxFolders() {
  const hash = createHash('sha512').update(FIREBASE_TOOLS_SPEC).digest('hex').slice(0, 16);
  const usual = usualNpmCacheDir();
  yield join(usual, '_npx', hash);
  const configured = configuredNpmCacheDir();
  if (configured && configured !== usual) yield join(configured, '_npx', hash);
}

/**
 * npm writes node_modules/.package-lock.json at the end of an install; a
 * folder without it belongs to an install that was cut short.
 */
const npxInstallFinished = (folder) => hasFile(join(folder, 'node_modules', '.package-lock.json'));

/**
 * Package folder of the CLI that `npx firebase-tools@15` has installed, or
 * null when there is no complete install yet. If a later npm lays the folder
 * out differently this is null every time and the CLI is simply run once more
 * (see ensureFirebaseCli), which is quick when it is already there.
 */
function npxFirebaseHome() {
  for (const folder of npxFolders()) {
    const home = join(folder, 'node_modules', 'firebase-tools');
    if (npxInstallFinished(folder) && hasFile(join(home, 'package.json'))) return home;
  }
  return null;
}

/**
 * Package folder of a globally installed CLI, or null when it cannot be told
 * (the standalone binary, for example). npm puts `firebase` on PATH as a link
 * into the package (macOS/Linux) or as firebase.cmd next to node_modules
 * (Windows).
 */
function globalFirebaseHome() {
  const names = IS_WINDOWS ? ['firebase.cmd', 'firebase.exe', 'firebase'] : ['firebase'];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    const shim = names.map((name) => join(dir, name)).find(hasFile);
    if (!shim) continue;
    const candidates = [join(dir, 'node_modules', 'firebase-tools')];
    try {
      // <package>/lib/bin/firebase.js
      candidates.push(resolve(dirname(realpathSync(shim)), '..', '..'));
    } catch {
      // not a link we can follow
    }
    const isCli = (home) => hasFile(join(home, 'lib', 'emulator', 'downloadableEmulators.js'));
    return candidates.find(isCli) ?? null;
  }
  return null;
}

/**
 * How to run the Firebase CLI: a globally installed one when there is one,
 * otherwise through npx. In the npx case the first run has to install the CLI
 * (hundreds of packages, several minutes on a slow disk or connection), which
 * is done here, by itself and to completion, so that `emulators:start` later
 * finds it in the npx cache and starts at once.
 *
 * Returns { cmd, prefix, home }; `home` is the CLI's package folder, or null
 * when it could not be located.
 */
async function ensureFirebaseCli() {
  if (versionOf('firebase', ['--version'])) {
    return { cmd: 'firebase', prefix: [], home: globalFirebaseHome() };
  }
  const npx = { cmd: 'npx', prefix: ['--yes', FIREBASE_TOOLS_SPEC] };
  let home = npxFirebaseHome();
  if (!home) {
    log('Fetching the Firebase CLI (first run only; this can take several minutes)...');
    const fetchCli = () => runStep(npx.cmd, [...npx.prefix, '--version'], { cwd: ROOT });
    const explain = (err) =>
      new Error(
        `The Firebase CLI could not be fetched (${err.message}).\n` +
          '  Check the internet connection and start again. If it keeps failing, delete the folder\n' +
          `  ${dirname([...npxFolders()].pop())} and start again.`,
      );
    try {
      await fetchCli();
    } catch (err) {
      if (err instanceof Stopped) throw err;
      // An install that was killed half way (a forced stop, a closed window)
      // can leave a CLI that npx takes for complete and that then fails to
      // load. Clear what such an install left behind and fetch once more.
      const unfinished = [...npxFolders()].filter(
        (folder) => existsSync(join(folder, 'node_modules')) && !npxInstallFinished(folder),
      );
      if (unfinished.length === 0) throw explain(err);
      warn(
        'An earlier fetch of the Firebase CLI was cut short. Removing what it left, fetching again...',
      );
      for (const folder of unfinished) rmSync(folder, { recursive: true, force: true });
      try {
        await fetchCli();
      } catch (again) {
        throw again instanceof Stopped ? again : explain(again);
      }
    }
    home = npxFirebaseHome();
  }
  return { ...npx, home };
}

/** Folder the Firebase CLI keeps its emulator downloads in (lib/emulator/downloadableEmulators.js). */
const emulatorCacheDir = () =>
  process.env.FIREBASE_EMULATORS_PATH || join(homedir(), '.cache', 'firebase', 'emulators');

/**
 * The emulator downloads that are not in the CLI's cache folder yet.
 *
 * The CLI names the exact file it starts for each emulator, and its size, in
 * lib/emulator/downloadableEmulatorInfo.json: a JAR for Firestore and Storage,
 * server/server.mjs inside the unpacked archive for the UI. A file of another
 * size is a download that was cut short. Where that list cannot be read (the
 * CLI was not located) any version of the file counts as present, and
 * `emulators:start` fetches a newer one itself if it wants one.
 */
function missingEmulatorDownloads(firebaseHome) {
  const cache = emulatorCacheDir();
  let info = null;
  if (firebaseHome) {
    try {
      const list = join(firebaseHome, 'lib', 'emulator', 'downloadableEmulatorInfo.json');
      info = JSON.parse(readFileSync(list, 'utf8'));
    } catch {
      // fall back to the name patterns below
    }
  }
  let names = [];
  try {
    names = readdirSync(cache);
  } catch {
    // no cache folder yet: everything is missing
  }
  const anyVersion = {
    firestore: (name) => /^cloud-firestore-emulator-v.+\.jar$/.test(name),
    storage: (name) => /^cloud-storage-rules-runtime-v.+\.jar$/.test(name),
    ui: (name) => /^ui-v/.test(name) && hasFile(join(cache, name, 'server', 'server.mjs')),
  };
  return EMULATOR_DOWNLOADS.filter((target) => {
    const details = target === 'ui' ? info?.ui?.main : info?.[target];
    const file = details?.binaryPathRelativeToCacheDir ?? details?.downloadPathRelativeToCacheDir;
    if (typeof file !== 'string') return !names.some(anyVersion[target]);
    try {
      const { size } = statSync(join(cache, file));
      const sized = !details.binaryPathRelativeToCacheDir && details.expectedSize > 0;
      return sized && size !== details.expectedSize;
    } catch {
      return true;
    }
  });
}

/**
 * Download the emulator JARs and the Emulator UI when they are not cached yet
 * (the first run, or after the CLI moved to newer emulator versions). With
 * everything in place this only looks at the files and starts nothing.
 *
 * The downloads run with the proxy variables still set; the emulators are
 * started without them (see emulatorEnv).
 */
async function ensureEmulatorBinaries(firebase) {
  const missing = missingEmulatorDownloads(firebase.home);
  if (missing.length === 0) return;
  const which = missing.join(', ');
  log(
    `Downloading the Firebase emulators (${which}; first run only, this can take a few minutes)...`,
  );
  for (const target of missing) {
    await runStep(firebase.cmd, [...firebase.prefix, `setup:emulators:${target}`], { cwd: ROOT });
  }
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------
async function waitForEmulators(timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (shuttingDown) return false;
    try {
      const res = await fetch(EMULATOR_HUB_URL);
      if (res.ok) {
        const emulators = await res.json();
        // Wait for every requested emulator, not just the first few: the hub
        // lists them as they start, and a stop that arrives before the last
        // one (Storage) is listening makes the export fail and save nothing.
        if (EMULATORS.split(',').every((name) => emulators[name])) return true;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function main() {
  log('Preflight checks...');
  await preflight();

  // First run only. Both steps take as long as they take; nothing is timed
  // until the emulators themselves are started.
  const firebase = await ensureFirebaseCli();
  const { cmd, prefix } = firebase;
  await ensureEmulatorBinaries(firebase);

  log('Building Cloud Functions...');
  await runStep(process.execPath, [TSC_BIN, '-p', FUNCTIONS_DIR]);
  start('tsc --watch (functions)', process.execPath, [TSC_BIN, '--watch', '--preserveWatchOutput', '-p', FUNCTIONS_DIR]);

  const emulatorArgs = [
    ...prefix,
    'emulators:start',
    '--project',
    LOCAL_PROJECT_ID,
    '--only',
    EMULATORS,
    '--export-on-exit',
    EXPORT_DIR,
  ];
  // firebase-tools errors on --import of a missing directory, so only import
  // once a previous run has exported something.
  if (existsSync(join(ROOT, EXPORT_DIR))) {
    emulatorArgs.push('--import', EXPORT_DIR);
  } else {
    log(`No ${EXPORT_DIR}/ yet: starting with an empty database (it is created on first exit).`);
  }
  if (proxyConfigured()) {
    warn(
      'HTTP proxy detected. Starting the emulators without the proxy variables (the Firebase CLI\n' +
        '  would otherwise send its own loopback calls through the proxy).',
    );
  }
  log(`Starting Firebase emulators (${EMULATORS}) for project ${LOCAL_PROJECT_ID}...`);
  emulatorsStarted = true;
  start('Firebase emulators', cmd, emulatorArgs, {
    cwd: ROOT,
    env: emulatorEnv({ FORCE_COLOR: '1' }),
  });

  log('Waiting for the emulators to come up...');
  const ready = await waitForEmulators();
  if (!ready) {
    if (!shuttingDown) fail('Emulators did not become ready in time. See the output above.');
    return;
  }

  if (EMULATORS_ONLY) {
    console.log(`
\x1b[32mEmulators are up.\x1b[0m  Emulator UI: http://127.0.0.1:4000
  Run \`yarn start:local\` in another terminal for the app. Ctrl+C stops and exports to ${EXPORT_DIR}/.
`);
    return;
  }

  log('Starting Angular dev server (ng serve --configuration local)...');
  start('ng serve', process.execPath, [NG_BIN, 'serve', '--configuration', 'local'], { cwd: ROOT });

  console.log(`
\x1b[32mOmniTask local stack is up.\x1b[0m
  App:          http://localhost:4200
  Emulator UI:  http://127.0.0.1:4000  (Auth users, Firestore data, function logs)
  Sign in with "Continue with Google": the Auth emulator shows a fake popup where
  any email works. Accounts are local-only.
  Press Ctrl+C to stop (emulator data is saved to ${EXPORT_DIR}/).
`);
}

main().catch((err) => {
  // A step that was stopped on purpose is not a failure, and shutdown() is already on its way.
  if (err instanceof Stopped || shuttingDown) return;
  fail(err instanceof Error ? err.message : String(err));
});
