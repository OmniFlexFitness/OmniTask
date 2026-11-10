#!/usr/bin/env node
/**
 * OmniTask Build Console: local launcher.
 *
 *   yarn console                              # = node scripts/launch-console.mjs
 *   node scripts/launch-console.mjs --detach --browser app    # what the Desktop shortcut runs
 *
 * Serves scripts/console/console.html on http://127.0.0.1:4310 and gives its
 * buttons a small JSON API that really starts, stops and checks the local
 * stack (scripts/local-dev.mjs) on this machine.
 *
 *   --port N                  port to listen on (default 4310, env OMNITASK_CONSOLE_PORT)
 *   --browser app|default|none
 *                             app = chromeless Chrome/Edge window (default),
 *                             default = a tab in the default browser, none = print the URL
 *   --detach                  re-launch in the background and return at once
 *   --no-idle-exit            keep running even when nobody is looking at the page
 *
 * Because this server can start processes, every request passes a guard first
 * (see createGuard): loopback Host only, same-origin only, a per-run token on
 * the API, JSON bodies only. Actions are a fixed allowlist with fixed argument
 * lists; nothing from a request is ever put on a command line.
 *
 * Plain Node, no dependencies, works on Windows/macOS/Linux.
 */
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SELF), '..');
const IS_WINDOWS = process.platform === 'win32';

/** What /api/ping answers with; a second launch uses it to recognise a running console. */
export const APP_ID = 'omnitask-console';
export const DEFAULT_PORT = 4310;
/** Must match DEFAULT_CLAUDE_MODEL in functions/src/ai/claude.ts. */
export const DEFAULT_MODEL = 'claude-opus-5-5';

const MODEL_PATTERN = /^claude-[a-z0-9-]{3,40}$/;
const BODY_LIMIT = 16 * 1024;
/** An oversized body is read and thrown away up to this size so the client gets a clean 413. */
const DRAIN_LIMIT = 1024 * 1024;
const LOG_CAPACITY = 5000;
const LOG_LINE_MAX = 2000;
const LOG_PAGE_MAX = 800;
const IDLE_EXIT_MS = 120_000;
const STOP_TIMEOUT_MS = 60_000;

/** The lines scripts/local-dev.mjs prints once everything answers. */
const UP_MARKERS = {
  full: 'OmniTask local stack is up.',
  emulators: 'Emulators are up.',
};

/** Ports of the local stack (firebase.json defaults plus ng serve). */
const STACK_PORTS = [
  { port: 4200, name: 'app' },
  { port: 9099, name: 'auth' },
  { port: 8080, name: 'firestore' },
  { port: 9199, name: 'storage' },
  { port: 5001, name: 'functions' },
  { port: 4000, name: 'ui' },
  { port: 4400, name: 'hub' },
];

const PAGE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'";

// ---------------------------------------------------------------------------
// Pure helpers (exported for scripts/launch-console.test.mjs)
// ---------------------------------------------------------------------------

// CSI sequences (colours, cursor moves), OSC sequences (titles, hyperlinks) and
// two-character escapes. The control characters are written as \u escapes so
// this file stays plain ASCII.
const ANSI_PATTERN =
  /\u001b\[[0-?]*[ -/]*[@-~]|\u009b[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b[@-Z\\^_]?/g;

/** Remove terminal escape sequences so log lines are plain text. */
export function stripAnsi(text) {
  return String(text).replace(ANSI_PATTERN, '');
}

const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]{8,}/g;
const KEY_REDACTED = 'sk-ant-\u2026redacted';

/** Replace anything that looks like an Anthropic API key. Every log line goes through this. */
export function redact(text) {
  return String(text).replace(KEY_PATTERN, KEY_REDACTED);
}

/** KEY of a `KEY=value` line (optionally `export KEY=value`), or null for comments and blanks. */
function envLineKey(line) {
  const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  return match ? match[1] : null;
}

/** Value of a `KEY=value` line: a quoted value without its quotes, otherwise up to a trailing ` # comment`. */
function envLineValue(line) {
  const raw = line.slice(line.indexOf('=') + 1).trim();
  const quote = raw[0];
  if (quote === '"' || quote === "'") {
    const end = raw.indexOf(quote, 1);
    if (end !== -1) return raw.slice(1, end);
  }
  return raw.replace(/\s+#.*$/, '').trim();
}

/** Last assignment of `key` in dotenv-style text (the emulator lets the last one win too). */
function envValue(text, key) {
  let value = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (envLineKey(line) === key) value = envLineValue(line);
  }
  return value;
}

/**
 * State of functions/.secret.local, given its text (null when the file does
 * not exist): "missing", "placeholder" (no ANTHROPIC_API_KEY line, an empty
 * one, or the word the example file ships with) or "set".
 */
export function parseSecretState(text) {
  if (text === null || text === undefined) return 'missing';
  const value = envValue(text, 'ANTHROPIC_API_KEY');
  return !value || value === 'placeholder' ? 'placeholder' : 'set';
}

/** The two overrides the console manages in functions/.env.local. */
export function parseEnvLocal(text) {
  return {
    model: envValue(text, 'ANTHROPIC_MODEL') || DEFAULT_MODEL,
    realmail: envValue(text, 'EMULATOR_SEND_REAL_EMAIL') === 'true',
  };
}

/**
 * New text for functions/.env.local with ONLY the ANTHROPIC_MODEL and
 * EMULATOR_SEND_REAL_EMAIL lines changed; every other line (comments, other
 * variables, line endings) is kept as it is. The model line is left out for
 * the default model and the mail line when real mail is off, so an untouched
 * setup has no file at all: returns null when nothing but blank lines is
 * left, which means "delete the file".
 */
export function rewriteEnvLocal(text, { model, realmail }) {
  const source = String(text ?? '');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop(); // the empty piece after the final newline
  const wanted = new Map([
    ['ANTHROPIC_MODEL', model && model !== DEFAULT_MODEL ? `ANTHROPIC_MODEL=${model}` : null],
    ['EMULATOR_SEND_REAL_EMAIL', realmail ? 'EMULATOR_SEND_REAL_EMAIL=true' : null],
  ]);
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = envLineKey(line);
    if (!wanted.has(key)) {
      out.push(line);
      continue;
    }
    if (seen.has(key)) continue; // a duplicate assignment would override the one just written
    seen.add(key);
    if (wanted.get(key) !== null) out.push(wanted.get(key));
  }
  for (const [key, line] of wanted) {
    if (line !== null && !seen.has(key)) out.push(line);
  }
  if (out.every((line) => line.trim() === '')) return null;
  return out.join(eol) + eol;
}

/**
 * Wrap the Artifact-format page body in a full document and hand it the
 * per-run token. `<` is escaped in the JSON so a value containing `</script>`
 * or `<!--` cannot end the script element early.
 */
export function wrapPage(body, info) {
  const json = JSON.stringify({
    token: info.token,
    version: info.version,
    platform: info.platform,
    repo: info.repo,
    port: info.port,
  }).replace(/</g, '\\u003c');
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
    '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n' +
    `<script>window.__OMNITASK_CONSOLE__ = ${json};</script>\n` +
    `</head><body>${body}</body></html>\n`
  );
}

/**
 * Absolute path of the entry `name` of `root`, or null unless it really is
 * that entry once links are resolved. A name that climbs out with `..` is
 * refused, and so is a link, wherever it points: following one could delete a
 * folder outside the repository, or another folder inside it. Used before
 * anything is deleted.
 */
export function resolveInside(root, name) {
  let base;
  try {
    base = fs.realpathSync(path.resolve(root));
  } catch {
    return null;
  }
  const expected = path.resolve(base, name);
  const relative = path.relative(base, expected);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  let actual = expected;
  try {
    actual = fs.realpathSync(expected);
  } catch {
    // Nothing there (or a link to nowhere): removing the entry itself is all that can happen.
  }
  const same = IS_WINDOWS ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
  return same ? expected : null;
}

function sha256(text) {
  return createHash('sha256').update(String(text)).digest();
}

function requestPath(req) {
  const url = typeof req.url === 'string' ? req.url : '';
  const mark = url.indexOf('?');
  return mark === -1 ? url : url.slice(0, mark);
}

function isJsonContentType(value) {
  return typeof value === 'string' && value.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * The request guard. `check(req)` applies the header rules and returns null
 * (allowed) or `{ status, error }`; `readJson(req)` applies the body rules and
 * resolves to `{ value }` or `{ status, error }`.
 *
 *   1. Host must be exactly 127.0.0.1:<port> or localhost:<port>. A page that
 *      re-points its own domain at 127.0.0.1 (DNS rebinding) still sends its
 *      own name here, so it is refused.
 *   2. An Origin header, when present, must be this server. Browsers add it to
 *      every cross-site POST and fetch(), so other sites are refused.
 *   3. /api/* except /api/ping needs the per-run token in X-Console-Token. A
 *      custom header also forces a CORS preflight, which is never approved.
 *   4. POST bodies must be application/json (not one of the content types a
 *      plain HTML form can send), at most 16 KiB, and a JSON object.
 *   5. Only GET and POST. No CORS headers are ever sent.
 *
 * `port` may be a function for servers that listen on an ephemeral port.
 */
export function createGuard({ port, token }) {
  const currentPort = typeof port === 'function' ? port : () => port;
  const expected = sha256(token);

  // Both sides are hashed first: timingSafeEqual needs equal lengths, and the
  // comparison then takes the same time whatever was sent.
  const tokenMatches = (candidate) => typeof candidate === 'string' && timingSafeEqual(sha256(candidate), expected);

  function check(req) {
    const p = currentPort();
    const headers = req.headers ?? {};

    const hostCount = (req.rawHeaders ?? []).filter((name, i) => i % 2 === 0 && /^host$/i.test(name)).length;
    const host = headers.host;
    if (hostCount > 1 || (host !== `127.0.0.1:${p}` && host !== `localhost:${p}`)) {
      return { status: 403, error: 'This console only answers on its own loopback address.' };
    }

    const origin = headers.origin;
    if (origin !== undefined && origin !== `http://127.0.0.1:${p}` && origin !== `http://localhost:${p}`) {
      return { status: 403, error: 'Requests from other sites are not accepted.' };
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
      return { status: 405, error: 'Only GET and POST are accepted.' };
    }

    const pathname = requestPath(req);
    if (pathname.startsWith('/api/') && pathname !== '/api/ping') {
      // Extra to the token: browsers label where a request came from, and the
      // page only ever calls the API from its own origin.
      const site = headers['sec-fetch-site'];
      if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        return { status: 403, error: 'Requests from other sites are not accepted.' };
      }
      if (!tokenMatches(headers['x-console-token'])) {
        return { status: 401, error: 'Missing or wrong console token. Reload the console window.' };
      }
    }

    if (req.method === 'POST') {
      if (!isJsonContentType(headers['content-type'])) {
        return { status: 415, error: 'POST bodies must be application/json.' };
      }
      const declared = Number(headers['content-length']);
      if (Number.isFinite(declared) && declared > BODY_LIMIT) {
        return { status: 413, error: 'Request body is too large.' };
      }
    }
    return null;
  }

  function readJson(req) {
    return new Promise((resolve) => {
      const chunks = [];
      let size = 0;
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const tooLarge = { status: 413, error: 'Request body is too large.' };
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size <= BODY_LIMIT) {
          chunks.push(chunk);
          return;
        }
        chunks.length = 0; // keep nothing of an oversized body
        if (size > DRAIN_LIMIT) {
          req.pause();
          settle(tooLarge);
        }
      });
      req.on('end', () => {
        if (size > BODY_LIMIT) return settle(tooLarge);
        let value;
        try {
          value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return settle({ status: 400, error: 'Request body is not valid JSON.' });
        }
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return settle({ status: 400, error: 'Request body must be a JSON object.' });
        }
        settle({ value });
      });
      req.on('error', () => settle({ status: 400, error: 'Request was cut off.' }));
      req.on('close', () => settle({ status: 400, error: 'Request was cut off.' }));
    });
  }

  return { check, readJson };
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

/**
 * Same approach as spawnArgs() in scripts/local-dev.mjs: yarn and npm are .cmd
 * shims on Windows and need a shell, and Node 24 deprecates an args array
 * together with `shell: true` (DEP0190), so there the command is one string.
 * Only ever called with the constant names and arguments in this file.
 */
function spawnArgs(cmd, args) {
  return IS_WINDOWS ? [[cmd, ...args].join(' '), [], { shell: true }] : [cmd, args, { shell: false }];
}

/**
 * Full path of a tool that ships with Windows. A bare name is looked up in the
 * working directory (the repository) before PATH, so a file of the same name
 * dropped there would run instead.
 */
function systemTool(name) {
  if (!IS_WINDOWS) return name;
  const winDir = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  for (const candidate of [path.join(winDir, 'System32', name), path.join(winDir, name)]) {
    if (isFile(candidate)) return candidate;
  }
  return name;
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * End a child and everything it started. No POSIX signals on Windows:
 * taskkill walks the tree. Elsewhere the child was started `detached`, so it
 * leads a process group that can be signalled as a whole.
 */
function killTree(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WINDOWS) {
    const killer = spawn(systemTool('taskkill.exe'), ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.on('error', () => child.kill());
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // Not a group leader (or already gone): the direct kill below covers it.
  }
  try {
    child.kill('SIGKILL');
  } catch {
    // already gone
  }
}

/** Run a short command and collect its output. Never rejects; `code` is null when it could not run. */
function capture(file, args, { cwd, env, shell = false, timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, { cwd, env, shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve({ code: null, stdout: '', stderr: '' });
      return;
    }
    let stdout = '';
    let stderr = '';
    let done = false;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    };
    const timer = setTimeout(() => {
      killTree(child);
      finish(null);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 65536) stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 65536) stderr += chunk;
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
  });
}

/** Start a program that outlives this one (editor, file manager, browser). Resolves false if it could not start. */
function launchDetached(file, args) {
  return new Promise((resolve) => {
    let child;
    try {
      // No windowsHide here: these are windowed programs and it would start them hidden.
      child = spawn(file, args, { detached: true, stdio: 'ignore' });
    } catch {
      resolve(false);
      return;
    }
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

/** Split a stream into lines. A line longer than 16 KiB is cut there (the log keeps 2000 characters anyway). */
function lineSplitter(onLine) {
  const MAX_PENDING = 16 * 1024;
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const feed = (text) => {
    const parts = text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (pending.length < MAX_PENDING) pending += parts[i].slice(0, MAX_PENDING - pending.length);
      if (i < parts.length - 1) {
        onLine(pending);
        pending = '';
      }
    }
  };
  return {
    write: (chunk) => feed(decoder.write(chunk)),
    end: () => {
      feed(decoder.end());
      if (pending) onLine(pending);
      pending = '';
    },
  };
}

function pipeLines(stream, onLine) {
  if (!stream) return;
  const splitter = lineSplitter(onLine);
  stream.on('data', splitter.write);
  stream.on('end', splitter.end);
  stream.on('error', () => {});
}

/** True when something accepts TCP connections on this loopback port. */
function probePort(port, timeoutMs = 250) {
  const attempt = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ host, port });
      const done = (open) => {
        socket.destroy();
        resolve(open);
      };
      socket.setTimeout(timeoutMs, () => done(false));
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
    });
  // ng serve listens on "localhost", which is ::1 only on some machines.
  return Promise.all([attempt('127.0.0.1'), attempt('::1')]).then((results) => results.includes(true));
}

/** Versions of the tools the stack needs; null for one that is missing. Run once at startup. */
async function probeTools() {
  // java prints its version on stderr.
  const java = await capture('java', ['-version'], { timeoutMs: 8000 });
  const javaMatch = java.code === 0 ? /version "([^"]+)"/.exec(`${java.stderr}\n${java.stdout}`) : null;
  const [yarnFile, yarnArgv, yarnShell] = spawnArgs('yarn', ['--version']);
  const yarn = await capture(yarnFile, yarnArgv, { ...yarnShell, timeoutMs: 8000 });
  const yarnMatch = yarn.code === 0 ? /^\s*(\d+\.\d+\.\d+\S*)/.exec(yarn.stdout) : null;
  return { node: process.version, java: javaMatch ? javaMatch[1] : null, yarn: yarnMatch ? yarnMatch[1] : null };
}

/**
 * The fixed command lists behind the job actions. Every value is a constant;
 * `shim` marks the .cmd shims that go through spawnArgs() on Windows.
 */
export function defaultJobSteps(root) {
  const functionsDir = path.join(root, 'functions');
  return {
    // Never wait for a password nobody can type; a failed login shows up in the log instead.
    pull: [{ file: 'git', args: ['pull', '--ff-only'], cwd: root, env: { GIT_TERMINAL_PROMPT: '0' }, label: 'git pull --ff-only' }],
    install: [
      { file: 'yarn', args: ['install'], cwd: root, shim: true, label: 'yarn install' },
      { file: 'npm', args: ['ci'], cwd: functionsDir, shim: true, label: 'npm ci  (in functions/)' },
    ],
    smoke: [
      {
        file: process.execPath,
        args: [path.join(functionsDir, 'scripts', 'ai-smoke.mjs')],
        cwd: functionsDir,
        label: 'node scripts/ai-smoke.mjs  (in functions/, key from .secret.local)',
      },
    ],
    checks: [
      { file: 'npm', args: ['run', 'build'], cwd: functionsDir, shim: true, label: 'npm run build  (in functions/)' },
      { file: 'npm', args: ['test'], cwd: functionsDir, shim: true, label: 'npm test  (in functions/)' },
      { file: 'yarn', args: ['lint'], cwd: root, shim: true, label: 'yarn lint' },
      { file: 'yarn', args: ['build'], cwd: root, shim: true, label: 'yarn build' },
      {
        file: 'yarn',
        args: ['test', '--no-watch', '--no-progress', '--browsers=ChromeHeadless'],
        cwd: root,
        shim: true,
        label: 'yarn test --no-watch --no-progress --browsers=ChromeHeadless',
      },
    ],
  };
}

/** Command that opens a text file in the OS editor. */
export function editorCommand(file, platform = process.platform) {
  if (platform === 'win32') return [systemTool('notepad.exe'), [file]];
  if (platform === 'darwin') return ['open', ['-t', file]];
  return ['xdg-open', [file]];
}

/** Command that opens a folder in the OS file manager. */
export function folderCommand(dir, platform = process.platform) {
  if (platform === 'win32') return [systemTool('explorer.exe'), [dir]];
  if (platform === 'darwin') return ['open', [dir]];
  return ['xdg-open', [dir]];
}

// ---------------------------------------------------------------------------
// The console server
// ---------------------------------------------------------------------------

/** A refused action: 409 when a precondition fails, 400 for a bad request. */
class ActionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Build the console server (not yet listening; call `server.listen(port, '127.0.0.1')`).
 *
 * Options: `root` (repository), `port` (the one it will listen on; an ephemeral
 * port is read back from the server), `spawnStack(mode, { root })` (returns the
 * stack child process). The rest exist for tests and for main(): `launch`,
 * `probePort`, `probeTools`, `jobSteps`, `stopTimeoutMs`, `idleExitMs` (0 = never),
 * `onExit(reason)` (called after `quit` or an idle exit, once everything is
 * closed), `report(text)` (receives the console's own log lines).
 *
 * Returns `{ server, token, close(), log(text), state() }`.
 */
export function createConsoleServer(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const requestedPort = options.port ?? DEFAULT_PORT;
  const spawnStack = options.spawnStack ?? defaultSpawnStack;
  const launch = options.launch ?? launchDetached;
  const probe = options.probePort ?? probePort;
  const stopTimeoutMs = options.stopTimeoutMs ?? STOP_TIMEOUT_MS;
  const idleExitMs = options.idleExitMs ?? 0;
  const onExit = options.onExit ?? (() => {});
  const report = options.report ?? (() => {});
  const steps = (options.jobSteps ?? defaultJobSteps)(root);

  const functionsDir = path.join(root, 'functions');
  const files = {
    page: path.join(root, 'scripts', 'console', 'console.html'),
    icons: [path.join(root, 'scripts', 'console', 'omnitask-console.ico'), path.join(root, 'public', 'logo.ico')],
    localDev: path.join(root, 'scripts', 'local-dev.mjs'),
    secret: path.join(functionsDir, '.secret.local'),
    secretExample: path.join(functionsDir, '.secret.local.example'),
    envLocal: path.join(functionsDir, '.env.local'),
    smokeScript: path.join(functionsDir, 'scripts', 'ai-smoke.mjs'),
  };

  const token = randomBytes(24).toString('hex');
  const startedAt = new Date().toISOString();
  const version = readVersion(root);
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      note(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
      if (res.headersSent) res.destroy();
      else sendJson(res, 500, { ok: false, error: 'The console hit an internal error. See its log.' });
    });
  });
  // A request has no business taking longer than this; frees sockets held open by a stalled client.
  server.requestTimeout = 30_000;
  server.on('clientError', (err, socket) => {
    if (!socket.writable) return;
    socket.end(
      'HTTP/1.1 400 Bad Request\r\nConnection: close\r\nCache-Control: no-store\r\n' +
        'X-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nReferrer-Policy: no-referrer\r\n' +
        'Cross-Origin-Resource-Policy: same-origin\r\nContent-Length: 0\r\n\r\n',
    );
  });

  const currentPort = () => {
    const address = server.address();
    return address && typeof address === 'object' ? address.port : requestedPort;
  };
  const guard = createGuard({ port: currentPort, token });

  // ---- log ring buffer ----------------------------------------------------
  const logLines = [];
  let logSeq = 0;
  /** The key in functions/.secret.local, redacted by value as well as by pattern. */
  const knownSecrets = new Set();

  function rememberSecret(secretText) {
    const key = envValue(secretText, 'ANTHROPIC_API_KEY');
    if (key && key !== 'placeholder' && key.length >= 8) knownSecrets.add(key);
    return key;
  }

  function addLog(src, raw) {
    // Escape codes first (they can sit inside a key), then other control characters.
    let text = stripAnsi(raw).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
    for (const secret of knownSecrets) text = text.split(secret).join(KEY_REDACTED);
    text = redact(text);
    if (text.length > LOG_LINE_MAX) text = `${text.slice(0, LOG_LINE_MAX - 1)}\u2026`;
    logLines.push({ seq: ++logSeq, t: new Date().toISOString(), src, text });
    if (logLines.length > LOG_CAPACITY) logLines.shift();
    return text;
  }

  /** A line from a child process: keep what a terminal would show after carriage returns. */
  function addOutput(src, raw) {
    let line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const cr = line.lastIndexOf('\r');
    if (cr !== -1) line = line.slice(cr + 1);
    return addLog(src, line);
  }

  /** A line from the console itself. */
  function note(text) {
    report(addLog('console', text));
  }

  function readLog(after) {
    const first = logLines.length ? logLines[0].seq : logSeq + 1;
    const from = Math.max(after + 1, first);
    const lines = logLines.slice(from - first, from - first + LOG_PAGE_MAX);
    return {
      lines,
      next: lines.length ? lines.at(-1).seq : Math.min(after, logSeq),
      dropped: after + 1 < first,
    };
  }

  // ---- state ----------------------------------------------------------------
  const toolsPromise = Promise.resolve()
    .then(options.probeTools ?? probeTools)
    .catch(() => ({ node: process.version, java: null, yarn: null }));

  let portsCache = null;
  function getPorts() {
    if (portsCache && Date.now() - portsCache.at < 1000) return portsCache.promise;
    const promise = Promise.all(
      STACK_PORTS.map(async ({ port, name }) => ({ port, name, open: Boolean(await probe(port)) })),
    );
    portsCache = { at: Date.now(), promise };
    return promise;
  }

  let gitCache = null;
  function getGit() {
    if (gitCache && Date.now() - gitCache.at < 5000) return gitCache.promise;
    gitCache = { at: Date.now(), promise: readGit() };
    return gitCache.promise;
  }

  async function readGit() {
    // No optional locks: this runs every few seconds and must not get in the
    // way of a git command the owner is running in the same folder.
    const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
    const git = async (args) => {
      const result = await capture('git', args, { cwd: root, env, timeoutMs: 3000 });
      return result.code === 0 ? result.stdout.trim() : null;
    };
    // Never fetches: behind/ahead compare against what the last fetch or pull saw.
    const [branch, head, status, upstream, counts] = await Promise.all([
      git(['rev-parse', '--abbrev-ref', 'HEAD']),
      git(['rev-parse', '--short', 'HEAD']),
      git(['status', '--porcelain']),
      git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
      git(['rev-list', '--left-right', '--count', '@{u}...HEAD']),
    ]);
    const pair = counts ? /^(\d+)\s+(\d+)$/.exec(counts) : null;
    return {
      branch,
      head,
      dirty: status === null ? null : status.split('\n').filter(Boolean).length,
      upstream,
      behind: pair ? Number(pair[1]) : null,
      ahead: pair ? Number(pair[2]) : null,
    };
  }

  const stack = { child: null, state: 'stopped', mode: null, since: null, lastExit: null, killTimer: null, exited: null };
  let job = null;
  let jobChild = null;
  let jobSeq = 0;
  const jobRunning = () => job !== null && job.state === 'running';

  async function buildState() {
    const [ports, git, tools] = await Promise.all([getPorts(), getGit(), toolsPromise]);
    const secretText = readText(files.secret);
    rememberSecret(secretText);
    const functionsModules = path.join(functionsDir, 'node_modules');
    const external = ports.some((p) => (p.name === 'hub' || p.name === 'app') && p.open);
    return {
      console: { version, pid: process.pid, port: currentPort(), platform: process.platform, repo: root, startedAt },
      git,
      tools,
      setup: {
        rootDeps: fs.existsSync(path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js')),
        // The same three things the preflight in scripts/local-dev.mjs looks for.
        functionsDeps:
          fs.existsSync(path.join(functionsModules, '.bin', 'firebase-functions')) &&
          fs.existsSync(path.join(functionsModules, '@anthropic-ai', 'sdk')) &&
          fs.existsSync(path.join(functionsModules, 'typescript', 'bin', 'tsc')),
        functionsBuilt: fs.existsSync(path.join(functionsDir, 'lib', 'index.js')),
        secretFile: parseSecretState(secretText),
        hasLocalDev: fs.existsSync(files.localDev),
        env: parseEnvLocal(readText(files.envLocal)),
        savedData: fs.existsSync(path.join(root, '.emulator-data')),
      },
      stack: stack.child
        ? { state: stack.state, mode: stack.mode, pid: stack.child.pid ?? null, since: stack.since, lastExit: stack.lastExit }
        : { state: external ? 'external' : 'stopped', mode: null, pid: null, since: null, lastExit: stack.lastExit },
      ports,
      job: job ? { ...job } : null,
      logSeq,
    };
  }

  // ---- the stack child ------------------------------------------------------
  function defaultSpawnStack(mode) {
    return spawn(process.execPath, [files.localDev, ...(mode === 'emulators' ? ['--emulators-only'] : [])], {
      cwd: root,
      // The fourth entry is the IPC channel the stop request travels on.
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true,
      // Own process group on POSIX, so the fallback kill reaches the whole group.
      detached: !IS_WINDOWS,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    });
  }

  function startStack(mode) {
    let child;
    try {
      child = spawnStack(mode, { root });
    } catch (err) {
      throw new ActionError(409, `Could not start the stack: ${err instanceof Error ? err.message : String(err)}`);
    }
    stack.child = child;
    stack.state = 'starting';
    stack.mode = mode;
    stack.since = new Date().toISOString();
    let resolveExit;
    stack.exited = new Promise((resolve) => {
      resolveExit = resolve;
    });
    note(mode === 'emulators' ? 'Starting the emulators...' : 'Starting the local stack...');

    const onLine = (raw) => {
      const text = addOutput('stack', raw);
      if (stack.child === child && stack.state === 'starting' && text.includes(UP_MARKERS[mode])) {
        stack.state = 'running';
      }
    };
    pipeLines(child.stdout, onLine);
    pipeLines(child.stderr, onLine);

    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(stack.killTimer);
      stack.killTimer = null;
      stack.lastExit = { code: code ?? null, at: new Date().toISOString() };
      stack.child = null;
      stack.state = 'stopped';
      stack.mode = null;
      stack.since = null;
      portsCache = null;
      note(code === 0 ? 'The stack has stopped.' : `The stack exited (${code === null ? 'it was ended' : `code ${code}`}).`);
      resolveExit();
    };
    child.on('error', (err) => {
      // Also raised when a message cannot be delivered; only a failed launch means there is no process.
      if (child.pid === undefined) {
        note(`Could not run the stack: ${err.message}`);
        finish(null);
      }
    });
    child.once('exit', (code) => finish(code));
  }

  /**
   * Ask the stack to shut down over IPC (scripts/local-dev.mjs then exports the
   * emulator data and ends its own children). Signals are not used: Windows
   * has none worth the name. If it is still alive after the timeout its whole
   * process tree is ended.
   */
  function requestStop() {
    const child = stack.child;
    if (!child || stack.state === 'stopping') return;
    stack.state = 'stopping';
    note('Stopping the stack (the emulators save their data first)...');
    try {
      if (typeof child.send === 'function' && child.connected) child.send({ type: 'shutdown' }, () => {});
    } catch {
      // The channel is already closed; local-dev.mjs shuts down on disconnect as well.
    }
    stack.killTimer = setTimeout(() => {
      if (stack.child !== child) return;
      note(`The stack did not stop within ${Math.round(stopTimeoutMs / 1000)} s; ending its process tree.`);
      killTree(child);
    }, stopTimeoutMs);
  }

  async function stopStackAndWait() {
    if (!stack.child) return;
    requestStop();
    // The kill fallback normally ends the wait; the extra timer is for a kill that itself fails.
    let giveUp;
    const limit = new Promise((resolve) => {
      giveUp = setTimeout(resolve, stopTimeoutMs + 10_000);
    });
    await Promise.race([stack.exited, limit]);
    clearTimeout(giveUp);
  }

  // ---- jobs -----------------------------------------------------------------
  function runStep(step) {
    return new Promise((resolve) => {
      const [file, argv, shellOpt] = step.shim ? spawnArgs(step.file, step.args) : [step.file, step.args, { shell: false }];
      let child;
      try {
        child = spawn(file, argv, {
          cwd: step.cwd,
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...step.env },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          detached: !IS_WINDOWS,
          ...shellOpt,
        });
      } catch (err) {
        addLog('job', `Could not start ${step.file}: ${err instanceof Error ? err.message : String(err)}`);
        resolve(null);
        return;
      }
      jobChild = child;
      pipeLines(child.stdout, (line) => addOutput('job', line));
      pipeLines(child.stderr, (line) => addOutput('job', line));
      let done = false;
      let grace = null;
      const finish = (code) => {
        if (done) return;
        done = true;
        clearTimeout(grace);
        if (jobChild === child) jobChild = null;
        resolve(code);
      };
      child.on('error', (err) => {
        if (child.pid !== undefined) return;
        addLog('job', `Could not start ${step.file}: ${err.message}`);
        finish(null);
      });
      // Normally "close" follows at once with the last output. A grandchild
      // that keeps the pipe open must not hold the job forever, hence the timer.
      child.once('exit', (code) => {
        grace = setTimeout(() => finish(code), 2000);
      });
      child.once('close', (code) => finish(code));
    });
  }

  function startJob(action, jobStepList) {
    const current = { id: ++jobSeq, action, state: 'running', exitCode: null, startedAt: new Date().toISOString(), endedAt: null };
    job = current;
    (async () => {
      let code = 0;
      for (const step of jobStepList) {
        if (closing) {
          code = null; // the console is shutting down: do not start the next step
          break;
        }
        addLog('job', `$ ${step.label}`);
        code = await runStep(step);
        if (code !== 0) break; // stop at the first failure
      }
      current.exitCode = code;
      current.state = code === 0 ? 'ok' : 'failed';
      current.endedAt = new Date().toISOString();
      gitCache = null; // a pull or an install changes what the header shows
      note(code === 0 ? `${action}: finished.` : `${action}: failed${code === null ? '' : ` (exit code ${code})`}.`);
    })();
  }

  // ---- actions --------------------------------------------------------------
  const requireNoJob = () => {
    if (jobRunning()) throw new ActionError(409, `Wait for the running job (${job.action}) to finish first.`);
  };
  const requireStackStopped = (state) => {
    if (state.stack.state === 'external') {
      throw new ActionError(409, 'A stack this console did not start is running (port 4400 or 4200 is in use). Stop it where it was started first.');
    }
    if (state.stack.state !== 'stopped') throw new ActionError(409, 'Stop the stack first.');
  };

  async function openFile(file, label) {
    const [command, args] = editorCommand(file);
    if (!(await launch(command, args))) {
      throw new ActionError(409, `Could not open a text editor. Open ${label} yourself: ${file}`);
    }
    note(`Opened ${label} in the text editor.`);
  }

  /** The allowlist. A request picks one of these names; it never supplies a command. */
  const actions = new Map([
    [
      'start',
      (body, state) => {
        if (body.mode !== 'full' && body.mode !== 'emulators') throw new ActionError(400, 'mode must be "full" or "emulators".');
        requireStackStopped(state);
        if (!state.setup.hasLocalDev) {
          throw new ActionError(409, 'scripts/local-dev.mjs is not on this branch, so there is no local stack to start here.');
        }
        requireNoJob();
        startStack(body.mode);
      },
    ],
    [
      'stop',
      () => {
        if (!stack.child || (stack.state !== 'starting' && stack.state !== 'running')) {
          throw new ActionError(409, stack.state === 'stopping' ? 'The stack is already stopping.' : 'The stack is not running.');
        }
        requestStop();
      },
    ],
    [
      'pull',
      (body, state) => {
        requireStackStopped(state);
        requireNoJob();
        startJob('pull', steps.pull);
      },
    ],
    [
      'install',
      (body, state) => {
        requireStackStopped(state);
        requireNoJob();
        startJob('install', steps.install);
      },
    ],
    [
      'smoke',
      (body, state) => {
        if (state.setup.secretFile !== 'set') {
          throw new ActionError(409, 'Add your ANTHROPIC_API_KEY to functions/.secret.local first.');
        }
        if (!state.setup.functionsBuilt) {
          throw new ActionError(409, 'The Cloud Functions are not built yet. Start the stack once, or run the checks.');
        }
        if (!fs.existsSync(files.smokeScript)) {
          throw new ActionError(409, 'functions/scripts/ai-smoke.mjs is not on this branch.');
        }
        requireNoJob();
        // The key goes to the child through its environment only: never on a
        // command line, never into the log (see rememberSecret and addLog).
        const key = rememberSecret(readText(files.secret));
        if (!key) throw new ActionError(409, 'Add your ANTHROPIC_API_KEY to functions/.secret.local first.');
        const env = { ANTHROPIC_API_KEY: key };
        const model = envValue(readText(files.envLocal), 'ANTHROPIC_MODEL');
        if (model) env.ANTHROPIC_MODEL = model;
        startJob('smoke', steps.smoke.map((step) => ({ ...step, env: { ...step.env, ...env } })));
      },
    ],
    [
      'checks',
      () => {
        requireNoJob();
        startJob('checks', steps.checks);
      },
    ],
    [
      'open-key',
      async () => {
        if (!fs.existsSync(files.secret)) {
          try {
            fs.copyFileSync(files.secretExample, files.secret, fs.constants.COPYFILE_EXCL);
          } catch {
            throw new ActionError(409, 'functions/.secret.local.example is missing, so the key file could not be created.');
          }
          note('Created functions/.secret.local from the example.');
        }
        await openFile(files.secret, 'functions/.secret.local');
      },
    ],
    [
      'open-env',
      async () => {
        if (!fs.existsSync(files.envLocal)) {
          try {
            fs.writeFileSync(files.envLocal, '', { flag: 'wx' });
          } catch {
            throw new ActionError(409, 'functions/.env.local could not be created.');
          }
        }
        await openFile(files.envLocal, 'functions/.env.local');
      },
    ],
    [
      'set-env',
      (body) => {
        if (body.model !== undefined && (typeof body.model !== 'string' || !MODEL_PATTERN.test(body.model))) {
          throw new ActionError(400, 'model must look like claude-opus-5-5.');
        }
        if (body.realmail !== undefined && typeof body.realmail !== 'boolean') {
          throw new ActionError(400, 'realmail must be true or false.');
        }
        if (body.model === undefined && body.realmail === undefined) {
          throw new ActionError(400, 'Give a model, realmail, or both.');
        }
        const before = readText(files.envLocal);
        const current = parseEnvLocal(before);
        // A setting that was not sent keeps its current value.
        const next = rewriteEnvLocal(before, {
          model: body.model ?? current.model,
          realmail: body.realmail ?? current.realmail,
        });
        try {
          if (next === null) fs.rmSync(files.envLocal, { force: true });
          else fs.writeFileSync(files.envLocal, next);
        } catch {
          throw new ActionError(409, 'functions/.env.local could not be written.');
        }
        note('Saved the overrides in functions/.env.local.');
      },
    ],
    [
      'reset-data',
      async (body, state) => {
        if (body.confirm !== true) throw new ActionError(400, 'confirm must be true to delete the saved emulator data.');
        requireStackStopped(state);
        const target = resolveInside(root, '.emulator-data');
        if (target === null) {
          throw new ActionError(409, '.emulator-data is a link, not a folder of this repository, so nothing was deleted.');
        }
        try {
          await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 3 });
        } catch (err) {
          throw new ActionError(409, `Could not delete .emulator-data: ${err instanceof Error ? err.message : String(err)}`);
        }
        note('Deleted the saved emulator data (.emulator-data).');
      },
    ],
    [
      'open-folder',
      async () => {
        const [command, args] = folderCommand(root);
        if (!(await launch(command, args))) throw new ActionError(409, `Could not open the file manager. The folder is ${root}`);
      },
    ],
    [
      'quit',
      async () => {
        await stopStackAndWait();
        return { quit: true };
      },
    ],
  ]);

  // One action at a time: two clicks in quick succession must not both pass the same precondition.
  let actionChain = Promise.resolve();
  function runAction(body) {
    const run = actionChain.then(async () => {
      const handler = typeof body.action === 'string' ? actions.get(body.action) : undefined;
      if (!handler) throw new ActionError(400, 'Unknown action.');
      const result = await handler(body, await buildState());
      portsCache = null;
      return result ?? {};
    });
    actionChain = run.catch(() => {});
    return run;
  }

  // ---- HTTP -----------------------------------------------------------------
  function sendBody(res, status, type, body, extra = {}) {
    res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), ...extra });
    res.end(body);
  }
  function sendJson(res, status, payload, extra) {
    sendBody(res, status, 'application/json; charset=utf-8', JSON.stringify(payload), extra);
  }
  const methodNotAllowed = (res, allow) => sendJson(res, 405, { ok: false, error: `Use ${allow} here.` }, { Allow: allow });

  let lastApiRequest = Date.now();

  async function handle(req, res) {
    // On every response. No Access-Control-* header is ever added.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    let body = null;
    let denied = guard.check(req);
    if (!denied && req.method === 'POST') {
      const read = await guard.readJson(req);
      if (read.value === undefined) denied = read;
      else body = read.value;
    }
    if (denied) {
      // A refused request may still have an unread body on the wire: do not reuse the connection.
      sendJson(res, denied.status, { ok: false, error: denied.error }, { Connection: 'close' });
      return;
    }

    // Routes match the raw path exactly. Nothing from the URL ever becomes a file path.
    const url = typeof req.url === 'string' ? req.url : '';
    const mark = url.indexOf('?');
    const pathname = mark === -1 ? url : url.slice(0, mark);
    const isGet = req.method === 'GET';
    if (pathname.startsWith('/api/') && pathname !== '/api/ping') lastApiRequest = Date.now();

    if (pathname === '/') {
      if (!isGet) return methodNotAllowed(res, 'GET');
      let page;
      try {
        page = await fs.promises.readFile(files.page, 'utf8');
      } catch {
        sendBody(
          res,
          500,
          'text/plain; charset=utf-8',
          `OmniTask Build Console\n\nThe page file is missing: scripts/console/console.html\n(looked for ${files.page})\n\n` +
            'Check out a branch that has it, then reload this window.\n',
        );
        return;
      }
      const html = wrapPage(page, { token, version, platform: process.platform, repo: root, port: currentPort() });
      sendBody(res, 200, 'text/html; charset=utf-8', html, { 'Content-Security-Policy': PAGE_CSP });
      return;
    }

    if (pathname === '/favicon.ico') {
      if (!isGet) return methodNotAllowed(res, 'GET');
      for (const icon of files.icons) {
        let bytes;
        try {
          bytes = await fs.promises.readFile(icon);
        } catch {
          continue;
        }
        res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Content-Length': bytes.length });
        res.end(bytes);
        return;
      }
      sendJson(res, 404, { ok: false, error: 'Not found.' });
      return;
    }

    if (pathname === '/api/ping') {
      if (!isGet) return methodNotAllowed(res, 'GET');
      sendJson(res, 200, { app: APP_ID, version });
      return;
    }

    if (pathname === '/api/state') {
      if (!isGet) return methodNotAllowed(res, 'GET');
      sendJson(res, 200, await buildState());
      return;
    }

    if (pathname === '/api/log') {
      if (!isGet) return methodNotAllowed(res, 'GET');
      const raw = new URLSearchParams(mark === -1 ? '' : url.slice(mark + 1)).get('after') ?? '0';
      if (!/^\d{1,15}$/.test(raw)) {
        sendJson(res, 400, { ok: false, error: 'after must be a whole number.' });
        return;
      }
      sendJson(res, 200, readLog(Number(raw)));
      return;
    }

    if (pathname === '/api/action') {
      if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
      let result;
      try {
        result = await runAction(body);
      } catch (err) {
        if (!(err instanceof ActionError)) throw err;
        sendJson(res, err.status, { ok: false, error: err.message });
        return;
      }
      const payload = JSON.stringify({ ok: true, state: await buildState() });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
      // "quit" answers first and exits once the answer is on its way.
      res.end(payload, result.quit ? () => exit('quit') : undefined);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found.' });
  }

  // ---- lifetime -------------------------------------------------------------
  let closing = null;

  /** Stop the stack gracefully, end a running job, then stop listening. */
  function close() {
    if (closing) return closing;
    closing = (async () => {
      clearInterval(idleTimer);
      killTree(jobChild);
      await stopStackAndWait();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    })();
    return closing;
  }

  let exiting = false;
  function exit(reason) {
    if (exiting) return;
    exiting = true;
    close().then(
      () => onExit(reason),
      () => onExit(reason),
    );
  }

  // Closing the window must not leave a stray process: with nobody polling the
  // API, nothing running and no job, the console ends itself. A running stack
  // is never stopped this way.
  const idleTickMs = Math.max(50, Math.min(5000, Math.floor(idleExitMs / 4)));
  let lastIdleTick = Date.now();
  const idleTimer = idleExitMs
    ? setInterval(() => {
        const now = Date.now();
        // A tick that arrives far too late means the laptop was asleep. The page
        // was asleep too, so give it a fresh window to start polling again.
        if (now - lastIdleTick > idleTickMs * 3 + 5000) lastApiRequest = now;
        lastIdleTick = now;
        if (!stack.child && !jobRunning() && now - lastApiRequest >= idleExitMs) {
          note('Nobody has used the console for a while and nothing is running: exiting.');
          exit('idle');
        }
      }, idleTickMs)
    : null;

  return { server, token, close, log: note, state: buildState };
}

function readVersion(root) {
  try {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    return typeof version === 'string' ? version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ---------------------------------------------------------------------------
// Opening the browser
// ---------------------------------------------------------------------------

/** The value on a `reg query` output line, e.g. "    ProgId    REG_SZ    ChromeHTML". */
export function parseRegValue(stdout) {
  const match = /^\s+.*?\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(String(stdout ?? ''));
  return match ? match[1].replace(/^"(.*)"$/, '$1') : null;
}

/** 'chrome' or 'edge' for the ProgId Windows stores as the https handler, else null. */
export function browserKindFromProgId(progId) {
  if (/^Chrome.*HTM/i.test(String(progId ?? ''))) return 'chrome';
  if (/^MSEdge/i.test(String(progId ?? ''))) return 'edge';
  return null;
}

/** Where chrome.exe / msedge.exe can be: registered App Paths first, then the standard install folders. */
export function windowsBrowserCandidates(kind, env, registered = []) {
  const relative =
    kind === 'chrome' ? ['Google', 'Chrome', 'Application', 'chrome.exe'] : ['Microsoft', 'Edge', 'Application', 'msedge.exe'];
  const folders = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
  return [...registered.filter(Boolean), ...folders.map((folder) => path.win32.join(folder, ...relative))];
}

const APP_PATH_KEYS = [
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths',
];
const HTTPS_HANDLER_KEY = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https';

/** chrome.exe when Chrome is the default browser, else msedge.exe, else whichever of the two exists. */
async function findWindowsBrowser() {
  const reg = systemTool('reg.exe');
  const query = async (key, valueArgs) => {
    const result = await capture(reg, ['query', key, ...valueArgs], { timeoutMs: 3000 });
    return result.code === 0 ? parseRegValue(result.stdout) : null;
  };
  // UserChoice is where Windows keeps the default browser; newer builds may only have the "Latest" key.
  const progId =
    (await query(`${HTTPS_HANDLER_KEY}\\UserChoice`, ['/v', 'ProgId'])) ??
    (await query(`${HTTPS_HANDLER_KEY}\\UserChoiceLatest\\ProgId`, ['/v', 'ProgId']));
  const preferred = browserKindFromProgId(progId) ?? 'edge';
  for (const kind of preferred === 'chrome' ? ['chrome', 'edge'] : ['edge', 'chrome']) {
    const exeName = kind === 'chrome' ? 'chrome.exe' : 'msedge.exe';
    const registered = [];
    for (const key of APP_PATH_KEYS) registered.push(await query(`${key}\\${exeName}`, ['/ve']));
    const found = windowsBrowserCandidates(kind, process.env, registered).find(isFile);
    if (found) return found;
  }
  return null;
}

function findOnPath(name) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (isFile(candidate)) return candidate;
    } catch {
      // not here
    }
  }
  return null;
}

/** A chromeless window (`--app=`) in Chrome or Edge. False when neither could be started. */
async function openAppWindow(url) {
  const appArgs = [`--app=${url}`, '--window-size=1180,900'];
  if (IS_WINDOWS) {
    const exe = await findWindowsBrowser();
    return exe ? launchDetached(exe, appArgs) : false;
  }
  if (process.platform === 'darwin') {
    const result = await capture('open', ['-na', 'Google Chrome', '--args', ...appArgs], { timeoutMs: 10_000 });
    return result.code === 0;
  }
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const exe = findOnPath(name);
    if (exe && (await launchDetached(exe, appArgs))) return true;
  }
  return false;
}

function openDefaultBrowser(url) {
  // rundll32 hands the URL to the default handler without a console window or shell quoting.
  if (IS_WINDOWS) return launchDetached(systemTool('rundll32.exe'), ['url.dll,FileProtocolHandler', url]);
  return launchDetached(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
}

/** Open `url` as asked. Resolves to how it was opened: 'app', 'default', 'none' or 'failed'. */
export async function openBrowser(url, mode) {
  if (mode === 'none') return 'none';
  if (mode === 'app' && (await openAppWindow(url))) return 'app';
  return (await openDefaultBrowser(url)) ? 'default' : 'failed';
}

/** What the console on `port` says about itself, or null when nothing (or something else) answers there. */
export function pingConsole(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: timeoutMs }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (text.length < 4096) text += chunk;
      });
      res.on('end', () => {
        try {
          const body = JSON.parse(text);
          resolve(res.statusCode === 200 && body && body.app === APP_ID ? body : null);
        } catch {
          resolve(null);
        }
      });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const USAGE = `Usage: node scripts/launch-console.mjs [--port N] [--browser app|default|none] [--detach] [--no-idle-exit]

  --port N          port to listen on (default ${DEFAULT_PORT}, or OMNITASK_CONSOLE_PORT)
  --browser MODE    app = its own window in Chrome or Edge (default)
                    default = a tab in your default browser
                    none = only print the address
  --detach          start in the background and return at once
  --no-idle-exit    keep running when the window is closed and nothing is running`;

/** Parse the command line. Throws an Error with a message for the user on a bad flag. */
export function parseArgs(argv, env = process.env) {
  const opts = { port: DEFAULT_PORT, browser: 'app', detach: false, idleExit: true, help: false };
  const toPort = (text, source) => {
    const port = Number(text);
    if (!/^\d+$/.test(String(text)) || port < 1 || port > 65535) throw new Error(`${source} must be a port number (1-65535).`);
    return port;
  };
  if (env.OMNITASK_CONSOLE_PORT) opts.port = toPort(env.OMNITASK_CONSOLE_PORT, 'OMNITASK_CONSOLE_PORT');
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const value = () => {
      if (inline !== undefined) return inline;
      if (i + 1 >= argv.length) throw new Error(`${flag} needs a value.`);
      return argv[++i];
    };
    if (flag === '--port') opts.port = toPort(value(), '--port');
    else if (flag === '--browser') {
      opts.browser = value();
      if (!['app', 'default', 'none'].includes(opts.browser)) throw new Error('--browser must be app, default or none.');
    } else if (flag === '--detach') opts.detach = true;
    else if (flag === '--no-idle-exit') opts.idleExit = false;
    else if (flag === '--help' || flag === '-h') opts.help = true;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return opts;
}

const DIAG_FILE = path.join(os.tmpdir(), 'omnitask-console.log');
const DETACHED_ENV = 'OMNITASK_CONSOLE_DETACHED';

/**
 * Printing, in the style of scripts/local-dev.mjs. A detached console has no
 * terminal, so it also appends to a file in the temp folder; that is the only
 * place a startup problem behind the Desktop shortcut can be seen.
 */
function createReporter(detached) {
  if (detached) {
    try {
      if (fs.statSync(DIAG_FILE).size > 512 * 1024) fs.rmSync(DIAG_FILE, { force: true });
    } catch {
      // no file yet
    }
  }
  const toFile = (level, msg) => {
    if (!detached) return;
    try {
      fs.appendFileSync(DIAG_FILE, `${new Date().toISOString()} [${process.pid}] ${level} ${redact(msg)}\n`);
    } catch {
      // diagnostics must never take the console down
    }
  };
  return {
    log: (msg) => {
      console.log(`\x1b[36m[console]\x1b[0m ${msg}`);
      toFile('info', msg);
    },
    error: (msg) => {
      console.error(`\x1b[31m[console]\x1b[0m ${msg}`);
      toFile('error', msg);
    },
  };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  if (opts.detach) {
    // The shortcut's own process returns at once; the copy without a terminal does the work.
    const args = process.argv.slice(2).filter((arg) => arg !== '--detach');
    const child = spawn(process.execPath, [SELF, ...args], {
      cwd: DEFAULT_ROOT,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, [DETACHED_ENV]: '1' },
    });
    child.unref();
    process.exit(0);
  }

  const out = createReporter(process.env[DETACHED_ENV] === '1');
  const url = `http://127.0.0.1:${opts.port}/`;
  const showWindow = async () => {
    const how = await openBrowser(url, opts.browser);
    if (how === 'failed') out.error(`Could not open a browser. Open ${url} yourself.`);
    else if (how === 'default' && opts.browser === 'app') out.log('Chrome or Edge was not found; opened the default browser instead.');
  };

  const consoleServer = createConsoleServer({
    root: DEFAULT_ROOT,
    port: opts.port,
    idleExitMs: opts.idleExit ? IDLE_EXIT_MS : 0,
    report: (text) => out.log(text),
    onExit: () => process.exit(0),
  });

  consoleServer.server.once('error', async (err) => {
    if (err.code !== 'EADDRINUSE') {
      out.error(`Could not start the console on port ${opts.port}: ${err.message}`);
      process.exit(1);
    }
    // Single instance: if the port is held by a console, show that one instead.
    if (await pingConsole(opts.port)) {
      out.log(`The console is already running: ${url}`);
      await showWindow();
      process.exit(0);
    }
    out.error(
      `Port ${opts.port} is in use by another program, so the console cannot start.\n` +
        '  Close that program, or pick another port: node scripts/launch-console.mjs --port 4311',
    );
    process.exit(1);
  });

  consoleServer.server.listen(opts.port, '127.0.0.1', async () => {
    out.log(`OmniTask Build Console: ${url}`);
    out.log(`Serving ${DEFAULT_ROOT} (pid ${process.pid}). Ctrl+C stops the console and a stack it started.`);
    await showWindow();
  });

  let stopping = false;
  const stop = (why, exitCode = 0) => {
    if (stopping) {
      // Second Ctrl+C: leave now. The stack notices the closed channel and finishes shutting down itself.
      process.exit(1);
    }
    stopping = true;
    out.log(`${why}: stopping...`);
    consoleServer.close().then(
      () => process.exit(exitCode),
      () => process.exit(1),
    );
  };
  // SIGHUP is the terminal (on Windows, the console window) closing; SIGBREAK is Ctrl+Break.
  for (const signal of IS_WINDOWS ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] : ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => stop(signal));
  }
  process.on('uncaughtException', (err) => {
    out.error(`Unexpected error: ${err && err.stack ? err.stack : err}`);
    stop('error', 1);
  });
  process.on('unhandledRejection', (err) => {
    out.error(`Unexpected error: ${err && err.stack ? err.stack : err}`);
  });
}

function isEntryScript() {
  if (!process.argv[1]) return false;
  const normalise = (file) => {
    let resolved = path.resolve(file);
    try {
      resolved = fs.realpathSync(resolved);
    } catch {
      // compare the unresolved path
    }
    return IS_WINDOWS ? resolved.toLowerCase() : resolved;
  };
  return normalise(process.argv[1]) === normalise(SELF);
}

if (isEntryScript()) main();
