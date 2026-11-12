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
 * (see createGuard): loopback Host only, same-origin only, no navigation that
 * another site started, a per-run token on the API, JSON bodies only. Actions
 * are a fixed allowlist with fixed argument lists; nothing from a request is
 * ever put on a command line.
 *
 * The console itself never runs as administrator. The few actions that need
 * administrator rights (reserving ports, ending a program that runs elevated)
 * ask Windows for them at the moment their button is pressed: see runElevated.
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
/** Windows, second Ctrl+C: how long a stack that is already stopping gets before its process tree is ended. */
const HURRY_GRACE_MS = 5000;

/** The lines scripts/local-dev.mjs prints once everything answers. */
const UP_MARKERS = {
  full: 'OmniTask local stack is up.',
  emulators: 'Emulators are up.',
};

/**
 * Ports of the local stack, in the order /api/state lists them. The numbers
 * are what is used when firebase.json cannot be read or does not name one:
 * the Firebase defaults (the hub is not in firebase.json at all) plus ng serve.
 */
const STACK_PORTS = [
  { port: 4200, name: 'app' },
  { port: 9099, name: 'auth' },
  { port: 8080, name: 'firestore' },
  { port: 9199, name: 'storage' },
  { port: 5001, name: 'functions' },
  { port: 4000, name: 'ui' },
  { port: 4400, name: 'hub' },
];

/**
 * Written by scripts/local-dev.mjs when it starts and deleted when it exits:
 * the ports the stack really uses. Windows reserves blocks of ports that
 * change with every boot, and the stack then moves to the next free one.
 */
const PORTS_FILE = '.local-dev-ports.json';
/** The real file is about 120 bytes; a larger one is not that file and is not read. */
const PORTS_FILE_LIMIT = 4 * 1024;
const FIREBASE_JSON_LIMIT = 256 * 1024;
/** How long the defaults read from firebase.json are kept; the file only changes with a pull or an edit. */
const DEFAULT_PORTS_TTL_MS = 5000;

/** The Angular configuration and file scripts/local-dev.mjs generates when emulator ports had to move. */
const REMAPPED_CONFIGURATION = 'local-remapped';
const REMAPPED_ENVIRONMENT = 'src/environments/environment.local-remapped.ts';
/** The ports the web app connects to (the `client` ports of scripts/local-dev.mjs). */
const CLIENT_PORT_NAMES = ['auth', 'firestore', 'functions', 'storage'];

/** The production commands. Constants: a request can pick one of them, never change one. */
const FIREBASE_TOOLS = 'firebase-tools@15';
const PROD_PROJECT = 'omnitask-475422';
/** The callable functions `prod-logs` can show (functions/src/index.ts). */
export const PROD_FUNCTIONS = ['generateSubtasks', 'suggestTaskPriority', 'suggestDueDate', 'enhanceTaskDescription'];

/** Exit code the helper PowerShell reports when the UAC prompt was declined: ERROR_CANCELLED. */
const UAC_DECLINED = 1223;
/** Last line the elevated script writes to its result file: its own exit code. */
const ELEVATED_EXIT_MARK = /^::exit::(\d{1,10})$/;
const ELEVATED_RESULT_LIMIT = 64 * 1024;
/** An unanswered UAC prompt gives up by itself after two minutes; the work behind it takes seconds. */
const ELEVATION_TIMEOUT_MS = 5 * 60_000;
/** Never ended by port-free: the idle process, init, and the Windows System process (PID 4 owns http.sys ports). */
const UNTOUCHABLE_PIDS = [0, 1, 4];
const DECLINED_TEXT = 'Windows did not get permission; nothing was changed.';
/** Ports below this are the system's: port-free never touches them. */
const FIRST_FREEABLE_PORT = 1024;
/** Windows system programs port-free never ends, nor asks for administrator rights to end. Lower case, without ".exe". */
const WINDOWS_SYSTEM_PROCESSES = ['svchost', 'lsass', 'wininit', 'services', 'csrss', 'smss', 'system', 'registry'];
const isWindowsSystemProcess = (name) => WINDOWS_SYSTEM_PROCESSES.includes(String(name ?? '').trim().toLowerCase().replace(/\.exe$/, ''));
/** taskkill's exit codes: 1 is "access denied", 128 is "no such process". */
const TASKKILL_ACCESS_DENIED = 1;
const TASKKILL_NO_SUCH_PROCESS = 128;
/** Spoken where no prompt or window may be in front: Windows lets a background program only flash the taskbar. */
const TASKBAR_PROMPT_HINT = 'If no prompt appears, click the flashing shield button on the taskbar.';
const TASKBAR_WINDOW_HINT = 'If the window is not in front, look for it on the taskbar.';
/** Typed into the window itself before a production deploy; no request can type it. */
const DEPLOY_CONFIRM_WORD = 'DEPLOY';
const DEPLOY_PROMPT = `Type ${DEPLOY_CONFIRM_WORD} to deploy to PRODUCTION`;
/** A second deploy window within this time of the first is refused. */
const DEPLOY_COOLDOWN_MS = 10_000;
/** How long a terminal helper may take to exit, and how long its pipes may stay open after that. */
const TERMINAL_HELPER_TIMEOUT_MS = 20_000;
const TERMINAL_HELPER_GRACE_MS = 1500;

const PAGE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; base-uri 'none'; " +
  "form-action 'none'; frame-ancestors 'none'";

/** Sent in place of the page when another site linked or navigated here (see createGuard). Carries no token. */
const CROSS_SITE_NOTICE =
  'OmniTask Build Console\n\n' +
  'This window was opened by a link on another page, so the console did not load.\n\n' +
  'Open the console from its Desktop or Start menu shortcut (or run: yarn console).\n' +
  'Or click the address bar and press Enter.\n';

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

const isPortNumber = (value) => Number.isInteger(value) && value >= 1 && value <= 65535;

/**
 * The default port of each part of the stack, by name, given the text of
 * firebase.json (null when it could not be read): `emulators.<name>.port`
 * where that is a port number, otherwise the literal in STACK_PORTS. The app
 * is not an emulator, so its default is always the literal.
 */
export function defaultStackPorts(firebaseJsonText) {
  let emulators = null;
  try {
    // Editors on Windows may put a byte order mark first, which JSON.parse does not accept.
    emulators = JSON.parse(String(firebaseJsonText ?? '').replace(/^\uFEFF/, ''))?.emulators;
  } catch {
    // unreadable or not JSON: the literals stand
  }
  const ports = {};
  for (const { name, port } of STACK_PORTS) {
    const configured = name === 'app' ? undefined : emulators?.[name]?.port;
    ports[name] = isPortNumber(configured) ? configured : port;
  }
  return ports;
}

/**
 * The ports in the text of .local-dev-ports.json, by name, or null when the
 * text is not exactly what scripts/local-dev.mjs writes: a JSON object with a
 * whole number from 1 to 65535 for each of the seven names. One bad value
 * discards the file as a whole; a half-believed file would show a mix of
 * ports that no stack is using. Other keys ("remapped") are not looked at.
 *
 * Anybody who can write to the folder can write this file, so the result is
 * only ever a set of numbers. Each is probed on loopback and shown to the
 * page; the app's number is given to `ng serve --port` as digits; and
 * port-free ends what listens on the one the owner picks by name. So a
 * forged file can at most point those buttons at another port, whose holder
 * the log names. Whoever can write here can already change the scripts this
 * console runs, so that is no new reach.
 */
export function parsePortsFile(text) {
  if (typeof text !== 'string') return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null; // also a file caught half-written: the next poll reads it whole
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const ports = {};
  for (const { name } of STACK_PORTS) {
    if (!Object.hasOwn(value, name) || !isPortNumber(value[name])) return null;
    ports[name] = value[name];
  }
  return ports;
}

/**
 * True when the ports file names the process that wrote it and that process
 * is gone: the stack was killed before it could delete the file, so its
 * numbers describe nothing that is running.
 */
export function portsFileIsStale(text, isAlive = pidAlive) {
  try {
    const pid = JSON.parse(text)?.pid;
    return Number.isInteger(pid) && pid > 0 && !isAlive(pid);
  } catch {
    return false; // unreadable: parsePortsFile rejects it anyway
  }
}

/**
 * True when the ports file names a process that is running. port-free ends
 * what listens on a port, so it believes only a file written by a live stack
 * (local-dev.mjs writes its pid); a committed or dropped file has none.
 */
export function portsFileHasLivePid(text, isAlive = pidAlive) {
  try {
    const pid = JSON.parse(text)?.pid;
    return Number.isInteger(pid) && pid > 0 && Boolean(isAlive(pid));
  } catch {
    return false;
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists, owned by someone else
  }
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
 *   3. Sec-Fetch-Site, when the browser sends it, must be `same-origin` or
 *      `none` (the shortcut's window, a typed address, a reload of those).
 *      A link or a script on another site, even one on another loopback port,
 *      gets neither the page nor the API. /api/ping and /favicon.ico are
 *      exempt. For the page the refusal carries `notice: true`, so the person
 *      who followed such a link is told what to do instead of shown JSON.
 *   4. /api/* except /api/ping needs the per-run token in X-Console-Token. A
 *      custom header also forces a CORS preflight, which is never approved.
 *   5. POST bodies must be application/json (not one of the content types a
 *      plain HTML form can send), at most 16 KiB, and a JSON object.
 *   6. Only GET and POST. No CORS headers are ever sent.
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
    const isApi = pathname.startsWith('/api/');
    if (pathname !== '/api/ping' && pathname !== '/favicon.ico') {
      // Browsers label where a request came from. The page only ever calls the
      // API from its own origin, and the page itself is opened by the shortcut
      // or from the address bar, never by a link on another site: served to
      // such a link, the live console could be put under somebody's cursor.
      const site = headers['sec-fetch-site'];
      if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        return isApi
          ? { status: 403, error: 'Requests from other sites are not accepted.' }
          : { status: 403, error: 'The console does not open from a link on another page.', notice: true };
      }
    }
    if (isApi && pathname !== '/api/ping' && !tokenMatches(headers['x-console-token'])) {
      return { status: 401, error: 'Missing or wrong console token. Reload the console window.' };
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
  for (const candidate of [
    path.join(winDir, 'System32', name),
    // Windows PowerShell 5.1 ships here on every Windows 10 and 11.
    path.join(winDir, 'System32', 'WindowsPowerShell', 'v1.0', name),
    path.join(winDir, name),
  ]) {
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

/**
 * First runnable file called `name` (plus one of `extensions`) in the folders
 * of a PATH value, or null. Only absolute folders count: "." or an empty entry
 * means the working directory, which is the repository.
 */
export function findOnPath(name, { pathValue = process.env.PATH ?? '', extensions = [''] } = {}) {
  for (const entry of pathValue.split(path.delimiter)) {
    const dir = entry.replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(dir)) continue;
    for (const extension of extensions) {
      const candidate = path.join(dir, name + extension);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (isFile(candidate)) return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

const pathTools = new Map();

/**
 * git and java do not ship with Windows, so there is no fixed folder for
 * them as there is for systemTool(). They are looked up once, on PATH only
 * (.com before .exe in each folder, as Node does on Windows), and run
 * by full path from then on, so a git.exe that a pull drops into the
 * repository is never the one that runs. Falls back to the bare name when
 * PATH has none; elsewhere than Windows a bare name is already PATH-only.
 */
function pathTool(name) {
  if (!IS_WINDOWS) return name;
  if (!pathTools.has(name)) pathTools.set(name, findOnPath(name, { extensions: ['.com', '.exe'] }) ?? name);
  return pathTools.get(name);
}

/**
 * Environment for a child whose output goes to the log: no colour codes.
 * FORCE_COLOR=0 does that for Node and the tools built on it. NO_COLOR is
 * deliberately not set, and one inherited from the shell is taken out:
 * scripts/local-dev.mjs starts the emulators with FORCE_COLOR=1, and Node
 * prints "Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env
 * being set" in every process that sees both. Whatever colour a child still
 * emits is removed by stripAnsi() before it reaches the log.
 */
export function plainOutputEnv(extra = {}, base = process.env) {
  const env = { ...base, ...extra, FORCE_COLOR: '0' };
  for (const name of Object.keys(env)) {
    // Windows variable names are not case-sensitive.
    if (/^(NO_COLOR|NODE_DISABLE_COLORS)$/i.test(name)) delete env[name];
  }
  return env;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Text of a regular file of at most `limit` bytes; null for anything else (no
 * file, a folder, a pipe, a larger file). At most `limit` + 1 bytes are read,
 * whatever the file turns out to be.
 */
function readSmallFile(file, limit) {
  let fd;
  try {
    // Non-blocking, so that opening a named pipe left under this name cannot
    // hang the server waiting for a writer. Windows has no such flag or need.
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
    if (!fs.fstatSync(fd).isFile()) return null;
    const buffer = Buffer.alloc(limit + 1);
    let size = 0;
    for (;;) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
      if (size > limit) return null;
    }
    return buffer.toString('utf8', 0, size);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // nothing more to do with it
      }
    }
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
export function capture(file, args, { cwd, env, shell = false, timeoutMs = 5000, exitGraceMs = null } = {}) {
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
    let grace = null;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(grace);
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
    // `exitGraceMs`: take the answer from "exit" (plus a moment for the last output), not from "close".
    // A program the child started can inherit its pipes and keep them open for as long as it runs.
    if (exitGraceMs !== null) {
      child.once('exit', (code) => {
        grace = setTimeout(() => {
          finish(code);
          child.stdout.destroy();
          child.stderr.destroy();
        }, exitGraceMs);
      });
    }
    child.on('close', (code) => finish(code));
  });
}

/** Start a program that outlives this one (editor, file manager, browser). Resolves false if it could not start. */
function launchDetached(file, args, { cwd } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      // No windowsHide here: these are windowed programs and it would start them hidden.
      child = spawn(file, args, { cwd, detached: true, stdio: 'ignore' });
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
  const java = await capture(pathTool('java'), ['-version'], { timeoutMs: 8000 });
  const javaMatch = java.code === 0 ? /version "([^"]+)"/.exec(`${java.stderr}\n${java.stdout}`) : null;
  const [yarnFile, yarnArgv, yarnShell] = spawnArgs('yarn', ['--version']);
  const yarn = await capture(yarnFile, yarnArgv, { ...yarnShell, timeoutMs: 8000 });
  const yarnMatch = yarn.code === 0 ? /^\s*(\d+\.\d+\.\d+\S*)/.exec(yarn.stdout) : null;
  return { node: process.version, java: javaMatch ? javaMatch[1] : null, yarn: yarnMatch ? yarnMatch[1] : null };
}

/**
 * scripts/*.test.mjs as paths relative to the repository: the files the
 * "Run dev tooling tests" step of PR Validation runs.
 */
function toolingTestFiles(root) {
  try {
    return fs
      .readdirSync(path.join(root, 'scripts'), { withFileTypes: true })
      .filter((entry) => !entry.isDirectory() && !entry.name.startsWith('.') && entry.name.endsWith('.test.mjs'))
      .map((entry) => `scripts/${entry.name}`)
      .sort();
  } catch {
    return [];
  }
}

/**
 * The fixed command lists behind the job actions. Every value is a constant
 * except the names of the tooling test files, which are read from scripts/;
 * `shim` marks the .cmd shims that go through spawnArgs() on Windows.
 */
export function defaultJobSteps(root) {
  const functionsDir = path.join(root, 'functions');
  // CI leaves this pattern to its shell. Jobs run without one, and Node 20
  // does not expand it either, so it is expanded here.
  const toolingTests = toolingTestFiles(root);
  return {
    // Never wait for a password nobody can type; a failed login shows up in the log instead.
    pull: [{ file: pathTool('git'), args: ['pull', '--ff-only'], cwd: root, env: { GIT_TERMINAL_PROMPT: '0' }, label: 'git pull --ff-only' }],
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
      // Left out on a branch without such tests: `node --test` with no file goes looking for tests everywhere.
      ...(toolingTests.length
        ? [{ file: process.execPath, args: ['--test', ...toolingTests], cwd: root, label: 'node --test scripts/*.test.mjs' }]
        : []),
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
// Commands that run from a button: fixed text, built here and nowhere else
// ---------------------------------------------------------------------------

/**
 * The values that may be written into command text: whole numbers that pass
 * `allowed`. Anything else is a programming error and throws before a command
 * exists, so no caller can pass a string through by accident.
 */
function checkedNumbers(values, allowed, what) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 64) throw new TypeError(`${what}: a list of 1 to 64 numbers is needed.`);
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isInteger(value) || !allowed(value)) throw new TypeError(`${what}: ${String(value)} is not allowed.`);
  }
  return [...new Set(values)];
}

const isKillablePid = (value) => Number.isInteger(value) && value > 4 && value <= 0xffffffff;

/**
 * `-EncodedCommand` value for powershell.exe: the script as UTF-16LE, in
 * base64. PowerShell decodes it and runs the text as it is, so neither
 * cmd.exe, nor CreateProcess quoting, nor PowerShell's own argument parsing
 * ever sees a character of the script.
 * (about_PowerShell_exe: "-EncodedCommand: Accepts a base-64-encoded string
 * version of a command ... the string must be formatted using UTF-16LE".)
 */
export function encodePowerShell(script) {
  return Buffer.from(String(script), 'utf16le').toString('base64');
}

/** Arguments for a PowerShell that runs `script` without a window, a profile or a prompt. */
export function powerShellArgs(script) {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)];
}

/**
 * Windows: what is listening on `ports`, one `port|pid|name` line each.
 * Get-NetTCPConnection (module NetTCPIP, part of Windows 8 and newer) needs no
 * administrator rights; OwningProcess is the PID.
 */
export function portFindScript(ports) {
  const list = checkedNumbers(ports, isPortNumber, 'ports');
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$ports = @(${list.join(',')})`,
    'Get-NetTCPConnection -State Listen | Where-Object { $ports -contains $_.LocalPort } | Sort-Object LocalPort, OwningProcess -Unique | ForEach-Object {',
    "  '{0}|{1}|{2}' -f $_.LocalPort, $_.OwningProcess, (Get-Process -Id $_.OwningProcess).ProcessName",
    '}',
    'exit 0',
  ].join('\r\n');
}

/** A process name as it may be shown: what tasklist and ps print, and nothing that could be mistaken for more. */
const shownName = (name) => String(name ?? '').replace(/[^A-Za-z0-9 ._()+-]/g, '').slice(0, 64) || 'unknown';

/** `[{ port, pid, name }]` from the output of portFindScript(). Lines of any other shape are ignored. */
export function parsePortFindOutput(text) {
  const found = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = /^(\d{1,5})\|(\d{1,10})\|([^|]{0,128})$/.exec(line.trim());
    if (!match) continue;
    const port = Number(match[1]);
    const pid = Number(match[2]);
    if (!isPortNumber(port) || found.some((entry) => entry.port === port && entry.pid === pid)) continue;
    found.push({ port, pid, name: shownName(match[3]) });
  }
  return found;
}

/**
 * `[{ port, pid, name }]` from `lsof -nP -iTCP -sTCP:LISTEN`, for `ports` only.
 * A line looks like `node  4242 me  23u  IPv4 0x1 0t0  TCP 127.0.0.1:4200 (LISTEN)`.
 */
export function parseLsofListeners(text, ports) {
  const found = [];
  for (const line of String(text ?? '').split('\n')) {
    const match = /^(\S+)\s+(\d{1,10})\s.*\sTCP\s+\S*:(\d{1,5})\s+\(LISTEN\)\s*$/.exec(line);
    if (!match) continue;
    const port = Number(match[3]);
    const pid = Number(match[2]);
    if (!ports.includes(port) || found.some((entry) => entry.port === port && entry.pid === pid)) continue;
    // lsof cuts the command name to nine characters and writes a space in it as \x20.
    found.push({ port, pid, name: shownName(match[1].replace(/\\x20/g, ' ')) });
  }
  return found;
}

/**
 * What is listening on `ports`: `{ ok: true, listeners }` or `{ ok: false, error }`.
 * The PIDs come from the operating system, never from a request.
 */
async function defaultFindListeners(ports, { platform = process.platform, runTool = capture } = {}) {
  if (platform === 'win32') {
    const result = await runTool(systemTool('powershell.exe'), powerShellArgs(portFindScript(ports)), { timeoutMs: 20_000 });
    if (result.code !== 0) return { ok: false, error: firstLine(result.stderr) || 'PowerShell could not list the listening ports.' };
    return { ok: true, listeners: parsePortFindOutput(result.stdout) };
  }
  const result = await runTool('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { timeoutMs: 8000 });
  if (result.code === null) return { ok: false, error: 'lsof is not installed, or it did not answer.' };
  // lsof exits 1 when it has nothing to list.
  return { ok: true, listeners: parseLsofListeners(result.stdout, ports) };
}

const firstLine = (text) => String(text ?? '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';

/**
 * The work an elevated PowerShell does, as script lines. `kind` picks one of
 * three fixed texts; `numbers` (ports, or PIDs the console looked up) are the
 * only variable part and are written as digits.
 *
 * netsh syntax, from Microsoft's "netsh interface" reference
 * (learn.microsoft.com/windows-server/administration/windows-commands/netsh-interface):
 *   netsh interface ipv4 add|delete excludedportrange [protocol=]tcp|udp
 *         [startport=]<integer> [numberofports=]<integer> [[store=]active|persistent]
 * `persistent` (the default) keeps the exclusion across restarts. An excluded
 * port is one Windows no longer hands out by itself (to Hyper-V, WSL, Docker,
 * or as a dynamic port); a program that asks for that port by number still
 * gets it. Delete must name the same start and count as the add did.
 *
 * netsh.exe and taskkill.exe are run by their full path in the system folder,
 * which the elevated process asks Windows for ([Environment]::SystemDirectory
 * is GetSystemDirectory) rather than reading it from an environment variable
 * the unelevated side could have set.
 */
export function elevatedBody(kind, numbers) {
  if (kind === 'reserve' || kind === 'unreserve') {
    const ports = checkedNumbers(numbers, isPortNumber, 'ports');
    const verb = kind === 'reserve' ? 'add' : 'delete';
    const done = kind === 'reserve' ? 'kept for the local stack' : 'given back to Windows';
    return [
      "$netsh = Join-Path ([Environment]::SystemDirectory) 'netsh.exe'",
      `foreach ($n in @(${ports.join(',')})) {`,
      // In Windows PowerShell 5.1 "2>&1" turns stderr lines into error records; "$_" is their plain text.
      `  $r = (((& $netsh interface ipv4 ${verb} excludedportrange protocol=tcp startport=$n numberofports=1 store=persistent 2>&1 | ForEach-Object { "$_" }) -join ' ') -replace '\\s+', ' ').Trim()`,
      `  if ($LASTEXITCODE -eq 0) { Say ('port ' + $n + ': ${done}') } else { Say ('port ' + $n + ': not changed. Windows said: ' + $r) }`,
      '}',
    ];
  }
  if (kind === 'kill') {
    const pids = checkedNumbers(numbers, isKillablePid, 'pids');
    return [
      "$taskkill = Join-Path ([Environment]::SystemDirectory) 'taskkill.exe'",
      `foreach ($n in @(${pids.join(',')})) {`,
      `  $r = (((& $taskkill /PID $n /T /F 2>&1 | ForEach-Object { "$_" }) -join ' ') -replace '\\s+', ' ').Trim()`,
      '  if ($LASTEXITCODE -ne 0) { $code = 1 }',
      "  Say ('pid ' + $n + ': ' + $r)",
      '}',
    ];
  }
  throw new TypeError(`Unknown elevated step: ${String(kind)}`);
}

/**
 * The two scripts behind one administrator step, and the arguments of the
 * (unelevated, windowless) PowerShell that starts it.
 *
 * `inner` runs elevated. It appends what it did to `resultFile`, a file the
 * console created beforehand, and ends with `::exit::<code>`: an elevated
 * process cannot hand its output back to the one that asked for it, and
 * Start-Process cannot redirect together with -Verb. The file's path reaches
 * the script as base64 and is decoded there, so no character of it (a user
 * name with a space or an apostrophe) is ever read as PowerShell.
 *
 * `outer` runs as the console does and only does this:
 *   Start-Process <Windows PowerShell> -Verb RunAs -Wait -PassThru
 * "-Verb RunAs" is what raises the UAC prompt (Start-Process reference,
 * example "Start PowerShell as an administrator"); -Wait blocks until the
 * elevated process and its children are gone; -PassThru returns the Process
 * whose ExitCode is passed on. Declining the prompt makes ShellExecuteEx fail
 * with ERROR_CANCELLED (1223, "The operation was canceled by the user"), which
 * Start-Process throws as an InvalidOperationException around a
 * Win32Exception: the catch looks for that number rather than for the text,
 * which is translated, and reports it as exit code 1223.
 *
 * Both are passed with -EncodedCommand, so nothing is quoted or re-parsed on
 * the way. `$PSHOME` is the folder of the PowerShell that is running the outer
 * script, which the console started by its System32 path.
 */
export function buildElevatedCommand(kind, numbers, resultFile) {
  const body = elevatedBody(kind, numbers);
  const inner = [
    "$ErrorActionPreference = 'Continue'",
    `$out = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodePowerShell(resultFile)}'))`,
    // Only ever writes to the file the console made: no file, no work.
    'if (-not (Test-Path -LiteralPath $out -PathType Leaf)) { exit 3 }',
    '$enc = New-Object System.Text.UTF8Encoding($false)',
    'function Say([string]$t) { [IO.File]::AppendAllText($out, $t + "`r`n", $enc) }',
    '$code = 0',
    'try {',
    ...body,
    "} catch { Say ('error: ' + $_.Exception.Message); $code = 1 }",
    "Say ('::exit::' + $code)",
    'exit $code',
  ].join('\r\n');
  const innerArguments = `-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${encodePowerShell(inner)}`;
  const outer = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    // System.Diagnostics.Process throws the Win32Exception (1223 when the prompt is answered No) itself;
    // Start-Process turns it into an InvalidOperationException that keeps only the translated message.
    '  $psi = New-Object System.Diagnostics.ProcessStartInfo',
    "  $psi.FileName = Join-Path $PSHOME 'powershell.exe'",
    `  $psi.Arguments = '${innerArguments}'`,
    "  $psi.Verb = 'runas'",
    '  $psi.UseShellExecute = $true',
    "  $psi.WindowStyle = 'Hidden'",
    '  $p = [System.Diagnostics.Process]::Start($psi)',
    '  $p.WaitForExit()',
    '  exit $p.ExitCode',
    '} catch {',
    '  $e = $_.Exception',
    '  while ($e) {',
    `    if ($e -is [System.ComponentModel.Win32Exception] -and $e.NativeErrorCode -eq ${UAC_DECLINED}) { exit ${UAC_DECLINED} }`,
    '    $e = $e.InnerException',
    '  }',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\r\n');
  return { inner, outer, args: powerShellArgs(outer) };
}

/**
 * Run one fixed administrator step (see elevatedBody) and report what it did.
 * Windows shows its UAC prompt when this is called, and not before.
 *
 * Resolves to `{ status, exitCode, lines }`:
 *   'ok' / 'failed'  the elevated script ran; `lines` is what it reported
 *   'declined'       the prompt was answered with No (or closed): nothing ran
 *   'error'          the step could not be started; `lines` says why
 *
 * The result file gets a name nobody can guess (128 random bits), is created
 * here with "wx" (never an existing file or link) before Windows is asked,
 * and is deleted afterwards whatever happened.
 */
export async function runElevated(kind, numbers, { runTool = capture, tmpDir = os.tmpdir(), powershell = systemTool('powershell.exe') } = {}) {
  elevatedBody(kind, numbers); // a value that is not allowed throws here, before a file exists
  const resultFile = path.join(tmpDir, `omnitask-console-${randomBytes(16).toString('hex')}.txt`);
  try {
    fs.closeSync(fs.openSync(resultFile, 'wx', 0o600));
  } catch (err) {
    return { status: 'error', exitCode: null, lines: [`The result file could not be created: ${err instanceof Error ? err.message : String(err)}`] };
  }
  try {
    const { args } = buildElevatedCommand(kind, numbers, resultFile);
    const outer = await runTool(powershell, args, { timeoutMs: ELEVATION_TIMEOUT_MS });
    const text = (readSmallFile(resultFile, ELEVATED_RESULT_LIMIT) ?? '').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    const mark = lines.length ? ELEVATED_EXIT_MARK.exec(lines.at(-1)) : null;
    if (mark) {
      // The script's own last word counts, whatever the helper could read of the exit code.
      const exitCode = Number(mark[1]);
      return { status: exitCode === 0 ? 'ok' : 'failed', exitCode, lines: lines.slice(0, -1) };
    }
    if (outer.code === UAC_DECLINED) return { status: 'declined', exitCode: null, lines: [] };
    const why = firstLine(outer.stderr) || (outer.code === null ? 'PowerShell could not be started, or the step took too long.' : `exit code ${outer.code}`);
    return { status: 'error', exitCode: outer.code, lines: [...lines, why] };
  } finally {
    try {
      fs.rmSync(resultFile, { force: true });
    } catch {
      // a leftover empty file in the temp folder is all that can remain
    }
  }
}

/** The windows that `terminal`, `firebase-login`, `secret-set` and `deploy-functions` open. Every word is a constant. */
const TERMINAL_COMMANDS = {
  terminal: { title: 'OmniTask', argv: null },
  'firebase-login': { title: 'OmniTask: Firebase sign-in', argv: ['npx', '--yes', FIREBASE_TOOLS, 'login'] },
  'secret-set': {
    title: 'OmniTask: set the production API key',
    argv: ['npx', '--yes', FIREBASE_TOOLS, 'functions:secrets:set', 'ANTHROPIC_API_KEY', '--project', PROD_PROJECT],
  },
  'deploy-functions': {
    title: 'OmniTask: deploy functions to PRODUCTION',
    argv: ['npx', '--yes', FIREBASE_TOOLS, 'deploy', '--only', 'functions', '--project', PROD_PROJECT],
    confirm: true,
  },
};

/** Environment variable that carries the repository folder to a terminal window on Windows. */
const REPO_ENV = 'OMNITASK_CONSOLE_REPO';

/**
 * How to open a terminal window in the repository, optionally running one of
 * the fixed commands and staying open afterwards. Returns
 * `{ file, args, shown, via, env? }`: `shown` is the command as a person would
 * type it (null for a plain terminal), `via` is 'tool' when `file` is a helper
 * to run hidden and wait for (Windows) or 'launch' when it is the terminal
 * program itself.
 *
 * Windows. The console usually has no window of its own: the shortcut starts
 * it detached and hidden, and libuv starts a detached child with
 * DETACHED_PROCESS (no console at all) and a hidden one with CREATE_NO_WINDOW
 * (libuv src/win/process.c, uv_spawn). A powershell.exe spawned from Node
 * with `detached: true` therefore gets no window, whatever windowsHide says.
 * So a hidden helper PowerShell runs Start-Process, which goes through
 * ShellExecute and "by default on Windows ... opens a new window"
 * (Start-Process reference, -NoNewWindow): ShellExecuteEx gives a console
 * program a console of its own unless SEE_MASK_NO_CONSOLE is passed, which
 * Start-Process does not do, so the helper being windowless does not matter
 * and `cmd /c start` (with its quoting rules) is not needed. The new window is not a child in
 * Node's kill-on-close job (libuv sets JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK, so
 * only direct children are in it) and stays when the console exits.
 * `-NoExit` keeps it open after the command. npx is called as npx.cmd:
 * the default execution policy of Windows 11 refuses the npx.ps1 that
 * PowerShell would otherwise pick.
 *
 * No path is written into any of the text. The helper is started with the
 * repository as its working directory and with REPO_ENV set (spawn options,
 * not command text); the new window inherits both and moves there with
 * Set-Location -LiteralPath, so spaces, brackets and quotes in the path are
 * never parsed by anything.
 */
export function terminalCommand(kind, root, platform = process.platform) {
  const command = Object.hasOwn(TERMINAL_COMMANDS, kind) ? TERMINAL_COMMANDS[kind] : null;
  if (!command) throw new TypeError(`Unknown terminal command: ${String(kind)}`);
  const shown = command.argv ? command.argv.join(' ') : null;
  if (platform === 'win32') {
    const inner = [
      `if ($env:${REPO_ENV}) { Set-Location -LiteralPath $env:${REPO_ENV} }`,
      `$Host.UI.RawUI.WindowTitle = '${command.title}'`,
      ...(command.argv
        ? [
            "Write-Host ''",
            "Write-Host 'The OmniTask Build Console opened this window to run:'",
            `Write-Host '> ${shown}' -ForegroundColor Cyan`,
            "Write-Host ''",
            ...(command.confirm
              ? [
                  `if ((Read-Host '${DEPLOY_PROMPT}') -cne '${DEPLOY_CONFIRM_WORD}') { Write-Host 'Nothing was deployed.'; return }`,
                ]
              : []),
            `& npx.cmd ${command.argv.slice(1).join(' ')}`,
            "Write-Host ''",
            "Write-Host ('Finished (exit code ' + $LASTEXITCODE + '). This window stays open; close it when you are done.')",
          ]
        : ["Write-Host 'OmniTask repository folder. Close this window when you are done.'"]),
    ].join('\r\n');
    const outer = [
      "$ErrorActionPreference = 'Stop'",
      'try {',
      `  Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoLogo','-NoExit','-EncodedCommand','${encodePowerShell(inner)}'`,
      '  exit 0',
      '} catch {',
      '  [Console]::Error.WriteLine($_.Exception.Message)',
      '  exit 1',
      '}',
    ].join('\r\n');
    return { via: 'tool', file: systemTool('powershell.exe'), args: powerShellArgs(outer), env: { [REPO_ENV]: root }, shown, inner, outer };
  }
  if (platform === 'darwin') {
    // The folder is an argument of the script ("item 1 of argv"), and `quoted form of` quotes it for the shell.
    const guarded = command.confirm
      ? `printf '${DEPLOY_PROMPT}: '; read a; if [ \\"$a\\" = ${DEPLOY_CONFIRM_WORD} ]; then ${shown}; else echo 'Nothing was deployed.'; fi`
      : shown;
    const then = shown ? ` & " && ${guarded}"` : '';
    return {
      via: 'launch',
      file: 'osascript',
      args: [
        '-e', 'on run argv',
        '-e', `tell application "Terminal" to do script "cd " & quoted form of (item 1 of argv)${then}`,
        '-e', 'tell application "Terminal" to activate',
        '-e', 'end run',
        root,
      ],
      shown,
    };
  }
  // Started in the repository (spawn's cwd); the shell that follows keeps the window open.
  return {
    via: 'launch',
    file: 'x-terminal-emulator',
    args: shown
      ? [
          '-e',
          'sh',
          '-c',
          command.confirm
            ? `echo '> ${shown}'; printf '${DEPLOY_PROMPT}: '; read a; if [ "$a" = ${DEPLOY_CONFIRM_WORD} ]; then ${shown}; else echo 'Nothing was deployed.'; fi; echo; echo 'Finished. This window stays open.'; exec "\${SHELL:-sh}"`
            : `echo '> ${shown}'; ${shown}; echo; echo 'Finished. This window stays open.'; exec "\${SHELL:-sh}"`,
        ]
      : [],
    shown,
  };
}

/**
 * Arguments of `ng` for the app dev server, the way appServeArgs() in
 * scripts/local-dev.mjs builds them: the `local` configuration, or
 * `local-remapped` when a port the app connects to was moved (and the stack
 * generated the environment file for it), plus `--port` when the app's own
 * port moved. `effective` and `defaults` are ports by name.
 */
export function appServePlan(effective, defaults, hasRemappedEnvironment) {
  const [port] = checkedNumbers([effective.app], isPortNumber, 'app port');
  const moved = (name) => effective[name] !== defaults[name];
  const clientMoved = CLIENT_PORT_NAMES.some(moved);
  const configuration = clientMoved && hasRemappedEnvironment ? REMAPPED_CONFIGURATION : 'local';
  const args = ['serve', '--configuration', configuration];
  if (moved('app')) args.push('--port', String(port));
  return { args, configuration, port, missingEnvironment: clientMoved && !hasRemappedEnvironment };
}

/**
 * The fixed command lists of the jobs that are not part of the build
 * (defaultJobSteps has those). `prod-logs` holds one list per function name.
 */
export function defaultCommandSteps(root) {
  const shortcutScript = path.join(root, 'scripts', 'console-shortcut.ps1');
  const shortcut = (extra, label) => [
    {
      file: systemTool('powershell.exe'),
      // -File takes the path as one argument; Node quotes it for CreateProcess when it has a space.
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', shortcutScript, ...extra],
      cwd: root,
      label,
    },
  ];
  return {
    tools: [
      { file: process.execPath, args: ['-v'], cwd: root, label: 'node -v' },
      { file: pathTool('java'), args: ['-version'], cwd: root, label: 'java -version' },
      { file: 'yarn', args: ['-v'], cwd: root, shim: true, label: 'yarn -v' },
      { file: pathTool('git'), args: ['--version'], cwd: root, label: 'git --version' },
    ],
    'prod-logs': Object.fromEntries(
      PROD_FUNCTIONS.map((name) => [
        name,
        [
          {
            file: 'npx',
            args: ['--yes', FIREBASE_TOOLS, 'functions:log', '--only', name, '--project', PROD_PROJECT],
            cwd: root,
            shim: true,
            label: `npx --yes ${FIREBASE_TOOLS} functions:log --only ${name} --project ${PROD_PROJECT}`,
          },
        ],
      ]),
    ),
    shortcut: shortcut([], 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/console-shortcut.ps1'),
    'shortcut-remove': shortcut(['-Remove'], 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/console-shortcut.ps1 -Remove'),
  };
}

/**
 * True when this process has administrator rights (it should not: the
 * shortcut starts it as the signed-in user). Windows: the token's integrity
 * level, which whoami lists as a SID that is the same in every language
 * (S-1-16-12288 High, S-1-16-16384 System). Elsewhere: running as root.
 */
async function probeElevated() {
  if (!IS_WINDOWS) return typeof process.getuid === 'function' && process.getuid() === 0;
  const result = await capture(systemTool('whoami.exe'), ['/groups', '/fo', 'csv', '/nh'], { timeoutMs: 5000 });
  return result.code === 0 && /S-1-16-(12288|16384)\b/.test(result.stdout);
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
 * `probePort`, `probeTools`, `probeElevated`, `jobSteps`, `commandSteps`,
 * `spawnApp(args, { root })`, `platform`, `runTool(file, args, opts)`,
 * `findListeners(ports)`, `runElevated(kind, numbers)`, `kill(pid, signal)`,
 * `stopTimeoutMs`, `idleExitMs` (0 = never),
 * `onExit(reason)` (called after `quit` or an idle exit, once everything is
 * closed), `report(text)` (receives the console's own log lines).
 *
 * Returns `{ server, token, close(), endStack(graceMs), log(text), state() }`.
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
  // Built when a job starts, not once: a pull can add a tooling test file.
  const jobSteps = options.jobSteps ?? defaultJobSteps;
  const commandSteps = options.commandSteps ?? defaultCommandSteps;
  // What the Windows-only actions decide by. Tests set it; everything that
  // really starts a process still goes by the machine this runs on.
  const platform = options.platform ?? process.platform;
  const onWindows = platform === 'win32';
  /** Runs a short helper program hidden and resolves to `{ code, stdout, stderr }`. */
  const runTool = options.runTool ?? capture;
  const findListeners = options.findListeners ?? ((ports) => defaultFindListeners(ports, { platform, runTool }));
  const elevate = options.runElevated ?? ((kind, numbers) => runElevated(kind, numbers, { runTool }));
  const sendSignal = options.kill ?? ((pid, signal) => process.kill(pid, signal));
  const spawnApp = options.spawnApp ?? defaultSpawnApp;
  /** How long port-free waits for a port to be released after each attempt. */
  const portFreeWaitMs = options.portFreeWaitMs ?? 3000;

  const functionsDir = path.join(root, 'functions');
  const files = {
    page: path.join(root, 'scripts', 'console', 'console.html'),
    icons: [path.join(root, 'scripts', 'console', 'omnitask-console.ico'), path.join(root, 'public', 'logo.ico')],
    localDev: path.join(root, 'scripts', 'local-dev.mjs'),
    secret: path.join(functionsDir, '.secret.local'),
    secretExample: path.join(functionsDir, '.secret.local.example'),
    envLocal: path.join(functionsDir, '.env.local'),
    smokeScript: path.join(functionsDir, 'scripts', 'ai-smoke.mjs'),
    firebaseJson: path.join(root, 'firebase.json'),
    stackPorts: path.join(root, PORTS_FILE),
    ngBin: path.join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'),
    remappedEnvironment: path.join(root, ...REMAPPED_ENVIRONMENT.split('/')),
    shortcutScript: path.join(root, 'scripts', 'console-shortcut.ps1'),
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
  const readTools = () =>
    Promise.resolve()
      .then(options.probeTools ?? probeTools)
      .catch(() => ({ node: process.version, java: null, yarn: null }));
  let toolsPromise = readTools();
  const elevatedPromise = Promise.resolve()
    .then(options.probeElevated ?? probeElevated)
    .then(Boolean, () => false);

  let defaultPortsCache = null;
  function getDefaultPorts() {
    if (!defaultPortsCache || Date.now() - defaultPortsCache.at >= DEFAULT_PORTS_TTL_MS) {
      defaultPortsCache = { at: Date.now(), ports: defaultStackPorts(readSmallFile(files.firebaseJson, FIREBASE_JSON_LIMIT)) };
    }
    return defaultPortsCache.ports;
  }

  let portsCache = null;
  /**
   * One `{ name, port, default, open }` per part of the stack. `port` is where
   * the stack is (or would be) listening and the only one probed: the number
   * in .local-dev-ports.json while that file exists and is valid, otherwise
   * `default`. The console never picks a port itself.
   */
  function getPorts() {
    const defaults = getDefaultPorts();
    // Read every time, not cached: the stack writes the file when it starts
    // and deletes it when it exits, and the page should follow at once.
    const text = readSmallFile(files.stackPorts, PORTS_FILE_LIMIT);
    const effective = (typeof text === 'string' && portsFileIsStale(text) ? null : parsePortsFile(text)) ?? defaults;
    const key = STACK_PORTS.map(({ name }) => `${effective[name]}/${defaults[name]}`).join(' ');
    // Probe results are kept for a second, but only for the same set of ports.
    if (portsCache && portsCache.key === key && Date.now() - portsCache.at < 1000) return portsCache.promise;
    const promise = Promise.all(
      STACK_PORTS.map(async ({ name }) => ({
        name,
        port: effective[name],
        default: defaults[name],
        open: Boolean(await probe(effective[name])),
      })),
    );
    portsCache = { at: Date.now(), key, promise };
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
      const result = await capture(pathTool('git'), args, { cwd: root, env, timeoutMs: 3000 });
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
  /** The app dev server started by `app-start`: a second managed child, next to (never inside) the stack. */
  const app = { child: null, state: 'stopped', since: null, lastExit: null, port: null, configuration: null, exited: null, watch: null };
  let job = null;
  let jobChild = null;
  let jobSeq = 0;
  const jobRunning = () => job !== null && job.state === 'running';

  async function buildState() {
    const [ports, git, tools, elevated] = await Promise.all([getPorts(), getGit(), toolsPromise, elevatedPromise]);
    await refreshApp();
    const secretText = readText(files.secret);
    rememberSecret(secretText);
    const functionsModules = path.join(functionsDir, 'node_modules');
    // An app port held by the dev server this console started is not somebody else's stack.
    const external = ports.some((p) => (p.name === 'hub' || (p.name === 'app' && !app.child)) && p.open);
    return {
      console: { version, pid: process.pid, port: currentPort(), platform: process.platform, repo: root, startedAt, elevated },
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
        // Lets the page leave out buttons that can do nothing on this system.
        platformSupports: { elevation: onWindows, shortcut: onWindows && fs.existsSync(files.shortcutScript) },
      },
      stack: stack.child
        ? { state: stack.state, mode: stack.mode, pid: stack.child.pid ?? null, since: stack.since, lastExit: stack.lastExit }
        : { state: external ? 'external' : 'stopped', mode: null, pid: null, since: null, lastExit: stack.lastExit },
      app: {
        state: app.state,
        pid: app.child ? (app.child.pid ?? null) : null,
        since: app.since,
        lastExit: app.lastExit,
        port: app.port,
        configuration: app.configuration,
      },
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
      env: plainOutputEnv(),
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
      const was = stack.state;
      stack.lastExit = { code: code ?? null, at: new Date().toISOString() };
      stack.child = null;
      stack.state = 'stopped';
      stack.mode = null;
      stack.since = null;
      portsCache = null;
      if (code === 0) {
        note('The stack has stopped.');
      } else {
        const how = `The stack exited (${code === null ? 'it was ended' : `code ${code}`})`;
        // Nobody asked it to stop, so the reason is further up in its own output: say where to look and what to do.
        if (was === 'starting') {
          note(`${how} before it finished starting. Scroll up to the first error above, fix what it names, then start the stack again.`);
        } else if (was === 'running') {
          note(`${how} by itself. Scroll up to the first error above, then start the stack again.`);
        } else {
          note(`${how}.`);
        }
      }
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

  /**
   * For a caller that cannot wait for the full stop (a second Ctrl+C on
   * Windows): give a stack that is already stopping `graceMs` to finish by
   * itself, then end its process tree, and resolve once it is gone.
   */
  async function endStack(graceMs) {
    const child = stack.child;
    if (!child) return;
    requestStop();
    const within = (ms) => {
      let timer;
      const limit = new Promise((resolve) => {
        timer = setTimeout(resolve, ms);
      });
      return Promise.race([stack.exited, limit]).then(() => clearTimeout(timer));
    };
    await within(graceMs);
    if (stack.child !== child) return;
    note(`The stack did not stop within ${Math.round(graceMs / 1000)} s; ending its process tree.`);
    killTree(child);
    // The kill is asynchronous on Windows (taskkill): stay until it has worked, but not for ever.
    await within(5000);
  }

  // ---- the app dev server ----------------------------------------------------
  /**
   * The way scripts/local-dev.mjs starts it: ng's JavaScript entry point, run
   * by this Node binary without a shell, so no path is quoted or split. The
   * arguments are appServePlan()'s: constants and a checked port number.
   */
  function defaultSpawnApp(args) {
    return spawn(process.execPath, [files.ngBin, ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Own process group on POSIX, so the kill reaches the builders ng starts.
      detached: !IS_WINDOWS,
      env: plainOutputEnv(),
    });
  }

  /** "starting" becomes "running" once the port ng was given accepts connections. */
  async function refreshApp() {
    const child = app.child;
    if (!child || app.state !== 'starting') return;
    const open = Boolean(await probe(app.port));
    if (open && app.child === child && app.state === 'starting') {
      app.state = 'running';
      note(`The app is up: http://localhost:${app.port}/`);
    }
  }

  function startApp(plan) {
    let child;
    try {
      child = spawnApp(plan.args, { root });
    } catch (err) {
      throw new ActionError(409, `Could not start the app dev server: ${err instanceof Error ? err.message : String(err)}`);
    }
    app.child = child;
    app.state = 'starting';
    app.since = new Date().toISOString();
    app.port = plan.port;
    app.configuration = plan.configuration;
    let resolveExit;
    app.exited = new Promise((resolve) => {
      resolveExit = resolve;
    });
    note(`Starting the app dev server (ng ${plan.args.join(' ')})...`);
    pipeLines(child.stdout, (line) => addOutput('app', line));
    pipeLines(child.stderr, (line) => addOutput('app', line));
    // The page polls the state, which looks too; this keeps the log right when nobody is looking.
    app.watch = setInterval(() => refreshApp().catch(() => {}), 1000);
    app.watch.unref?.();

    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearInterval(app.watch);
      app.watch = null;
      const was = app.state;
      app.lastExit = { code: code ?? null, at: new Date().toISOString() };
      app.child = null;
      app.state = 'stopped';
      app.since = null;
      app.port = null;
      app.configuration = null;
      portsCache = null;
      if (was === 'stopping') {
        note('The app dev server has stopped.');
      } else {
        const how = `The app dev server exited (${code === null ? 'it was ended' : `code ${code}`})`;
        note(`${how} ${was === 'starting' ? 'before it finished starting' : 'by itself'}. Scroll up to the first error above.`);
      }
      resolveExit();
    };
    child.on('error', (err) => {
      if (child.pid === undefined) {
        note(`Could not run the app dev server: ${err.message}`);
        finish(null);
      }
    });
    child.once('exit', (code) => finish(code));
  }

  /** The dev server holds nothing worth saving, so stopping it is ending its process tree. */
  function requestAppStop() {
    const child = app.child;
    if (!child || app.state === 'stopping') return;
    app.state = 'stopping';
    note('Stopping the app dev server...');
    killTree(child);
  }

  async function stopAppAndWait(limitMs = 5000) {
    if (!app.child) return;
    requestAppStop();
    let giveUp;
    const limit = new Promise((resolve) => {
      giveUp = setTimeout(resolve, limitMs);
    });
    await Promise.race([app.exited, limit]);
    clearTimeout(giveUp);
  }

  // ---- jobs -----------------------------------------------------------------
  /**
   * A step is a program (`file`, `args`, `cwd`) or, for work that is more than
   * one program, a function `run(emit, job)` that resolves to an exit code;
   * `emit(line)` writes to the log.
   */
  function runStep(step, current) {
    if (typeof step.run === 'function') {
      return Promise.resolve()
        .then(() => step.run((line) => addOutput('job', String(line)), current))
        .then(
          (code) => (code === 0 ? 0 : (code ?? null)),
          (err) => {
            addLog('job', `The step failed: ${err instanceof Error ? err.message : String(err)}`);
            return 1;
          },
        );
    }
    return new Promise((resolve) => {
      const [file, argv, shellOpt] = step.shim ? spawnArgs(step.file, step.args) : [step.file, step.args, { shell: false }];
      let child;
      try {
        child = spawn(file, argv, {
          cwd: step.cwd,
          env: plainOutputEnv(step.env),
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

  /**
   * `keepGoing`: run every step even after one failed (the job still ends as
   * failed, with the first failing step's exit code). `declined` on the job
   * means Windows asked for administrator rights and was told no: the job
   * ends "ok" with nothing changed, which is an answer, not a failure.
   */
  function startJob(action, jobStepList, { keepGoing = false } = {}) {
    const current = {
      id: ++jobSeq,
      action,
      state: 'running',
      exitCode: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      declined: false,
    };
    job = current;
    (async () => {
      let code = 0;
      for (const step of jobStepList) {
        if (closing) {
          code = null; // the console is shutting down: do not start the next step
          break;
        }
        if (current.declined && step.skipWhenDeclined) continue;
        addLog('job', `$ ${step.label}`);
        const stepCode = await runStep(step, current);
        if (stepCode === 0) continue;
        if (code === 0) code = stepCode;
        if (!keepGoing) break; // stop at the first failure
        addLog('job', stepCode === null ? '(could not run)' : `(exit code ${stepCode})`);
      }
      current.exitCode = code;
      current.state = code === 0 ? 'ok' : 'failed';
      current.endedAt = new Date().toISOString();
      gitCache = null; // a pull or an install changes what the header shows
      defaultPortsCache = null; // and a pull can bring another firebase.json
      portsCache = null;
      if (action === 'tools') toolsPromise = readTools(); // the header shows what was just checked
      if (current.declined) note(`${action}: ${DECLINED_TEXT}`);
      else note(code === 0 ? `${action}: finished.` : `${action}: failed${code === null ? '' : ` (exit code ${code})`}.`);
    })();
  }

  // ---- actions --------------------------------------------------------------
  let lastDeployWindowAt = 0;
  const requireNoJob = () => {
    if (jobRunning()) throw new ActionError(409, `Wait for the running job (${job.action}) to finish first.`);
  };
  const requireAppStopped = () => {
    if (app.child) throw new ActionError(409, 'Stop the app dev server first.');
  };
  const portsByName = (ports, key) => Object.fromEntries(ports.map((p) => [p.name, p[key]]));
  const requireStackStopped = (state) => {
    if (state.stack.state === 'external') {
      // The ports that were probed, which are not 4400 and 4200 when the stack had to move.
      const portOf = (name) => state.ports.find((p) => p.name === name).port;
      throw new ActionError(
        409,
        `A stack this console did not start is running (port ${portOf('hub')} or ${portOf('app')} is in use). Stop it where it was started first.`,
      );
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
        if (body.mode === 'full' && app.child) {
          throw new ActionError(409, 'Stop the app dev server first: the full stack starts its own.');
        }
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
        requireAppStopped();
        requireNoJob();
        startJob('pull', jobSteps(root).pull);
      },
    ],
    [
      'install',
      (body, state) => {
        requireStackStopped(state);
        requireAppStopped();
        requireNoJob();
        startJob('install', jobSteps(root).install);
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
        startJob('smoke', jobSteps(root).smoke.map((step) => ({ ...step, env: { ...step.env, ...env } })));
      },
    ],
    [
      'checks',
      () => {
        requireNoJob();
        startJob('checks', jobSteps(root).checks);
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
      'tools',
      () => {
        requireNoJob();
        startJob('tools', commandSteps(root).tools, { keepGoing: true });
      },
    ],
    [
      'app-start',
      (body, state) => {
        if (app.child) throw new ActionError(409, app.state === 'stopping' ? 'The app dev server is still stopping.' : 'The app dev server is already running.');
        if (stack.child && stack.mode === 'full') {
          throw new ActionError(409, 'The full stack already runs the app. Stop it, or start only the emulators, then start the app by itself.');
        }
        requireNoJob();
        if (!state.setup.rootDeps) throw new ActionError(409, 'The dependencies are not installed yet (node_modules has no Angular CLI). Run Install first.');
        const effective = portsByName(state.ports, 'port');
        if (state.ports.find((p) => p.name === 'app').open) {
          throw new ActionError(409, `Port ${effective.app} is already in use, so the app cannot start there. Find out what is using it, or free it.`);
        }
        const plan = appServePlan(effective, portsByName(state.ports, 'default'), fs.existsSync(files.remappedEnvironment));
        if (plan.missingEnvironment) {
          note(`The emulators moved to other ports, but ${REMAPPED_ENVIRONMENT} is missing: the app is started with its usual addresses and may not reach them.`);
        }
        startApp(plan);
        return { message: `Starting the app dev server on port ${plan.port}.` };
      },
    ],
    [
      'app-stop',
      () => {
        if (!app.child) throw new ActionError(409, 'The app dev server is not running.');
        if (app.state === 'stopping') throw new ActionError(409, 'The app dev server is already stopping.');
        requestAppStop();
      },
    ],
    [
      'port-find',
      (body, state) => {
        requireNoJob();
        const entries = state.ports.map(({ name, port }) => ({ name, port }));
        const numbers = [...new Set(entries.map((entry) => entry.port))];
        startJob('port-find', [
          {
            label: onWindows
              ? `Get-NetTCPConnection -State Listen  (ports ${numbers.join(', ')})`
              : `lsof -nP -iTCP -sTCP:LISTEN  (ports ${numbers.join(', ')})`,
            run: async (emit) => {
              const found = await findListeners(numbers);
              if (!found.ok) {
                emit(`Could not list the listening ports: ${found.error}`);
                return 1;
              }
              for (const { name, port } of entries) {
                const holders = found.listeners.filter((listener) => listener.port === port);
                const who = holders.length
                  ? holders.map((holder) => `${shownName(holder.name)} (pid ${Number(holder.pid)})`).join(', ')
                  : 'nothing is listening';
                emit(`${name.padEnd(10)} ${String(port).padEnd(6)} ${who}`);
              }
              return 0;
            },
          },
        ]);
      },
    ],
    [
      'port-free',
      async (body, state) => {
        // The request picks one of seven names. The port comes from the state, the PIDs from the system.
        const entry = typeof body.name === 'string' ? state.ports.find((p) => p.name === body.name) : undefined;
        if (!entry) throw new ActionError(400, `name must be one of ${STACK_PORTS.map((p) => p.name).join(', ')}.`);
        const { name } = entry;
        requireNoJob();
        // The ports file counts only while the stack that wrote it is alive (see portsFileHasLivePid);
        // otherwise the port is the default from firebase.json, which is no less a repository file.
        const portsText = readSmallFile(files.stackPorts, PORTS_FILE_LIMIT);
        const port = typeof portsText === 'string' && portsFileHasLivePid(portsText) ? entry.port : entry.default;
        if (port < FIRST_FREEABLE_PORT) {
          throw new ActionError(409, `Port ${port} (${name}) is below ${FIRST_FREEABLE_PORT}: those belong to the system, and the console never ends what holds one.`);
        }
        if (stack.child && (stack.mode === 'full' || name !== 'app')) {
          throw new ActionError(409, `The stack this console started is using port ${port}. Use Stop instead.`);
        }
        if (app.child && name === 'app') {
          throw new ActionError(409, `The app dev server this console started is using port ${port}. Use Stop app instead.`);
        }
        // By number, not by name: another name's port can be the very number the managed stack or app listens on.
        const managedPorts = new Set();
        for (const p of state.ports) {
          if ((stack.child && (stack.mode === 'full' || p.name !== 'app')) || (app.child && p.name === 'app')) {
            managedPorts.add(p.port);
            managedPorts.add(p.default);
          }
        }
        if (managedPorts.has(port)) {
          throw new ActionError(
            409,
            `Port ${port} is one that the ${stack.child ? 'stack' : 'app dev server'} this console started is using. Use ${stack.child ? 'Stop' : 'Stop app'} instead.`,
          );
        }
        const found = await findListeners([port]);
        if (!found.ok) throw new ActionError(409, `Could not look up what is using port ${port}: ${found.error}`);
        const holders = found.listeners.filter((listener) => listener.port === port && Number.isInteger(listener.pid));
        if (holders.length === 0) throw new ActionError(409, `Nothing is listening on port ${port} (${name}).`);
        const own = new Set([process.pid, process.ppid, stack.child?.pid, app.child?.pid, jobChild?.pid].filter(Number.isInteger));
        for (const { pid, name: holderName } of holders) {
          if (isWindowsSystemProcess(holderName)) {
            note(`port-free: port ${port} (${name}) is held by ${shownName(holderName)} (pid ${pid}), a Windows system program. It was not ended and no administrator prompt was raised.`);
            throw new ActionError(409, `Port ${port} is held by ${shownName(holderName)} (pid ${pid}), a Windows system program, which the console never ends.`);
          }
          if (own.has(pid)) {
            throw new ActionError(409, `Port ${port} is held by this console or by something it started (pid ${pid}). Use Stop or Quit instead.`);
          }
          if (UNTOUCHABLE_PIDS.includes(pid) || !isKillablePid(pid)) {
            throw new ActionError(409, `Port ${port} is held by the operating system itself (pid ${pid}), which the console never ends.`);
          }
        }
        const pids = [...new Set(holders.map((holder) => holder.pid))];
        const names = holders.map((holder) => `${shownName(holder.name)} (pid ${holder.pid})`).join(', ');
        const stillThere = async () => {
          const again = await findListeners([port]);
          return again.ok ? pids.filter((pid) => again.listeners.some((l) => l.port === port && l.pid === pid)) : pids;
        };
        const waitUntilFree = async (ms) => {
          const deadline = Date.now() + ms;
          for (;;) {
            const left = await stillThere();
            if (left.length === 0 || Date.now() >= deadline) return left;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        };
        startJob('port-free', [
          {
            label: onWindows ? pids.map((pid) => `taskkill /PID ${pid} /T /F`).join(' ; ') : pids.map((pid) => `kill ${pid}`).join(' ; '),
            run: async (emit, current) => {
              emit(`Port ${port} (${name}) is held by ${names}.`);
              let refused = false;
              if (onWindows) {
                for (const pid of pids) {
                  const result = await runTool(systemTool('taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { timeoutMs: 15_000 });
                  for (const line of `${result.stdout}\n${result.stderr}`.split(/\r?\n/)) if (line.trim()) emit(line.trim());
                  // Only "access denied" means administrator rights would help.
                  if (result.code === TASKKILL_ACCESS_DENIED) refused = true;
                  else if (result.code === TASKKILL_NO_SUCH_PROCESS) {
                    emit(`The process that opened port ${port} (pid ${pid}) has already ended, and a program it started still holds the port. Ending it needs no administrator rights: stop that program where it runs, or find it with Find ports.`);
                  }
                }
              } else {
                for (const pid of pids) {
                  try {
                    sendSignal(pid, 'SIGTERM');
                  } catch (err) {
                    if (err?.code === 'EPERM') {
                      refused = true;
                      emit(`pid ${pid} belongs to another user, so it was not ended (EPERM). In a terminal: sudo kill ${pid}`);
                    } else if (err?.code !== 'ESRCH') throw err;
                  }
                }
              }
              let left = await waitUntilFree(portFreeWaitMs);
              if (left.length && onWindows && refused) {
                // Windows refuses to end a program that runs as administrator. Ask for the right to.
                emit(`Windows refused: the program runs with administrator rights. Asking Windows for permission to end it... ${TASKBAR_PROMPT_HINT}`);
                const result = await elevate('kill', left);
                for (const line of result.lines) emit(line);
                if (result.status === 'declined') {
                  current.declined = true;
                  emit(DECLINED_TEXT);
                  return 0;
                }
                if (result.status === 'error') emit('The administrator step could not be started.');
                left = await waitUntilFree(portFreeWaitMs);
              } else if (left.length && !onWindows && !refused) {
                for (const pid of left) {
                  try {
                    sendSignal(pid, 'SIGKILL');
                  } catch {
                    // gone in the meantime, or not ours: the check below tells
                  }
                }
                left = await waitUntilFree(portFreeWaitMs);
              }
              if (left.length) {
                emit(`Port ${port} is still in use (pid ${left.join(', ')}).`);
                return 1;
              }
              emit(`Port ${port} is free.`);
              return 0;
            },
          },
        ]);
      },
    ],
    ...['ports-reserve', 'ports-unreserve'].map((action) => [
      action,
      (body, state) => {
        if (!onWindows) {
          throw new ActionError(409, 'This is a Windows-only step: only Windows hands ports to Hyper-V, WSL and Docker. Nothing to do on this system.');
        }
        requireNoJob();
        const reserve = action === 'ports-reserve';
        // The stack's default ports, from firebase.json: whole numbers, never a value from the request.
        const ports = [...new Set(state.ports.map((p) => p.default))];
        const verb = reserve ? 'add' : 'delete';
        startJob(action, [
          {
            label: `netsh interface ipv4 ${verb} excludedportrange protocol=tcp startport=<${ports.join('|')}> numberofports=1 store=persistent  (as administrator)`,
            run: async (emit, current) => {
              emit(`Asking Windows for administrator permission (answer the prompt). ${TASKBAR_PROMPT_HINT}`);
              const result = await elevate(reserve ? 'reserve' : 'unreserve', ports);
              for (const line of result.lines) emit(line);
              if (result.status === 'declined') {
                current.declined = true;
                emit(DECLINED_TEXT);
                return 0;
              }
              if (result.status === 'error') {
                emit('The administrator step could not be started; nothing was changed.');
                return 1;
              }
              if (reserve && result.lines.some((line) => line.includes('not changed'))) {
                emit('A port that was "not changed" is already reserved, or is taken for this session (by a program, or by Windows itself).');
                emit('For the second case: stop the stack, restart Windows, and press this button again before starting anything else.');
              }
              return result.exitCode ?? 1;
            },
          },
          {
            // Looking needs no administrator rights. Windows marks the ranges added this way with "*".
            label: 'netsh interface ipv4 show excludedportrange protocol=tcp',
            skipWhenDeclined: true,
            run: async (emit) => {
              const shown = await runTool(systemTool('netsh.exe'), ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], {
                timeoutMs: 15_000,
              });
              for (const line of `${shown.stdout}\n${shown.stderr}`.split(/\r?\n/)) if (line.trim()) emit(line.trimEnd());
              return shown.code;
            },
          },
        ]);
      },
    ]),
    ...['shortcut', 'shortcut-remove'].map((action) => [
      action,
      () => {
        if (!onWindows) throw new ActionError(409, 'Shortcuts are a Windows-only step. On this system, start the console with: yarn console');
        if (!fs.existsSync(files.shortcutScript)) throw new ActionError(409, 'scripts/console-shortcut.ps1 is not on this branch.');
        requireNoJob();
        startJob(action, commandSteps(root)[action]);
      },
    ]),
    ...Object.keys(TERMINAL_COMMANDS).map((action) => [
      action,
      async (body) => {
        const isDeploy = action === 'deploy-functions';
        if (isDeploy && body.confirm !== true) {
          throw new ActionError(400, 'confirm must be true to deploy the functions to production.');
        }
        if (isDeploy) {
          // A deploy must not package a tree that a pull, an install or a build is rewriting.
          requireNoJob();
          // Taken before the first await, so a burst of requests opens one window, not twenty.
          if (Date.now() - lastDeployWindowAt < DEPLOY_COOLDOWN_MS) {
            throw new ActionError(409, 'A deploy window was opened a moment ago. Look for it on the taskbar instead of opening another.');
          }
          lastDeployWindowAt = Date.now();
        }
        const command = terminalCommand(action, root, platform);
        const what = command.shown ? `running: ${command.shown}` : 'in the repository folder';
        try {
          if (command.via === 'tool') {
            // The answer comes from the helper's exit: the window it opened may inherit its pipes and keep them open.
            const result = await runTool(command.file, command.args, {
              cwd: root,
              env: { ...process.env, ...command.env },
              timeoutMs: TERMINAL_HELPER_TIMEOUT_MS,
              exitGraceMs: TERMINAL_HELPER_GRACE_MS,
            });
            if (result.code !== 0) {
              throw new ActionError(409, `Could not open a PowerShell window${firstLine(result.stderr) ? `: ${firstLine(result.stderr)}` : '.'}`);
            }
          } else if (!(await launch(command.file, command.args, { cwd: root }))) {
            throw new ActionError(
              409,
              command.shown ? `Could not open a terminal window. Run it yourself in ${root}: ${command.shown}` : `Could not open a terminal window. The folder is ${root}`,
            );
          }
        } catch (err) {
          if (isDeploy) lastDeployWindowAt = 0; // nothing opened: the owner may press again
          throw err;
        }
        const message = `Opened a terminal window ${what}${command.via === 'tool' ? `. ${TASKBAR_WINDOW_HINT}` : ''}`;
        const ended = command.via === 'tool' ? message : `${message}.`; // the hint, when there is one, already ends the sentence
        note(command.shown ? `${ended} Its output is in that window, not in this log.` : ended);
        return { message };
      },
    ]),
    [
      'prod-logs',
      (body) => {
        // The name is looked up in the constant list; the constant, not the request's text, is what is run.
        const fn = PROD_FUNCTIONS.find((name) => name === body.fn);
        if (!fn) throw new ActionError(400, `fn must be one of ${PROD_FUNCTIONS.join(', ')}.`);
        requireNoJob();
        startJob('prod-logs', commandSteps(root)['prod-logs'][fn]);
      },
    ],
    [
      'quit',
      async () => {
        await Promise.all([stopAppAndWait(), stopStackAndWait()]);
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
      if (denied.notice) {
        // Somebody followed a link here (the docs on github.com have one): plain words, not JSON.
        sendBody(res, denied.status, 'text/plain; charset=utf-8', CROSS_SITE_NOTICE, {
          Connection: 'close',
          'Cross-Origin-Opener-Policy': 'same-origin',
        });
      } else {
        sendJson(res, denied.status, { ok: false, error: denied.error }, { Connection: 'close' });
      }
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
      // The opener policy leaves a page that opened this window no handle on it.
      sendBody(res, 200, 'text/html; charset=utf-8', html, {
        'Content-Security-Policy': PAGE_CSP,
        'Cross-Origin-Opener-Policy': 'same-origin',
      });
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
      const payload = JSON.stringify({
        ok: true,
        ...(typeof result.message === 'string' ? { message: result.message } : {}),
        state: await buildState(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
      // "quit" answers first and exits once the answer is on its way.
      res.end(payload, result.quit ? () => exit('quit') : undefined);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found.' });
  }

  // ---- lifetime -------------------------------------------------------------
  let closing = null;

  /** Stop the stack gracefully, end the app dev server and a running job, then stop listening. */
  function close() {
    if (closing) return closing;
    closing = (async () => {
      clearInterval(idleTimer);
      killTree(jobChild);
      // Both at once: the app's tree is ended while the stack saves its data.
      await Promise.all([stopAppAndWait(), stopStackAndWait()]);
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
        if (!stack.child && !app.child && !jobRunning() && now - lastApiRequest >= idleExitMs) {
          note('Nobody has used the console for a while and nothing is running: exiting.');
          exit('idle');
        }
      }, idleTickMs)
    : null;

  return { server, token, close, endStack, log: note, state: buildState };
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
  // Windows looks for a bare program name in the working directory, which is
  // the repository, before PATH. With this set, neither Node (22 and newer)
  // nor cmd.exe does, and every child inherits it: yarn and npm in the jobs,
  // and everything scripts/local-dev.mjs starts. See also pathTool().
  if (IS_WINDOWS) process.env.NoDefaultCurrentDirectoryInExePath = '1';

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
      if (err.code === 'EACCES') {
        // Windows reserves blocks of ports per boot (Hyper-V, WSL, Docker); the console's own can be in one.
        out.error(
          `Windows may have reserved port ${opts.port} for this session. Use another one: set OMNITASK_CONSOLE_PORT, or pass --port.`,
        );
      }
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
  let hurrying = false;
  const stop = (why, exitCode = 0) => {
    if (stopping) {
      // Second Ctrl+C: leave without waiting for the full stop. Elsewhere than
      // Windows that can be at once: the stack has its own process group,
      // notices the closed channel and finishes shutting down by itself.
      // On Windows it cannot. The stack is ended together with this process
      // (Node keeps a child that is not detached in a job that dies with its
      // parent), in the middle of its shutdown, and the emulators it started
      // can be left holding their ports. So the stack gets a few seconds to
      // finish, then its whole tree is ended, and only then does this exit.
      // A third Ctrl+C leaves at once.
      if (!IS_WINDOWS || hurrying) process.exit(1);
      hurrying = true;
      out.log(`Asked to stop again: the stack gets ${HURRY_GRACE_MS / 1000} s to finish, then it is ended.`);
      const leave = () => process.exit(1);
      consoleServer.endStack(HURRY_GRACE_MS).then(leave, leave);
      return;
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
