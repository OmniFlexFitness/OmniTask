#!/usr/bin/env node
/**
 * OmniTask one-command local stack.
 *
 *   yarn dev:local                      # emulators + functions + ng serve
 *   yarn emulators                      # = node scripts/local-dev.mjs --emulators-only
 *
 * Starts, in order:
 *   1. Preflight: Node/Java checks, dependency install, functions/.secret.local
 *   2. Cloud Functions build + `tsc --watch`
 *   3. Firebase emulators (Auth, Firestore, Functions, Storage) under the
 *      offline-only project `demo-omnitask`, importing and persisting data in
 *      .emulator-data/
 *   4. `ng serve --configuration local` (points the app at the emulators)
 *
 * Ctrl+C stops everything; the emulators export their data on exit.
 * Plain Node, no extra dependencies, works on Windows/macOS/Linux.
 * Full guide: docs/local-development.md
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync, accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(ROOT, 'functions');
const IS_WINDOWS = process.platform === 'win32';
const EMULATORS_ONLY = process.argv.includes('--emulators-only');

/** Must match src/environments/environment.local.ts (demo- prefix = offline only). */
const LOCAL_PROJECT_ID = 'demo-omnitask';
/** Emulators to run. Extensions are intentionally excluded (production-only). */
const EMULATORS = 'auth,firestore,functions,storage';
/** Firebase CLI version used when no global `firebase` binary is installed. */
const FIREBASE_TOOLS_SPEC = 'firebase-tools@15';
/** Emulator hub (fixed port from firebase.json defaults) used to detect readiness. */
const EMULATOR_HUB_URL = 'http://127.0.0.1:4400/emulators';
const EXPORT_DIR = '.emulator-data';

/** JS entry points run directly with the current Node binary (no npm/yarn wrapper). */
const TSC_BIN = join(FUNCTIONS_DIR, 'node_modules', 'typescript', 'bin', 'tsc');
const NG_BIN = join(ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');

const children = new Set();
let shuttingDown = false;

const log = (msg) => console.log(`\x1b[36m[dev:local]\x1b[0m ${msg}`);
const warn = (msg) => console.warn(`\x1b[33m[dev:local]\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\x1b[31m[dev:local]\x1b[0m ${msg}`);
  shutdown(1);
};

/**
 * Build spawn arguments. Node 24 deprecates passing an args array together
 * with `shell: true` (DEP0190), so on Windows, where .cmd shims need a shell,
 * the command is a single pre-built string. All arguments used here are fixed
 * literals without spaces, so plain joining is safe.
 */
function spawnArgs(cmd, args) {
  return IS_WINDOWS ? [[cmd, ...args].join(' '), [], { shell: true }] : [cmd, args, { shell: false }];
}

/** Run a command to completion, inheriting stdio. Throws on non-zero exit. */
function run(cmd, args, opts = {}) {
  const [file, argv, shellOpt] = spawnArgs(cmd, args);
  const result = spawnSync(file, argv, { stdio: 'inherit', ...shellOpt, ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
  }
}

/**
 * Start a long-running child and track it for shutdown.
 *
 * On POSIX each child gets its own process group (`detached`), so shutdown()
 * can signal the whole tree with kill(-pid): `npx firebase-tools` is a
 * wrapper around the real CLI, and signaling only the wrapper would orphan
 * the emulators without an export. On Windows the tree is ended with
 * `taskkill /T`.
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
    if (!shuttingDown) {
      fail(`${name} exited unexpectedly (${signal ?? `code ${code}`}). Stopping the stack.`);
    }
  });
  return child;
}

/** Deliver SIGINT (or the Windows equivalent) to a child's whole process tree. */
function stopTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WINDOWS) {
    // Ctrl+C in the console already reaches every process in the console group,
    // so this path is mostly for "one child died, stop the rest".
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGINT'); // whole process group
  } catch {
    child.kill('SIGINT');
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('Shutting down...');
  for (const child of children) stopTree(child);
  // Emulators export .emulator-data on SIGINT; give them time to flush, then exit.
  const pending = [...children].map((c) => new Promise((res) => c.once('exit', res)));
  const deadline = new Promise((res) => setTimeout(res, 15_000).unref());
  Promise.race([Promise.all(pending), deadline]).then(() => process.exit(exitCode));
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------
function versionOf(cmd, args) {
  const [file, argv, shellOpt] = spawnArgs(cmd, args);
  const r = spawnSync(file, argv, { encoding: 'utf8', ...shellOpt });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout}${r.stderr}`.trim();
}

function preflight() {
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
    run('yarn', ['install', '--frozen-lockfile'], { cwd: ROOT });
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
    run('npm', ['ci'], { cwd: FUNCTIONS_DIR });
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

/**
 * Behind a proxy, fetch the emulator JARs/UI with the proxy still set
 * (cached under ~/.cache/firebase/emulators, so this is a no-op after the
 * first run). Without a proxy, emulators:start downloads them itself.
 */
function ensureEmulatorBinaries(firebase) {
  if (!proxyConfigured()) return;
  warn(
    'HTTP proxy detected. Pre-downloading emulator binaries through it, then starting the emulators\n' +
      '  without the proxy variables (the Firebase CLI would otherwise proxy its own loopback calls).',
  );
  for (const target of ['firestore', 'storage', 'ui']) {
    run(firebase.cmd, [...firebase.prefix, `setup:emulators:${target}`], { cwd: ROOT });
  }
}

// ---------------------------------------------------------------------------
// Stack
// ---------------------------------------------------------------------------
function firebaseCommand() {
  // Prefer a globally installed CLI; otherwise run it via npx (cached after first use).
  if (versionOf('firebase', ['--version'])) return { cmd: 'firebase', prefix: [] };
  return { cmd: 'npx', prefix: ['--yes', FIREBASE_TOOLS_SPEC] };
}

async function waitForEmulators(timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (shuttingDown) return false;
    try {
      const res = await fetch(EMULATOR_HUB_URL);
      if (res.ok) {
        const emulators = await res.json();
        if (emulators.functions && emulators.firestore && emulators.auth) return true;
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
  preflight();

  log('Building Cloud Functions...');
  run(process.execPath, [TSC_BIN, '-p', FUNCTIONS_DIR]);
  start('tsc --watch (functions)', process.execPath, [TSC_BIN, '--watch', '--preserveWatchOutput', '-p', FUNCTIONS_DIR]);

  const firebase = firebaseCommand();
  const { cmd, prefix } = firebase;
  ensureEmulatorBinaries(firebase);
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
  log(`Starting Firebase emulators (${EMULATORS}) for project ${LOCAL_PROJECT_ID}...`);
  start('Firebase emulators', cmd, emulatorArgs, {
    cwd: ROOT,
    env: emulatorEnv({ FORCE_COLOR: '1' }),
  });

  log('Waiting for the emulators to come up (first run downloads the emulator JARs)...');
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

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
