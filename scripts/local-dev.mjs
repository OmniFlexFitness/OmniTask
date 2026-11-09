#!/usr/bin/env node
/**
 * OmniTask one-command local stack.
 *
 *   yarn dev:local
 *
 * Starts, in order:
 *   1. Preflight: Node/Java checks, dependency install, functions/.secret.local
 *   2. Cloud Functions build + `tsc --watch`
 *   3. Firebase emulators (Auth, Firestore, Functions, Storage) under the
 *      offline-only project `demo-omnitask`, persisting data to .emulator-data/
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

/** Must match src/environments/environment.local.ts (demo- prefix = offline only). */
const LOCAL_PROJECT_ID = 'demo-omnitask';
/** Emulators to run. Extensions are intentionally excluded (production-only). */
const EMULATORS = 'auth,firestore,functions,storage';
/** Firebase CLI version used when no global `firebase` binary is installed. */
const FIREBASE_TOOLS_SPEC = 'firebase-tools@15';
/** Emulator hub (fixed port from firebase.json defaults) used to detect readiness. */
const EMULATOR_HUB_URL = 'http://127.0.0.1:4400/emulators';
const EXPORT_DIR = '.emulator-data';

const children = new Set();
let shuttingDown = false;

const log = (msg) => console.log(`\x1b[36m[dev:local]\x1b[0m ${msg}`);
const warn = (msg) => console.warn(`\x1b[33m[dev:local]\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\x1b[31m[dev:local]\x1b[0m ${msg}`);
  shutdown(1);
};

/** Run a command to completion, inheriting stdio. Throws on non-zero exit. */
function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: IS_WINDOWS, // resolves npm/yarn/npx .cmd shims on Windows
    ...opts,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
  }
}

/** Start a long-running child and track it for shutdown. */
function start(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    shell: IS_WINDOWS,
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

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('Shutting down...');
  for (const child of children) {
    // SIGINT lets the emulators export .emulator-data before exiting.
    child.kill('SIGINT');
  }
  // Give the emulators a moment to flush, then exit.
  setTimeout(() => process.exit(exitCode), children.size ? 8000 : 0).unref();
  Promise.all(
    [...children].map((c) => new Promise((res) => c.once('exit', res))),
  ).then(() => process.exit(exitCode));
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------
function versionOf(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: IS_WINDOWS });
  if (r.error || r.status !== 0) return null;
  return `${r.stdout}${r.stderr}`.trim();
}

function preflight() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    throw new Error(`Node 20 or newer is required (found ${process.version}).`);
  }

  // The Firestore and Storage emulators are Java programs.
  const java = versionOf('java', ['-version']);
  if (!java) {
    throw new Error(
      'Java (JDK 21+) is required by the Firestore and Storage emulators but was not found on PATH.\n' +
        '  Install Temurin: https://adoptium.net/temurin/releases/  then reopen your terminal.',
    );
  }

  if (!existsSync(join(ROOT, 'node_modules', '@angular', 'cli'))) {
    log('Installing web app dependencies (yarn install)...');
    run('yarn', ['install', '--frozen-lockfile'], { cwd: ROOT });
  }

  // functions/node_modules must contain the Anthropic SDK and, on macOS/Linux,
  // an executable firebase-functions binary (the emulator spawns it). A stale
  // or Windows-copied tree fails both checks; `npm ci` fixes it.
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
  if (!fnBinOk || !sdkOk) {
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

/**
 * Environment for child processes. If a corporate HTTP proxy is configured,
 * make sure loopback traffic bypasses it: the Firebase CLI talks to the
 * emulators over 127.0.0.1 and a proxy in the middle breaks trigger
 * registration with "Unable to parse JSON ... upstream" errors.
 */
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  const proxied = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].some((k) => env[k]);
  if (proxied) {
    const current = env.NO_PROXY ?? env.no_proxy ?? '';
    const needed = ['127.0.0.1', 'localhost'].filter((h) => !current.split(',').includes(h));
    if (needed.length) {
      env.NO_PROXY = [current, ...needed].filter(Boolean).join(',');
      env.no_proxy = env.NO_PROXY;
    }
  }
  return env;
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
  run('npm', ['run', 'build'], { cwd: FUNCTIONS_DIR });
  start('tsc --watch (functions)', 'npm', ['run', 'build:watch', '--silent'], {
    cwd: FUNCTIONS_DIR,
  });

  const { cmd, prefix } = firebaseCommand();
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
  if (existsSync(join(ROOT, EXPORT_DIR))) {
    emulatorArgs.push('--import', EXPORT_DIR);
  } else {
    log(`No ${EXPORT_DIR}/ yet: starting with an empty database (it is created on first exit).`);
  }
  log(`Starting Firebase emulators (${EMULATORS}) for project ${LOCAL_PROJECT_ID}...`);
  start('Firebase emulators', cmd, emulatorArgs, {
    cwd: ROOT,
    env: childEnv({ FORCE_COLOR: '1' }),
  });

  log('Waiting for the emulators to come up (first run downloads the emulator JARs)...');
  const ready = await waitForEmulators();
  if (!ready) {
    if (!shuttingDown) fail('Emulators did not become ready in time. See the output above.');
    return;
  }

  log('Starting Angular dev server (ng serve --configuration local)...');
  start('ng serve', 'yarn', ['ng', 'serve', '--configuration', 'local'], { cwd: ROOT });

  console.log(`
\x1b[32mOmniTask local stack is up.\x1b[0m
  App:          http://localhost:4200
  Emulator UI:  http://127.0.0.1:4000  (Auth users, Firestore data, function logs)
  Sign in with any email/password or the fake Google popup; both are local-only.
  Press Ctrl+C to stop (emulator data is saved to ${EXPORT_DIR}/).
`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
