/**
 * Tests for scripts/launch-console.mjs.
 *
 *   node --test scripts/launch-console.test.mjs
 *
 * Everything runs against a throwaway folder that stands in for the repository
 * and a server on an ephemeral loopback port. The real stack is never started:
 * scripts/local-dev.mjs and functions/scripts/ai-smoke.mjs are replaced by the
 * small stand-ins below, and the stack's own ports are never probed for real.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  APP_ID,
  DEFAULT_MODEL,
  browserKindFromProgId,
  createConsoleServer,
  createGuard,
  defaultJobSteps,
  editorCommand,
  folderCommand,
  openBrowser,
  parseArgs,
  parseEnvLocal,
  parseRegValue,
  parseSecretState,
  pingConsole,
  redact,
  resolveInside,
  rewriteEnvLocal,
  stripAnsi,
  windowsBrowserCandidates,
  wrapPage,
} from './launch-console.mjs';

const LAUNCHER = fileURLToPath(new URL('./launch-console.mjs', import.meta.url));
const IS_WINDOWS = process.platform === 'win32';
const ESC = '\u001b';
const REDACTED = 'sk-ant-\u2026redacted';
/** Shaped like a real key, so the pattern must catch it. */
const PATTERN_KEY = 'sk-ant-api03-AbCdEfGh_1234-5678ijkl';
/** Not shaped like a key: only redaction by value can catch it. */
const ODD_KEY = 'local-test-key-0123456789-not-anthropic-shaped';

// Stand-in for scripts/local-dev.mjs: prints the same "up" line, leaks a key on
// stderr (to prove the redactor runs), and exits when asked over IPC.
const FAKE_STACK = `
const emulatorsOnly = process.argv.includes('--emulators-only');
const stubborn = process.env.FAKE_STACK_STUBBORN === '1';
console.log('\\u001b[36m[dev:local]\\u001b[0m Preflight checks...');
console.error('debug: using ${PATTERN_KEY} for requests');
process.on('message', (m) => {
  if (!m || m.type !== 'shutdown') return;
  if (stubborn) { console.log('[dev:local] ignoring the shutdown request'); return; }
  console.log('[dev:local] Shutting down...');
  process.exit(0);
});
setTimeout(() => {
  console.log(emulatorsOnly
    ? '\\n\\u001b[32mEmulators are up.\\u001b[0m  Emulator UI: http://127.0.0.1:4000'
    : '\\n\\u001b[32mOmniTask local stack is up.\\u001b[0m');
}, 120);
setInterval(() => {}, 1000);
`;

// Stand-in for functions/scripts/ai-smoke.mjs: prints what it was given, waits
// while a "hold" file exists, fails when a "fail" file exists.
const FAKE_SMOKE = `
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
console.log('key=' + process.env.ANTHROPIC_API_KEY);
console.log('model=' + (process.env.ANTHROPIC_MODEL ?? 'default'));
const wait = () => {
  if (fs.existsSync(path.join(dir, 'hold'))) return setTimeout(wait, 20);
  if (fs.existsSync(path.join(dir, 'fail'))) { console.error('ai-smoke FAILED'); process.exit(3); }
  console.log('ai-smoke OK');
};
wait();
`;

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

function tempDir(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tempDirs.push(dir);
  return dir;
}

function write(root, relative, content) {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

/** A folder with just enough of the repository layout for the console to serve. */
function makeRoot({ page = true, localDev = true } = {}) {
  const root = tempDir('omnitask-console-test-');
  write(root, 'package.json', JSON.stringify({ name: 'omni-task', version: '9.8.7' }));
  if (page) write(root, 'scripts/console/console.html', '<title>Console</title>\n<main id="app">PAGE-BODY-1</main>\n<script>/* page */</script>\n');
  if (localDev) write(root, 'scripts/local-dev.mjs', FAKE_STACK);
  write(root, 'functions/.secret.local.example', '# example\nANTHROPIC_API_KEY=placeholder\n');
  write(root, 'functions/scripts/ai-smoke.mjs', FAKE_SMOKE);
  return root;
}

function request(port, { method = 'GET', path: target = '/', headers = {}, body, chunked = false } = {}) {
  return new Promise((resolve, reject) => {
    const allHeaders = { host: `127.0.0.1:${port}`, ...headers };
    if (body !== undefined && !chunked) allHeaders['content-length'] = Buffer.byteLength(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: target, headers: allHeaders, setHost: false, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // not JSON
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json, buffer });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function waitFor(check, what, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** A listening console over a fresh folder, with every outside effect replaced. */
async function startConsole({ rootOptions, root = makeRoot(rootOptions), openPorts = [], ...serverOptions } = {}) {
  const launched = [];
  const consoleServer = createConsoleServer({
    root,
    port: 0,
    probePort: async (port) => openPorts.includes(port),
    probeTools: async () => ({ node: process.version, java: '21.0.4', yarn: '1.22.22' }),
    launch: async (file, args) => {
      launched.push([file, args]);
      return true;
    },
    ...serverOptions,
  });
  await new Promise((resolve) => consoleServer.server.listen(0, '127.0.0.1', resolve));
  const port = consoleServer.server.address().port;
  const authed = (headers = {}) => ({ 'x-console-token': consoleServer.token, ...headers });
  const api = {
    get: (target, headers) => request(port, { path: target, headers: authed(headers) }),
    act: (body, headers) =>
      request(port, {
        method: 'POST',
        path: '/api/action',
        headers: authed({ 'content-type': 'application/json', ...headers }),
        body: JSON.stringify(body),
      }),
    state: async () => (await api.get('/api/state')).json,
    logText: async () => {
      const lines = [];
      let after = 0;
      for (;;) {
        const page = (await api.get(`/api/log?after=${after}`)).json;
        if (!page.lines.length) break;
        lines.push(...page.lines);
        after = page.next;
      }
      return lines.map((line) => `${line.src}|${line.text}`).join('\n');
    },
  };
  return { consoleServer, port, root, token: consoleServer.token, api, launched, openPorts };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('stripAnsi', () => {
  test('removes colours, cursor moves and hyperlinks', () => {
    assert.equal(stripAnsi(`${ESC}[36m[dev:local]${ESC}[0m ready`), '[dev:local] ready');
    assert.equal(stripAnsi(`${ESC}[2K${ESC}[1Gprogress 50%`), 'progress 50%');
    assert.equal(stripAnsi(`${ESC}]8;;http://x${ESC}\\link${ESC}]8;;${ESC}\\`), 'link');
    assert.equal(stripAnsi(`${ESC}]0;title\u0007text`), 'text');
    assert.equal(stripAnsi('plain [36m text'), 'plain [36m text');
  });

  test('an escape code inside a key cannot hide it from the redactor', () => {
    const split = `sk-ant-${ESC}[1mapi03-AbCdEfGh1234`;
    assert.equal(redact(stripAnsi(split)), REDACTED);
  });
});

describe('redact', () => {
  test('replaces Anthropic keys and nothing else', () => {
    assert.equal(redact(`key ${PATTERN_KEY} end`), `key ${REDACTED} end`);
    assert.equal(redact(`a=${PATTERN_KEY},b=${PATTERN_KEY}`), `a=${REDACTED},b=${REDACTED}`);
    assert.equal(redact('ANTHROPIC_API_KEY=placeholder'), 'ANTHROPIC_API_KEY=placeholder');
    assert.equal(redact('sk-ant-short'), 'sk-ant-short'); // fewer than 8 characters after the prefix
    assert.equal(redact('nothing secret here'), 'nothing secret here');
  });
});

describe('parseSecretState', () => {
  test('missing, placeholder and set', () => {
    assert.equal(parseSecretState(null), 'missing');
    assert.equal(parseSecretState(undefined), 'missing');
    assert.equal(parseSecretState(''), 'placeholder');
    assert.equal(parseSecretState('GOOGLE_CLIENT_ID=abc\n'), 'placeholder');
    assert.equal(parseSecretState('ANTHROPIC_API_KEY=\n'), 'placeholder');
    assert.equal(parseSecretState('ANTHROPIC_API_KEY=placeholder\r\n'), 'placeholder');
    assert.equal(parseSecretState('ANTHROPIC_API_KEY="placeholder"\n'), 'placeholder');
    assert.equal(parseSecretState('# ANTHROPIC_API_KEY=sk-ant-commented-out-1234\n'), 'placeholder');
    assert.equal(parseSecretState(`# note\nANTHROPIC_API_KEY=${PATTERN_KEY}\nOTHER=1\n`), 'set');
    assert.equal(parseSecretState(`ANTHROPIC_API_KEY="${PATTERN_KEY}"\r\n`), 'set');
  });
});

describe('parseEnvLocal', () => {
  test('defaults, overrides and quoting', () => {
    assert.deepEqual(parseEnvLocal(null), { model: DEFAULT_MODEL, realmail: false });
    assert.deepEqual(parseEnvLocal('ANTHROPIC_MODEL=claude-sonnet-5\nEMULATOR_SEND_REAL_EMAIL=true\n'), {
      model: 'claude-sonnet-5',
      realmail: true,
    });
    assert.deepEqual(parseEnvLocal('ANTHROPIC_MODEL="claude-haiku-4-5" # cheaper\r\nEMULATOR_SEND_REAL_EMAIL=false\r\n'), {
      model: 'claude-haiku-4-5',
      realmail: false,
    });
    assert.equal(parseEnvLocal('EMULATOR_SEND_REAL_EMAIL=TRUE\n').realmail, false); // the functions compare with "true"
  });
});

describe('rewriteEnvLocal', () => {
  test('changes only its two lines and keeps every other line', () => {
    const before = '# local overrides\nFOO=bar\nANTHROPIC_MODEL=claude-old-1\n\nBAZ="q u x"\nEMULATOR_SEND_REAL_EMAIL=true\n# end\n';
    assert.equal(
      rewriteEnvLocal(before, { model: 'claude-sonnet-5', realmail: false }),
      '# local overrides\nFOO=bar\nANTHROPIC_MODEL=claude-sonnet-5\n\nBAZ="q u x"\n# end\n',
    );
  });

  test('appends missing lines, drops the model line for the default model', () => {
    assert.equal(rewriteEnvLocal('FOO=bar\n', { model: 'claude-sonnet-5', realmail: true }), 'FOO=bar\nANTHROPIC_MODEL=claude-sonnet-5\nEMULATOR_SEND_REAL_EMAIL=true\n');
    assert.equal(rewriteEnvLocal('FOO=bar\nANTHROPIC_MODEL=claude-sonnet-5\n', { model: DEFAULT_MODEL, realmail: false }), 'FOO=bar\n');
    assert.equal(rewriteEnvLocal(null, { model: 'claude-sonnet-5', realmail: false }), 'ANTHROPIC_MODEL=claude-sonnet-5\n');
  });

  test('keeps Windows line endings and a missing final newline does not lose a line', () => {
    assert.equal(rewriteEnvLocal('A=1\r\nB=2', { model: DEFAULT_MODEL, realmail: true }), 'A=1\r\nB=2\r\nEMULATOR_SEND_REAL_EMAIL=true\r\n');
  });

  test('removes duplicate assignments and leaves commented ones alone', () => {
    const before = '#ANTHROPIC_MODEL=claude-note-1\nANTHROPIC_MODEL=claude-a-1\nexport ANTHROPIC_MODEL=claude-b-1\n';
    assert.equal(rewriteEnvLocal(before, { model: 'claude-c-1', realmail: false }), '#ANTHROPIC_MODEL=claude-note-1\nANTHROPIC_MODEL=claude-c-1\n');
  });

  test('returns null (delete the file) when nothing is left', () => {
    assert.equal(rewriteEnvLocal('ANTHROPIC_MODEL=claude-sonnet-5\nEMULATOR_SEND_REAL_EMAIL=true\n', { model: DEFAULT_MODEL, realmail: false }), null);
    assert.equal(rewriteEnvLocal('\n\n', { model: DEFAULT_MODEL, realmail: false }), null);
    assert.equal(rewriteEnvLocal(null, { model: DEFAULT_MODEL, realmail: false }), null);
    assert.equal(rewriteEnvLocal('# keep me\n', { model: DEFAULT_MODEL, realmail: false }), '# keep me\n');
  });
});

describe('wrapPage', () => {
  const info = { token: 'tok123', version: '1.2.3', platform: 'win32', repo: 'C:\\Antigravity\\OmniTask', port: 4310 };

  test('wraps the body and hands over the console object', () => {
    const html = wrapPage('<main>hello</main>', info);
    assert.ok(html.startsWith('<!doctype html><html lang="en"><head><meta charset="utf-8">'));
    assert.ok(html.includes('</head><body><main>hello</main></body></html>'));
    const json = /window\.__OMNITASK_CONSOLE__ = (.*);<\/script>/.exec(html)[1];
    assert.deepEqual(JSON.parse(json), info);
  });

  test('a value containing </script> or <!-- cannot end the script element', () => {
    const hostile = { ...info, repo: '/tmp/</script><script>alert(1)</script><!--', version: '<img src=x>' };
    const html = wrapPage('BODY', hostile);
    const head = html.slice(0, html.indexOf('</head>'));
    assert.equal(head.split('</script>').length, 2, 'exactly one closing script tag in the head');
    assert.ok(!head.includes('<!--'));
    assert.ok(!head.includes('<img'));
    assert.ok(head.includes('\\u003c/script>'));
    const json = /window\.__OMNITASK_CONSOLE__ = (.*);<\/script>/.exec(html)[1];
    assert.deepEqual(JSON.parse(json), hostile, 'the page still reads the original values');
  });
});

describe('resolveInside', () => {
  test('accepts an entry of the root, refuses climbing out and links', () => {
    const root = tempDir('omnitask-inside-');
    const outside = tempDir('omnitask-outside-');
    fs.mkdirSync(path.join(root, 'data'));
    fs.mkdirSync(path.join(root, 'src'));
    assert.equal(resolveInside(root, 'data'), path.join(root, 'data'));
    assert.equal(resolveInside(root, 'not-there-yet'), path.join(root, 'not-there-yet'));
    assert.equal(resolveInside(root, '..'), null);
    assert.equal(resolveInside(root, '.'), null);
    assert.equal(resolveInside(root, path.join('..', path.basename(outside))), null);
    assert.equal(resolveInside(root, outside), null);
    assert.equal(resolveInside(path.join(root, 'no-such-root'), 'data'), null);
    fs.symlinkSync(outside, path.join(root, 'link-out'), 'junction');
    fs.symlinkSync(path.join(root, 'src'), path.join(root, 'link-in'), 'junction');
    assert.equal(resolveInside(root, 'link-out'), null);
    assert.equal(resolveInside(root, 'link-in'), null, 'a link to another folder of the repository is refused too');
  });
});

describe('browser and OS helpers', () => {
  test('parseRegValue reads the value of a reg query line', () => {
    const key = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice';
    assert.equal(parseRegValue(`\r\n${key}\r\n    ProgId    REG_SZ    ChromeHTML\r\n\r\n`), 'ChromeHTML');
    assert.equal(
      parseRegValue('\r\nHKEY_LOCAL_MACHINE\\...\\App Paths\\chrome.exe\r\n    (Default)    REG_SZ    C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\r\n'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    );
    assert.equal(parseRegValue('    (Standard)    REG_SZ    "C:\\Apps\\msedge.exe"\r\n'), 'C:\\Apps\\msedge.exe');
    assert.equal(parseRegValue('ERROR: The system was unable to find the specified registry key or value.'), null);
    assert.equal(parseRegValue(''), null);
  });

  test('browserKindFromProgId maps the default browser', () => {
    assert.equal(browserKindFromProgId('ChromeHTML'), 'chrome');
    assert.equal(browserKindFromProgId('ChromeHTML.ABCDEF'), 'chrome');
    assert.equal(browserKindFromProgId('ChromeBHTML'), 'chrome');
    assert.equal(browserKindFromProgId('MSEdgeHTM'), 'edge');
    assert.equal(browserKindFromProgId('MSEdgeBHTML'), 'edge');
    assert.equal(browserKindFromProgId('FirefoxURL-308046B0AF4A39CB'), null);
    assert.equal(browserKindFromProgId(null), null);
  });

  test('windowsBrowserCandidates lists App Paths first, then the install folders', () => {
    const env = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' };
    assert.deepEqual(windowsBrowserCandidates('chrome', env, ['D:\\Chrome\\chrome.exe', null]), [
      'D:\\Chrome\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    ]);
    assert.deepEqual(windowsBrowserCandidates('edge', { 'ProgramFiles(x86)': 'C:\\Program Files (x86)' }), [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]);
  });

  test('editor and file-manager commands are fixed per platform', () => {
    assert.deepEqual(editorCommand('/r/f', 'darwin'), ['open', ['-t', '/r/f']]);
    assert.deepEqual(editorCommand('/r/f', 'linux'), ['xdg-open', ['/r/f']]);
    assert.deepEqual(folderCommand('/r', 'darwin'), ['open', ['/r']]);
    assert.deepEqual(folderCommand('/r', 'linux'), ['xdg-open', ['/r']]);
    assert.match(editorCommand('C:\\r\\f', 'win32')[0], /notepad\.exe$/i);
    assert.match(folderCommand('C:\\r', 'win32')[0], /explorer\.exe$/i);
  });

  test('openBrowser: "none" opens nothing; on Linux "app" runs the first Chromium on PATH with --app=', async (t) => {
    assert.equal(await openBrowser('http://127.0.0.1:4310/', 'none'), 'none');
    if (process.platform !== 'linux') return t.skip('the PATH lookup is the Linux branch');
    const bin = tempDir('omnitask-bin-');
    const record = path.join(bin, 'args.txt');
    const savedPath = process.env.PATH;
    try {
      // Only this folder is searched, so no real browser can be started by the test.
      process.env.PATH = bin;
      assert.equal(await openBrowser('http://127.0.0.1:4310/', 'app'), 'failed', 'no browser and no xdg-open');
      assert.equal(await openBrowser('http://127.0.0.1:4310/', 'default'), 'failed');
      fs.writeFileSync(path.join(bin, 'chromium'), `#!/bin/sh\necho "$@" > '${record}'\n`, { mode: 0o755 });
      fs.writeFileSync(path.join(bin, 'microsoft-edge'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
      assert.equal(await openBrowser('http://127.0.0.1:4310/', 'app'), 'app');
      const args = await waitFor(() => (fs.existsSync(record) ? fs.readFileSync(record, 'utf8').trim() : ''), 'the browser stand-in to run');
      assert.equal(args, '--app=http://127.0.0.1:4310/ --window-size=1180,900');
    } finally {
      process.env.PATH = savedPath;
    }
  });

  test('parseArgs', () => {
    assert.deepEqual(parseArgs([], {}), { port: 4310, browser: 'app', detach: false, idleExit: true, help: false });
    assert.deepEqual(parseArgs(['--port', '4311', '--browser', 'none', '--detach', '--no-idle-exit'], {}), {
      port: 4311,
      browser: 'none',
      detach: true,
      idleExit: false,
      help: false,
    });
    assert.equal(parseArgs(['--port=5000', '--browser=default'], {}).port, 5000);
    assert.equal(parseArgs([], { OMNITASK_CONSOLE_PORT: '4999' }).port, 4999);
    assert.equal(parseArgs(['--port', '4311'], { OMNITASK_CONSOLE_PORT: '4999' }).port, 4311);
    assert.throws(() => parseArgs(['--port', '0'], {}), /port number/);
    assert.throws(() => parseArgs(['--port', '70000'], {}), /port number/);
    assert.throws(() => parseArgs(['--port', '43x'], {}), /port number/);
    assert.throws(() => parseArgs(['--port'], {}), /needs a value/);
    assert.throws(() => parseArgs(['--browser', 'firefox'], {}), /app, default or none/);
    assert.throws(() => parseArgs(['--evil'], {}), /Unknown option/);
    assert.throws(() => parseArgs([], { OMNITASK_CONSOLE_PORT: 'abc' }), /OMNITASK_CONSOLE_PORT/);
  });

  test('the job command lists are the fixed ones', () => {
    const root = path.resolve('/repo');
    const fn = path.join(root, 'functions');
    const brief = (list) => list.map((step) => [step.file, step.args, step.cwd, Boolean(step.shim)]);
    const steps = defaultJobSteps(root);
    assert.deepEqual(Object.keys(steps).sort(), ['checks', 'install', 'pull', 'smoke']);
    assert.deepEqual(brief(steps.pull), [['git', ['pull', '--ff-only'], root, false]]);
    assert.deepEqual(brief(steps.install), [
      ['yarn', ['install'], root, true],
      ['npm', ['ci'], fn, true],
    ]);
    assert.deepEqual(brief(steps.smoke), [[process.execPath, [path.join(fn, 'scripts', 'ai-smoke.mjs')], fn, false]]);
    assert.deepEqual(brief(steps.checks), [
      ['npm', ['run', 'build'], fn, true],
      ['npm', ['test'], fn, true],
      ['yarn', ['lint'], root, true],
      ['yarn', ['build'], root, true],
      ['yarn', ['test', '--no-watch', '--no-progress', '--browsers=ChromeHeadless'], root, true],
    ]);
    for (const list of Object.values(steps)) {
      for (const step of list) {
        // The Windows shim path joins these with spaces, so none may contain one (or a shell character).
        if (step.shim) for (const part of [step.file, ...step.args]) assert.match(part, /^[A-Za-z0-9=_-]+$/);
        assert.equal(typeof step.label, 'string');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The guard, as a function
// ---------------------------------------------------------------------------

describe('createGuard', () => {
  const TOKEN = 'a'.repeat(48);
  const guard = createGuard({ port: 4310, token: TOKEN });
  const req = ({ method = 'GET', url = '/', headers = {} } = {}) => {
    const all = { host: '127.0.0.1:4310', ...headers };
    return { method, url, headers: all, rawHeaders: Object.entries(all).flat() };
  };
  const status = (r) => guard.check(r)?.status ?? null;

  test('Host must be this server on its loopback name', () => {
    assert.equal(status(req()), null);
    assert.equal(status(req({ headers: { host: 'localhost:4310' } })), null);
    for (const host of ['evil.example:4310', '127.0.0.1', '127.0.0.1:4311', 'localhost', 'LOCALHOST:4310', '127.0.0.1:4310.evil.example', '[::1]:4310', '0.0.0.0:4310', '']) {
      assert.equal(status(req({ headers: { host } })), 403, `Host: ${host}`);
    }
    assert.equal(status({ method: 'GET', url: '/', headers: {}, rawHeaders: [] }), 403, 'no Host header');
    const twice = req();
    twice.rawHeaders = ['Host', '127.0.0.1:4310', 'host', 'evil.example'];
    assert.equal(status(twice), 403, 'two Host headers');
  });

  test('an Origin header must be this server', () => {
    assert.equal(status(req({ headers: { origin: 'http://127.0.0.1:4310' } })), null);
    assert.equal(status(req({ headers: { origin: 'http://localhost:4310' } })), null);
    for (const origin of ['http://evil.example', 'https://127.0.0.1:4310', 'http://127.0.0.1:4311', 'http://127.0.0.1', 'null', '', 'http://127.0.0.1:4310, http://evil.example']) {
      assert.equal(status(req({ headers: { origin } })), 403, `Origin: ${origin}`);
    }
  });

  test('only GET and POST', () => {
    for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', 'TRACE']) {
      assert.equal(status(req({ method, url: '/api/ping' })), 405, method);
    }
  });

  test('the API needs the token, except ping', () => {
    assert.equal(status(req({ url: '/api/ping' })), null);
    assert.equal(status(req({ url: '/api/state' })), 401);
    assert.equal(status(req({ url: '/api/state?x=1' })), 401);
    assert.equal(status(req({ url: '/api/anything/else' })), 401);
    assert.equal(status(req({ url: '/api/state', headers: { 'x-console-token': 'b'.repeat(48) } })), 401);
    assert.equal(status(req({ url: '/api/state', headers: { 'x-console-token': TOKEN.slice(0, 47) } })), 401);
    assert.equal(status(req({ url: '/api/state', headers: { 'x-console-token': `${TOKEN}, ${TOKEN}` } })), 401);
    assert.equal(status(req({ url: '/api/state', headers: { 'x-console-token': TOKEN } })), null);
    assert.ok(!JSON.stringify(guard.check(req({ url: '/api/state' }))).includes(TOKEN));
  });

  test('a request the browser marks as coming from another site is refused even with the token', () => {
    const withToken = (site) => req({ url: '/api/state', headers: { 'x-console-token': TOKEN, 'sec-fetch-site': site } });
    assert.equal(status(withToken('cross-site')), 403);
    assert.equal(status(withToken('same-site')), 403);
    assert.equal(status(withToken('same-origin')), null);
    assert.equal(status(withToken('none')), null);
  });

  test('POST must be application/json and declare a small body', () => {
    const post = (headers) => req({ method: 'POST', url: '/api/action', headers: { 'x-console-token': TOKEN, ...headers } });
    assert.equal(status(post({ 'content-type': 'application/json' })), null);
    assert.equal(status(post({ 'content-type': 'Application/JSON; charset=utf-8' })), null);
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/json-patch+json', 'text/json']) {
      assert.equal(status(post({ 'content-type': type })), 415, type);
    }
    assert.equal(status(post({})), 415, 'no content type');
    assert.equal(status(post({ 'content-type': 'application/json', 'content-length': '16384' })), null);
    assert.equal(status(post({ 'content-type': 'application/json', 'content-length': '16385' })), 413);
  });

  test('accepts the port as a function', () => {
    let port = 5000;
    const moving = createGuard({ port: () => port, token: TOKEN });
    assert.equal(moving.check(req({ headers: { host: '127.0.0.1:5000' } })), null);
    port = 5001;
    assert.equal(moving.check(req({ headers: { host: '127.0.0.1:5000' } })).status, 403);
  });
});

// ---------------------------------------------------------------------------
// Over HTTP
// ---------------------------------------------------------------------------

describe('serving and the guard over HTTP', () => {
  let ctx;
  before(async () => {
    ctx = await startConsole();
    write(ctx.root, 'public/logo.ico', 'PUBLIC-ICON');
  });
  after(() => ctx.consoleServer.close());

  const BASE_HEADERS = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin',
  };
  const CSP =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; base-uri 'none'; " +
    "form-action 'none'; frame-ancestors 'none'";

  function assertBaseHeaders(res, label) {
    for (const [name, value] of Object.entries(BASE_HEADERS)) assert.equal(res.headers[name], value, `${label}: ${name}`);
    for (const name of Object.keys(res.headers)) assert.ok(!name.startsWith('access-control-'), `${label}: no CORS header (${name})`);
  }

  test('GET / wraps the page file, read fresh each time', async () => {
    const res = await request(ctx.port);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.equal(res.headers['content-security-policy'], CSP);
    assertBaseHeaders(res, '/');
    assert.ok(res.text.startsWith('<!doctype html>'));
    assert.ok(res.text.includes('<main id="app">PAGE-BODY-1</main>'));
    const injected = JSON.parse(/window\.__OMNITASK_CONSOLE__ = (.*);<\/script>/.exec(res.text)[1]);
    assert.deepEqual(injected, { token: ctx.token, version: '9.8.7', platform: process.platform, repo: ctx.root, port: ctx.port });

    write(ctx.root, 'scripts/console/console.html', '<main>PAGE-BODY-2</main>');
    assert.ok((await request(ctx.port, { path: '/?source=shortcut' })).text.includes('PAGE-BODY-2'));
    assert.equal((await request(ctx.port, { headers: { host: `localhost:${ctx.port}` } })).status, 200);
  });

  test('every response carries the security headers, and only / carries the CSP', async () => {
    const cases = [
      ['/api/ping', {}, 200],
      ['/favicon.ico', {}, 200],
      ['/nope', {}, 404],
      ['/api/state', {}, 401],
      ['/api/state', { 'x-console-token': ctx.token }, 200],
      ['/', { host: 'evil.example' }, 403],
    ];
    for (const [target, headers, status] of cases) {
      const res = await request(ctx.port, { path: target, headers });
      assert.equal(res.status, status, target);
      assertBaseHeaders(res, target);
      assert.equal(res.headers['content-security-policy'], undefined, `${target}: no CSP`);
    }
    const put = await request(ctx.port, { method: 'PUT', path: '/api/ping' });
    assert.equal(put.status, 405);
    assertBaseHeaders(put, 'PUT');
  });

  test('ping needs no token and says who is listening', async () => {
    const res = await request(ctx.port, { path: '/api/ping' });
    assert.deepEqual(res.json, { app: 'omnitask-console', version: '9.8.7' });
    assert.equal(APP_ID, 'omnitask-console');
  });

  test('the favicon prefers scripts/console/omnitask-console.ico over public/logo.ico', async () => {
    const first = await request(ctx.port, { path: '/favicon.ico' });
    assert.equal(first.status, 200);
    assert.equal(first.headers['content-type'], 'image/x-icon');
    assert.equal(first.text, 'PUBLIC-ICON');
    write(ctx.root, 'scripts/console/omnitask-console.ico', 'CONSOLE-ICON');
    assert.equal((await request(ctx.port, { path: '/favicon.ico' })).text, 'CONSOLE-ICON');
  });

  test('nothing else is served: unknown and traversal paths are 404', async () => {
    write(ctx.root, 'secret.txt', 'TOP-SECRET');
    const paths = [
      '/index.html',
      '/package.json',
      '/secret.txt',
      '/../secret.txt',
      '/..%2fsecret.txt',
      '/%2e%2e/secret.txt',
      '/favicon.ico/../../secret.txt',
      '/favicon.ico/',
      '/scripts/console/console.html',
      '/functions/.secret.local',
      '//evil.example/',
      '/api',
      '/API/ping',
    ];
    for (const target of paths) {
      const res = await request(ctx.port, { path: target });
      assert.equal(res.status, 404, target);
      assert.ok(!res.text.includes('TOP-SECRET'), target);
    }
    // Not a valid request target at all: the HTTP parser refuses it before any route is looked at.
    const malformed = await request(ctx.port, { path: '\\..\\secret.txt' });
    assert.equal(malformed.status, 400);
    assert.ok(!malformed.text.includes('TOP-SECRET'));
    assertBaseHeaders(malformed, 'malformed request');
    const authed = await request(ctx.port, { path: '/api/../secret.txt', headers: { 'x-console-token': ctx.token } });
    assert.equal(authed.status, 404);
  });

  test('a request under another Host name is refused (DNS rebinding)', async () => {
    for (const host of ['evil.example', `evil.example:${ctx.port}`, '127.0.0.1', `127.0.0.1:${ctx.port + 1}`]) {
      for (const target of ['/', '/api/ping', '/favicon.ico']) {
        const res = await request(ctx.port, { path: target, headers: { host } });
        assert.equal(res.status, 403, `${host} ${target}`);
        assert.ok(!res.text.includes(ctx.token));
      }
      const withToken = await request(ctx.port, { path: '/api/state', headers: { host, 'x-console-token': ctx.token } });
      assert.equal(withToken.status, 403, 'the token does not help under a wrong Host');
    }
  });

  test('a request from another origin is refused, with or without the token', async () => {
    for (const origin of ['http://evil.example', 'https://claude.ai', 'null', `http://127.0.0.1:${ctx.port + 1}`]) {
      assert.equal((await request(ctx.port, { headers: { origin } })).status, 403, origin);
      assert.equal((await request(ctx.port, { path: '/api/ping', headers: { origin } })).status, 403, origin);
      const post = await ctx.api.act({ action: 'open-folder' }, { origin });
      assert.equal(post.status, 403, origin);
    }
    assert.equal(ctx.launched.length, 0, 'nothing was started');
    const own = await ctx.api.get('/api/state', { origin: `http://127.0.0.1:${ctx.port}`, 'sec-fetch-site': 'same-origin' });
    assert.equal(own.status, 200);
    const crossSite = await ctx.api.get('/api/state', { 'sec-fetch-site': 'cross-site' });
    assert.equal(crossSite.status, 403);
  });

  test('the API refuses a missing or wrong token and never echoes the right one', async () => {
    const wrong = [undefined, '', 'nope', ctx.token.slice(1), `${ctx.token}0`, ctx.token.toUpperCase()];
    for (const candidate of wrong) {
      const headers = candidate === undefined ? {} : { 'x-console-token': candidate };
      for (const target of ['/api/state', '/api/log', '/api/log?after=0', '/api/unknown']) {
        const res = await request(ctx.port, { path: target, headers });
        assert.equal(res.status, 401, `${target} with ${candidate}`);
        assert.ok(!res.text.includes(ctx.token));
      }
      const post = await request(ctx.port, {
        method: 'POST',
        path: '/api/action',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'open-folder' }),
      });
      assert.equal(post.status, 401);
    }
    assert.equal(ctx.launched.length, 0, 'nothing was started');
    // The token is not accepted anywhere but the header.
    assert.equal((await request(ctx.port, { path: `/api/state?token=${ctx.token}` })).status, 401);
  });

  test('what a plain HTML form or a no-cors fetch can send never reaches an action', async () => {
    // No custom header is possible there, so no token...
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const res = await request(ctx.port, { method: 'POST', path: '/api/action', headers: { 'content-type': type }, body: '{"action":"open-folder"}' });
      assert.equal(res.status, 401, type);
    }
    // ...and even with the token those content types are refused.
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', undefined]) {
      const headers = { 'x-console-token': ctx.token };
      if (type) headers['content-type'] = type;
      const res = await request(ctx.port, { method: 'POST', path: '/api/action', headers, body: '{"action":"open-folder"}' });
      assert.equal(res.status, 415, String(type));
    }
    assert.equal(ctx.launched.length, 0, 'nothing was started');
  });

  test('other methods are refused and a preflight gets no CORS approval', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH', 'HEAD']) {
      const res = await request(ctx.port, { method, path: '/api/state', headers: { 'x-console-token': ctx.token } });
      assert.equal(res.status, 405, method);
    }
    const preflight = await request(ctx.port, {
      method: 'OPTIONS',
      path: '/api/action',
      headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-console-token,content-type' },
    });
    assert.equal(preflight.status, 403);
    assertBaseHeaders(preflight, 'preflight');
    const sameOriginPreflight = await request(ctx.port, { method: 'OPTIONS', path: '/api/action' });
    assert.equal(sameOriginPreflight.status, 405);
    assertBaseHeaders(sameOriginPreflight, 'OPTIONS');
    // Right method on the wrong route.
    assert.equal((await ctx.api.get('/api/action')).status, 405);
    const postState = await request(ctx.port, { method: 'POST', path: '/api/state', headers: { 'x-console-token': ctx.token, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(postState.status, 405);
  });

  test('a body over 16 KiB is refused, declared or streamed', async () => {
    const headers = { 'x-console-token': ctx.token, 'content-type': 'application/json' };
    const big = JSON.stringify({ action: 'open-folder', pad: 'x'.repeat(20 * 1024) });
    const declared = await request(ctx.port, { method: 'POST', path: '/api/action', headers, body: big });
    assert.equal(declared.status, 413);
    const streamed = await request(ctx.port, { method: 'POST', path: '/api/action', headers: { ...headers, 'transfer-encoding': 'chunked' }, body: big, chunked: true });
    assert.equal(streamed.status, 413);
    const overhead = Buffer.byteLength(JSON.stringify({ action: 'nope', pad: '' }));
    const exact = JSON.stringify({ action: 'nope', pad: 'x'.repeat(16 * 1024 - overhead) });
    assert.equal(Buffer.byteLength(exact), 16 * 1024);
    assert.equal((await request(ctx.port, { method: 'POST', path: '/api/action', headers, body: exact })).status, 400, 'exactly 16 KiB is read');

    // A huge body is cut off instead of being read to the end; the server stays up.
    const huge = 'x'.repeat(3 * 1024 * 1024);
    const outcome = await request(ctx.port, { method: 'POST', path: '/api/action', headers: { ...headers, 'transfer-encoding': 'chunked' }, body: huge, chunked: true }).then(
      (res) => res.status,
      () => 'connection closed',
    );
    assert.ok(outcome === 413 || outcome === 'connection closed', String(outcome));
    assert.equal((await request(ctx.port, { path: '/api/ping' })).status, 200);
    assert.equal(ctx.launched.length, 0, 'nothing was started');
  });

  test('a body that is not a JSON object is refused', async () => {
    const headers = { 'x-console-token': ctx.token, 'content-type': 'application/json' };
    for (const body of ['', '{', 'action=start', '[]', '["start"]', 'null', '"start"', '42', '{"action":"start"}{}']) {
      const res = await request(ctx.port, { method: 'POST', path: '/api/action', headers, body });
      assert.equal(res.status, 400, body);
      assert.equal(res.json.ok, false);
    }
  });

  test('an internal failure answers a plain 500 without details and the server keeps going', async () => {
    const broken = await startConsole({
      probePort: async () => {
        throw new Error(`probe exploded near ${PATTERN_KEY}`);
      },
    });
    try {
      const res = await broken.api.get('/api/state');
      assert.equal(res.status, 500);
      assert.equal(res.json.ok, false);
      assert.ok(!res.text.includes('exploded'), 'the cause stays in the log');
      assertBaseHeaders(res, '500');
      const log = (await broken.api.get('/api/log')).json.lines.map((line) => line.text).join('\n');
      assert.ok(log.includes('probe exploded'));
      assert.ok(!log.includes(PATTERN_KEY) && !log.includes(broken.token));
      assert.equal((await request(broken.port, { path: '/api/ping' })).status, 200);
    } finally {
      await broken.consoleServer.close();
    }
  });

  test('a missing page file gives a plain 500 that names it', async () => {
    const bare = await startConsole({ rootOptions: { page: false } });
    try {
      const res = await request(bare.port);
      assert.equal(res.status, 500);
      assert.match(res.headers['content-type'], /^text\/plain/);
      assert.ok(res.text.includes('scripts/console/console.html'));
      assert.ok(!res.text.includes(bare.token));
      assertBaseHeaders(res, '500');
      assert.equal((await request(bare.port, { path: '/favicon.ico' })).status, 404, 'no icon file at all');
      assert.equal((await request(bare.port, { path: '/api/ping' })).status, 200);
    } finally {
      await bare.consoleServer.close();
    }
  });
});

describe('GET /api/state', () => {
  test('has the documented shape and follows the files on disk', async () => {
    const ctx = await startConsole({ rootOptions: { localDev: false } });
    try {
      const res = await ctx.api.get('/api/state');
      assert.equal(res.status, 200);
      const s = res.json;
      assert.deepEqual(Object.keys(s), ['console', 'git', 'tools', 'setup', 'stack', 'ports', 'job', 'logSeq']);
      assert.deepEqual(Object.keys(s.console), ['version', 'pid', 'port', 'platform', 'repo', 'startedAt']);
      assert.equal(s.console.version, '9.8.7');
      assert.equal(s.console.pid, process.pid);
      assert.equal(s.console.port, ctx.port);
      assert.equal(s.console.platform, process.platform);
      assert.equal(s.console.repo, ctx.root);
      assert.ok(!Number.isNaN(Date.parse(s.console.startedAt)));
      // The temp folder is not a git repository: every field is null rather than missing.
      assert.deepEqual(s.git, { branch: null, head: null, dirty: null, upstream: null, behind: null, ahead: null });
      assert.deepEqual(s.tools, { node: process.version, java: '21.0.4', yarn: '1.22.22' });
      assert.deepEqual(s.setup, {
        rootDeps: false,
        functionsDeps: false,
        functionsBuilt: false,
        secretFile: 'missing',
        hasLocalDev: false,
        env: { model: 'claude-opus-5-5', realmail: false },
        savedData: false,
      });
      assert.deepEqual(s.stack, { state: 'stopped', mode: null, pid: null, since: null, lastExit: null });
      assert.deepEqual(
        s.ports,
        [
          [4200, 'app'],
          [9099, 'auth'],
          [8080, 'firestore'],
          [9199, 'storage'],
          [5001, 'functions'],
          [4000, 'ui'],
          [4400, 'hub'],
        ].map(([port, name]) => ({ port, name, open: false })),
      );
      assert.equal(s.job, null);
      assert.equal(typeof s.logSeq, 'number');

      write(ctx.root, 'node_modules/@angular/cli/bin/ng.js', '');
      write(ctx.root, 'functions/node_modules/.bin/firebase-functions', '');
      write(ctx.root, 'functions/node_modules/@anthropic-ai/sdk/package.json', '{}');
      write(ctx.root, 'functions/node_modules/typescript/bin/tsc', '');
      write(ctx.root, 'functions/lib/index.js', '');
      write(ctx.root, 'functions/.secret.local', 'ANTHROPIC_API_KEY=placeholder\n');
      write(ctx.root, 'functions/.env.local', 'ANTHROPIC_MODEL=claude-sonnet-5\nEMULATOR_SEND_REAL_EMAIL=true\n');
      write(ctx.root, 'scripts/local-dev.mjs', FAKE_STACK);
      fs.mkdirSync(path.join(ctx.root, '.emulator-data'));
      assert.deepEqual((await ctx.api.state()).setup, {
        rootDeps: true,
        functionsDeps: true,
        functionsBuilt: true,
        secretFile: 'placeholder',
        hasLocalDev: true,
        env: { model: 'claude-sonnet-5', realmail: true },
        savedData: true,
      });

      write(ctx.root, 'functions/.secret.local', `ANTHROPIC_API_KEY=${PATTERN_KEY}\nGOOGLE_CLIENT_SECRET=${ODD_KEY}\n`);
      const withKey = await ctx.api.get('/api/state');
      assert.equal(withKey.json.setup.secretFile, 'set');
      assert.ok(!withKey.text.includes(PATTERN_KEY), 'the key is never part of the state');
      assert.ok(!withKey.text.includes('sk-ant-'));
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('reads branch, head, dirty count and upstream distance from git without fetching', async (t) => {
    const root = makeRoot();
    const git = (args, cwd = root) =>
      new Promise((resolve) => {
        const child = spawn('git', args, {
          cwd,
          stdio: 'ignore',
          env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_SYSTEM: os.devNull },
        });
        child.on('error', () => resolve(null));
        child.on('exit', (code) => resolve(code));
      });
    if ((await git(['init', '-q', '-b', 'feature/x'])) !== 0) return t.skip('git is not available');
    await git(['add', '-A']);
    assert.equal(await git(['commit', '-q', '-m', 'one', '--no-gpg-sign']), 0);
    // A local "remote" so there is an upstream to compare with, no network involved.
    const remote = tempDir('omnitask-remote-');
    assert.equal(await git(['init', '-q', '--bare', remote]), 0);
    await git(['remote', 'add', 'origin', remote]);
    assert.equal(await git(['push', '-q', '-u', 'origin', 'feature/x']), 0);
    write(root, 'two.txt', '2');
    await git(['add', '-A']);
    assert.equal(await git(['commit', '-q', '-m', 'two', '--no-gpg-sign']), 0);
    write(root, 'untracked.txt', 'u');

    const ctx = await startConsole({ root });
    try {
      const s = await ctx.api.state();
      assert.equal(s.git.branch, 'feature/x');
      assert.match(s.git.head, /^[0-9a-f]{7,12}$/);
      assert.equal(s.git.dirty, 1);
      assert.equal(s.git.upstream, 'origin/feature/x');
      assert.equal(s.git.ahead, 1);
      assert.equal(s.git.behind, 0);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('reports "external" when the hub or app port is open and this console has no stack', async () => {
    const ctx = await startConsole({ openPorts: [4400, 9099] });
    try {
      const s = await ctx.api.state();
      assert.equal(s.stack.state, 'external');
      assert.equal(s.stack.pid, null);
      assert.deepEqual(s.ports.filter((p) => p.open).map((p) => p.name), ['auth', 'hub']);
      for (const body of [{ action: 'start', mode: 'full' }, { action: 'pull' }, { action: 'install' }, { action: 'reset-data', confirm: true }]) {
        const res = await ctx.api.act(body);
        assert.equal(res.status, 409, body.action);
        assert.match(res.json.error, /did not start/);
      }
      const stop = await ctx.api.act({ action: 'stop' });
      assert.equal(stop.status, 409, 'the console only stops what it started');
    } finally {
      await ctx.consoleServer.close();
    }
  });
});

describe('GET /api/log', () => {
  test('pages forward 800 lines at a time and reports dropped lines', async () => {
    const ctx = await startConsole();
    try {
      const empty = (await ctx.api.get('/api/log')).json;
      assert.deepEqual(empty, { lines: [], next: 0, dropped: false });

      for (let i = 1; i <= 1000; i++) ctx.consoleServer.log(`line ${i}`);
      const first = (await ctx.api.get('/api/log?after=0')).json;
      assert.equal(first.lines.length, 800);
      assert.equal(first.dropped, false);
      assert.equal(first.next, 800);
      assert.deepEqual(Object.keys(first.lines[0]), ['seq', 't', 'src', 'text']);
      assert.deepEqual([first.lines[0].seq, first.lines[0].src, first.lines[0].text], [1, 'console', 'line 1']);
      assert.ok(!Number.isNaN(Date.parse(first.lines[0].t)));
      const second = (await ctx.api.get(`/api/log?after=${first.next}`)).json;
      assert.equal(second.lines.length, 200);
      assert.equal(second.lines[0].seq, 801);
      assert.equal(second.next, 1000);
      assert.deepEqual((await ctx.api.get('/api/log?after=1000')).json, { lines: [], next: 1000, dropped: false });
      assert.deepEqual((await ctx.api.get('/api/log?after=999999')).json, { lines: [], next: 1000, dropped: false });
      assert.equal((await ctx.api.state()).logSeq, 1000);

      // Past 5000 lines the oldest are gone.
      for (let i = 1001; i <= 5300; i++) ctx.consoleServer.log(`line ${i}`);
      const stale = (await ctx.api.get('/api/log?after=100')).json;
      assert.equal(stale.dropped, true);
      assert.equal(stale.lines.length, 800);
      assert.equal(stale.lines[0].seq, 301);
      assert.equal(stale.lines[0].text, 'line 301');
      const justInside = (await ctx.api.get('/api/log?after=300')).json;
      assert.equal(justInside.dropped, false);
      assert.equal(justInside.lines[0].seq, 301);
      let total = 0;
      let after = 0;
      for (;;) {
        const page = (await ctx.api.get(`/api/log?after=${after}`)).json;
        if (!page.lines.length) break;
        assert.ok(page.lines.length <= 800);
        total += page.lines.length;
        after = page.next;
      }
      assert.equal(total, 5000);
      assert.equal(after, 5300);

      for (const bad of ['-1', 'abc', '1.5', '1e3', ' 1', '']) {
        assert.equal((await ctx.api.get(`/api/log?after=${encodeURIComponent(bad)}`)).status, 400, `after=${bad}`);
      }
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('lines are stripped of escape codes, redacted and capped at 2000 characters', async () => {
    const ctx = await startConsole();
    try {
      ctx.consoleServer.log(`${ESC}[31mred${ESC}[0m and a key ${PATTERN_KEY}`);
      ctx.consoleServer.log('y'.repeat(5000));
      ctx.consoleServer.log(`${'z'.repeat(1990)}${PATTERN_KEY}`);
      const { lines } = (await ctx.api.get('/api/log')).json;
      assert.equal(lines[0].text, `red and a key ${REDACTED}`);
      assert.equal(lines[1].text.length, 2000);
      assert.equal(lines[2].text.length, 2000);
      assert.ok(!lines[2].text.includes('api03'), 'a key cut by the cap does not leak a piece');
    } finally {
      await ctx.consoleServer.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

describe('POST /api/action', () => {
  let ctx;
  before(async () => {
    ctx = await startConsole();
  });
  after(() => ctx.consoleServer.close());

  test('an unknown action is a 400, whatever it is called', async () => {
    for (const body of [{}, { action: 'rm -rf' }, { action: 'START' }, { action: '__proto__' }, { action: 'constructor' }, { action: 'toString' }, { action: 42 }, { action: ['start'] }, { action: null }, { cmd: 'start' }]) {
      const res = await ctx.api.act(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(Object.keys(res.json), ['ok', 'error']);
      assert.equal(res.json.ok, false);
    }
  });

  test('start validates its mode and its preconditions', async () => {
    for (const mode of [undefined, 'FULL', 'both', '--emulators-only', 1, true, ['full']]) {
      assert.equal((await ctx.api.act({ action: 'start', mode })).status, 400, String(mode));
    }
    const bare = await startConsole({ rootOptions: { localDev: false } });
    try {
      const res = await bare.api.act({ action: 'start', mode: 'full' });
      assert.equal(res.status, 409);
      assert.match(res.json.error, /local-dev\.mjs/);
      assert.equal((await bare.api.state()).stack.state, 'stopped');
    } finally {
      await bare.consoleServer.close();
    }
  });

  test('stop is refused when nothing is running', async () => {
    const res = await ctx.api.act({ action: 'stop' });
    assert.equal(res.status, 409);
    assert.equal(res.json.ok, false);
    assert.equal(typeof res.json.error, 'string');
  });

  test('smoke needs a real key and built functions', async () => {
    assert.equal((await ctx.api.act({ action: 'smoke' })).status, 409, 'no secret file');
    write(ctx.root, 'functions/.secret.local', 'ANTHROPIC_API_KEY=placeholder\n');
    const placeholder = await ctx.api.act({ action: 'smoke' });
    assert.equal(placeholder.status, 409);
    assert.match(placeholder.json.error, /ANTHROPIC_API_KEY/);
    write(ctx.root, 'functions/.secret.local', `ANTHROPIC_API_KEY=${PATTERN_KEY}\n`);
    const notBuilt = await ctx.api.act({ action: 'smoke' });
    assert.equal(notBuilt.status, 409);
    assert.match(notBuilt.json.error, /built/);
    assert.ok(!notBuilt.text.includes(PATTERN_KEY));
    assert.equal((await ctx.api.state()).job, null);
    fs.rmSync(path.join(ctx.root, 'functions', '.secret.local'));
  });

  test('set-env validates its arguments', async () => {
    const bad = [
      { model: 'gpt-4' },
      { model: 'claude-' },
      { model: 'claude-x' },
      { model: 'Claude-Opus-5-5' },
      { model: 'claude-opus-5-5\nEVIL=1' },
      { model: 'claude-opus-5-5\n' },
      { model: ' claude-opus-5-5' },
      { model: 'claude-opus-5-5 --flag' },
      { model: 'claude-opus-5-5;rm' },
      { model: `claude-${'a'.repeat(41)}` },
      { model: 42 },
      { model: ['claude-opus-5-5'] },
      { model: 'claude-sonnet-5', realmail: 'true' },
      { model: 'claude-sonnet-5', realmail: 1 },
      { realmail: null },
      {},
    ];
    for (const args of bad) {
      const res = await ctx.api.act({ action: 'set-env', ...args });
      assert.equal(res.status, 400, JSON.stringify(args));
    }
    assert.ok(!fs.existsSync(path.join(ctx.root, 'functions', '.env.local')), 'nothing was written');
  });

  test('set-env rewrites only its lines and removes the file when it ends up empty', async () => {
    const envFile = path.join(ctx.root, 'functions', '.env.local');
    let res = await ctx.api.act({ action: 'set-env', model: 'claude-sonnet-5', realmail: true });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.deepEqual(res.json.state.setup.env, { model: 'claude-sonnet-5', realmail: true });
    assert.equal(fs.readFileSync(envFile, 'utf8'), 'ANTHROPIC_MODEL=claude-sonnet-5\nEMULATOR_SEND_REAL_EMAIL=true\n');

    fs.writeFileSync(envFile, '# mine\nOTHER=keep me\nANTHROPIC_MODEL=claude-sonnet-5\nEMULATOR_SEND_REAL_EMAIL=true\n');
    res = await ctx.api.act({ action: 'set-env', model: 'claude-opus-5-5', realmail: true });
    assert.equal(fs.readFileSync(envFile, 'utf8'), '# mine\nOTHER=keep me\nEMULATOR_SEND_REAL_EMAIL=true\n');
    assert.deepEqual(res.json.state.setup.env, { model: 'claude-opus-5-5', realmail: true });

    // One argument alone leaves the other setting as it is.
    res = await ctx.api.act({ action: 'set-env', model: 'claude-haiku-4-5' });
    assert.equal(fs.readFileSync(envFile, 'utf8'), '# mine\nOTHER=keep me\nEMULATOR_SEND_REAL_EMAIL=true\nANTHROPIC_MODEL=claude-haiku-4-5\n');

    fs.writeFileSync(envFile, 'ANTHROPIC_MODEL=claude-sonnet-5\nEMULATOR_SEND_REAL_EMAIL=true\n');
    res = await ctx.api.act({ action: 'set-env', model: 'claude-opus-5-5', realmail: false });
    assert.equal(res.status, 200);
    assert.ok(!fs.existsSync(envFile), 'an empty overrides file is removed');
    assert.deepEqual(res.json.state.setup.env, { model: 'claude-opus-5-5', realmail: false });
  });

  test('open-key creates the key file from the example and opens it with a fixed command', async () => {
    const secret = path.join(ctx.root, 'functions', '.secret.local');
    assert.ok(!fs.existsSync(secret));
    ctx.launched.length = 0;
    const res = await ctx.api.act({ action: 'open-key', path: 'C:\\Windows\\System32\\drivers\\etc\\hosts', file: '/etc/passwd' });
    assert.equal(res.status, 200);
    assert.equal(fs.readFileSync(secret, 'utf8'), '# example\nANTHROPIC_API_KEY=placeholder\n');
    assert.deepEqual(ctx.launched, [editorCommand(secret)], 'the path comes from the repository, not from the request');
    assert.equal(res.json.state.setup.secretFile, 'placeholder');

    // An existing file is opened as it is, never overwritten.
    fs.writeFileSync(secret, `ANTHROPIC_API_KEY=${PATTERN_KEY}\n`);
    const again = await ctx.api.act({ action: 'open-key' });
    assert.equal(again.status, 200);
    assert.equal(fs.readFileSync(secret, 'utf8'), `ANTHROPIC_API_KEY=${PATTERN_KEY}\n`);
    assert.ok(!again.text.includes(PATTERN_KEY));
    fs.rmSync(secret);
  });

  test('open-env creates an empty overrides file; open-folder opens the repository', async () => {
    const envFile = path.join(ctx.root, 'functions', '.env.local');
    ctx.launched.length = 0;
    assert.equal((await ctx.api.act({ action: 'open-env' })).status, 200);
    assert.equal(fs.readFileSync(envFile, 'utf8'), '');
    assert.equal((await ctx.api.act({ action: 'open-folder', dir: '/' })).status, 200);
    assert.deepEqual(ctx.launched, [editorCommand(envFile), folderCommand(ctx.root)]);
    fs.rmSync(envFile);
  });

  test('a program that cannot be opened is reported, not ignored', async () => {
    const noEditor = await startConsole({ launch: async () => false });
    try {
      const res = await noEditor.api.act({ action: 'open-folder' });
      assert.equal(res.status, 409);
      assert.ok(res.json.error.includes(noEditor.root));
    } finally {
      await noEditor.consoleServer.close();
    }
  });

  test('reset-data needs confirm:true and deletes only .emulator-data', async () => {
    const data = path.join(ctx.root, '.emulator-data');
    write(ctx.root, '.emulator-data/firestore_export/data.bin', 'saved');
    for (const confirm of [undefined, false, 'true', 1, 'yes']) {
      assert.equal((await ctx.api.act({ action: 'reset-data', confirm })).status, 400, String(confirm));
    }
    assert.ok(fs.existsSync(data));
    const res = await ctx.api.act({ action: 'reset-data', confirm: true, path: '..', target: '/' });
    assert.equal(res.status, 200);
    assert.equal(res.json.state.setup.savedData, false);
    assert.ok(!fs.existsSync(data));
    assert.ok(fs.existsSync(path.join(ctx.root, 'package.json')), 'the rest of the repository is untouched');
    assert.equal((await ctx.api.act({ action: 'reset-data', confirm: true })).status, 200, 'nothing to delete is fine');
  });

  test('reset-data refuses a .emulator-data that is a link out of (or elsewhere in) the repository', async () => {
    const outside = tempDir('omnitask-outside-');
    write(outside, 'precious.txt', 'do not delete');
    write(ctx.root, 'src/app.ts', 'export {};');
    const data = path.join(ctx.root, '.emulator-data');
    for (const destination of [outside, path.join(ctx.root, 'src')]) {
      fs.symlinkSync(destination, data, 'junction');
      const res = await ctx.api.act({ action: 'reset-data', confirm: true });
      assert.equal(res.status, 409, destination);
      assert.match(res.json.error, /link/);
      fs.rmSync(data); // removes the link itself
    }
    assert.equal(fs.readFileSync(path.join(outside, 'precious.txt'), 'utf8'), 'do not delete');
    assert.ok(fs.existsSync(path.join(ctx.root, 'src', 'app.ts')));
  });
});

// ---------------------------------------------------------------------------
// The stack child
// ---------------------------------------------------------------------------

describe('start / stop', () => {
  test('full: starting -> running on the "up" line -> stopping -> stopped, over IPC', async () => {
    const ctx = await startConsole(); // uses the real default spawner on the stand-in scripts/local-dev.mjs
    try {
      write(ctx.root, '.emulator-data/keep.txt', 'k');
      const started = await ctx.api.act({ action: 'start', mode: 'full' });
      assert.equal(started.status, 200);
      assert.equal(started.json.ok, true);
      assert.equal(started.json.state.stack.state, 'starting');
      assert.equal(started.json.state.stack.mode, 'full');
      const pid = started.json.state.stack.pid;
      assert.equal(typeof pid, 'number');
      assert.ok(!Number.isNaN(Date.parse(started.json.state.stack.since)));

      const running = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.stack.state === 'running' ? s : null;
      }, 'the stack to report running');
      assert.equal(running.stack.pid, pid);
      assert.equal(running.stack.mode, 'full');

      // While it runs, everything that needs a stopped stack is refused.
      for (const body of [{ action: 'start', mode: 'full' }, { action: 'start', mode: 'emulators' }, { action: 'pull' }, { action: 'install' }, { action: 'reset-data', confirm: true }]) {
        const res = await ctx.api.act(body);
        assert.equal(res.status, 409, body.action);
        assert.deepEqual(Object.keys(res.json), ['ok', 'error']);
      }
      assert.ok(fs.existsSync(path.join(ctx.root, '.emulator-data', 'keep.txt')));

      const stopping = await ctx.api.act({ action: 'stop' });
      assert.equal(stopping.status, 200);
      assert.equal(stopping.json.state.stack.state, 'stopping');
      assert.equal((await ctx.api.act({ action: 'stop' })).status, 409, 'already stopping');
      assert.equal((await ctx.api.act({ action: 'start', mode: 'full' })).status, 409, 'not while stopping');

      const stopped = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.stack.state === 'stopped' ? s : null;
      }, 'the stack to stop');
      assert.deepEqual([stopped.stack.mode, stopped.stack.pid, stopped.stack.since], [null, null, null]);
      assert.equal(stopped.stack.lastExit.code, 0, 'it exited by itself on the shutdown message');
      assert.ok(!Number.isNaN(Date.parse(stopped.stack.lastExit.at)));
      assert.throws(() => process.kill(pid, 0), 'the child is gone');

      const log = await ctx.api.logText();
      assert.ok(log.includes('stack|[dev:local] Preflight checks...'), 'stdout reaches the log without colour codes');
      assert.ok(log.includes('stack|OmniTask local stack is up.'));
      assert.ok(log.includes('stack|[dev:local] Shutting down...'), 'the child handled the IPC message');
      assert.ok(log.includes(`stack|debug: using ${REDACTED} for requests`), 'stderr reaches the log, redacted');
      assert.ok(!log.includes(PATTERN_KEY));
      assert.ok(!log.includes(ESC));
      assert.ok(log.includes('console|'));
      assert.ok(!log.includes(ctx.token), 'the token is never written to the log');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('emulators: passes --emulators-only and waits for "Emulators are up."', async () => {
    const ctx = await startConsole();
    try {
      const started = await ctx.api.act({ action: 'start', mode: 'emulators' });
      assert.equal(started.json.state.stack.mode, 'emulators');
      await waitFor(async () => (await ctx.api.state()).stack.state === 'running', 'the emulators to report running');
      const log = await ctx.api.logText();
      assert.ok(log.includes('stack|Emulators are up.'));
      assert.ok(!log.includes('OmniTask local stack is up.'));
      await ctx.api.act({ action: 'stop' });
      await waitFor(async () => (await ctx.api.state()).stack.state === 'stopped', 'the emulators to stop');
      // It can be started again afterwards.
      assert.equal((await ctx.api.act({ action: 'start', mode: 'full' })).status, 200);
    } finally {
      await ctx.consoleServer.close(); // also stops the stack that was just started
    }
    assert.equal((await ctx.consoleServer.state()).stack.state, 'stopped');
  });

  test('the "up" line of the other mode does not count, and a crash is recorded', async () => {
    const root = makeRoot();
    const crash = write(root, 'crash.mjs', "console.log('Emulators are up.'); setTimeout(() => process.exit(7), 300);");
    const seen = [];
    const ctx = await startConsole({
      root,
      spawnStack: (mode, info) => {
        seen.push([mode, info.root]);
        return spawn(process.execPath, [crash], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: !IS_WINDOWS });
      },
    });
    try {
      await ctx.api.act({ action: 'start', mode: 'full' });
      assert.deepEqual(seen, [['full', root]]);
      await waitFor(async () => (await ctx.api.logText()).includes('Emulators are up.'), 'the line to arrive');
      assert.equal((await ctx.api.state()).stack.state, 'starting', 'full mode waits for its own line');
      const stopped = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.stack.state === 'stopped' ? s : null;
      }, 'the crash');
      assert.equal(stopped.stack.lastExit.code, 7);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a stack that ignores the shutdown message is killed after the timeout', async () => {
    const root = makeRoot();
    const ctx = await startConsole({
      root,
      stopTimeoutMs: 400,
      spawnStack: () =>
        spawn(process.execPath, [path.join(root, 'scripts', 'local-dev.mjs')], {
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          detached: !IS_WINDOWS,
          env: { ...process.env, FAKE_STACK_STUBBORN: '1' },
        }),
    });
    try {
      const started = await ctx.api.act({ action: 'start', mode: 'full' });
      const pid = started.json.state.stack.pid;
      await waitFor(async () => (await ctx.api.state()).stack.state === 'running', 'running');
      const asked = Date.now();
      await ctx.api.act({ action: 'stop' });
      await waitFor(async () => (await ctx.api.logText()).includes('ignoring the shutdown request'), 'the child to see the message');
      assert.equal((await ctx.api.state()).stack.state, 'stopping');
      const stopped = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.stack.state === 'stopped' ? s : null;
      }, 'the kill fallback');
      assert.ok(Date.now() - asked >= 350, 'not before the timeout');
      assert.notEqual(stopped.stack.lastExit.code, 0);
      assert.throws(() => process.kill(pid, 0), 'the child is gone');
      assert.ok((await ctx.api.logText()).includes('ending its process tree'));
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a stack that cannot be launched leaves the console stopped', async () => {
    const ctx = await startConsole({
      spawnStack: () => {
        throw new Error('spawn EPERM');
      },
    });
    try {
      const res = await ctx.api.act({ action: 'start', mode: 'full' });
      assert.equal(res.status, 409);
      assert.match(res.json.error, /Could not start the stack/);
      assert.equal((await ctx.api.state()).stack.state, 'stopped');
    } finally {
      await ctx.consoleServer.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

describe('jobs', () => {
  function smokeRoot(key) {
    const root = makeRoot();
    write(root, 'functions/lib/index.js', '');
    write(root, 'functions/.secret.local', `# local\nANTHROPIC_API_KEY=${key}\n`);
    return root;
  }
  const finished = (ctx) =>
    waitFor(async () => {
      const s = await ctx.api.state();
      return s.job && s.job.state !== 'running' ? s.job : null;
    }, 'the job to finish');

  test('smoke gets the key through its environment; the key never shows in the log or the API', async () => {
    const root = smokeRoot(ODD_KEY);
    write(root, 'functions/.env.local', 'ANTHROPIC_MODEL=claude-sonnet-5\n');
    const hold = write(root, 'functions/scripts/hold', '');
    const ctx = await startConsole({ root });
    try {
      const res = await ctx.api.act({ action: 'smoke' });
      assert.equal(res.status, 200);
      assert.deepEqual(Object.keys(res.json.state.job), ['id', 'action', 'state', 'exitCode', 'startedAt', 'endedAt']);
      assert.deepEqual([res.json.state.job.id, res.json.state.job.action, res.json.state.job.state, res.json.state.job.exitCode, res.json.state.job.endedAt], [1, 'smoke', 'running', null, null]);
      assert.ok(!res.text.includes(ODD_KEY));

      // One job at a time, and no stack start while one runs.
      for (const body of [{ action: 'smoke' }, { action: 'pull' }, { action: 'install' }, { action: 'checks' }, { action: 'start', mode: 'full' }]) {
        const busy = await ctx.api.act(body);
        assert.equal(busy.status, 409, body.action);
        assert.match(busy.json.error, /job/);
      }
      fs.rmSync(hold);
      const job = await finished(ctx);
      assert.deepEqual([job.id, job.action, job.state, job.exitCode], [1, 'smoke', 'ok', 0]);
      assert.ok(Date.parse(job.endedAt) >= Date.parse(job.startedAt));

      const log = await ctx.api.logText();
      assert.ok(log.includes('job|$ node scripts/ai-smoke.mjs'), 'a header line precedes the step');
      assert.ok(log.includes(`job|key=${REDACTED}`), 'the child received the key, and the log hides it');
      assert.ok(log.includes('job|model=claude-sonnet-5'));
      assert.ok(log.includes('job|ai-smoke OK'));
      assert.ok(!log.includes(ODD_KEY));
      const everything = [await ctx.api.get('/api/state'), await ctx.api.get('/api/log'), await request(ctx.port), await request(ctx.port, { path: '/api/ping' })];
      for (const response of everything) assert.ok(!response.text.includes(ODD_KEY));
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a failing job reports its exit code, and the next job gets a new id', async () => {
    const root = smokeRoot(PATTERN_KEY);
    const fail = write(root, 'functions/scripts/fail', '');
    const ctx = await startConsole({ root });
    try {
      await ctx.api.act({ action: 'smoke' });
      const failed = await finished(ctx);
      assert.deepEqual([failed.id, failed.state, failed.exitCode], [1, 'failed', 3]);
      const log = await ctx.api.logText();
      assert.ok(log.includes('job|model=default'), 'no model override without .env.local');
      assert.ok(log.includes('job|ai-smoke FAILED'));
      assert.ok(!log.includes(PATTERN_KEY));

      fs.rmSync(fail);
      await ctx.api.act({ action: 'smoke' });
      await waitFor(async () => (await ctx.api.state()).job.id === 2, 'the second job');
      const ok = await finished(ctx);
      assert.deepEqual([ok.id, ok.state, ok.exitCode], [2, 'ok', 0]);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('steps run in order and stop at the first failure', async () => {
    const root = makeRoot();
    const node = (code) => ({ file: process.execPath, args: ['-e', code], cwd: root });
    const ctx = await startConsole({
      root,
      jobSteps: () => ({
        pull: [{ ...node("console.log('pulled')"), label: 'git pull --ff-only' }],
        install: [
          { ...node("require('fs').writeFileSync('one.txt','1')"), label: 'step one' },
          { ...node("require('fs').writeFileSync('two.txt','2')"), label: 'step two' },
        ],
        smoke: [],
        checks: [
          { ...node("console.log('first ok')"), label: 'first' },
          { ...node("console.error('second broke'); process.exit(2)"), label: 'second' },
          { ...node("require('fs').writeFileSync('third.txt','3')"), label: 'third' },
        ],
      }),
    });
    try {
      assert.equal((await ctx.api.act({ action: 'install' })).status, 200);
      assert.equal((await finished(ctx)).state, 'ok');
      assert.ok(fs.existsSync(path.join(root, 'one.txt')) && fs.existsSync(path.join(root, 'two.txt')));

      assert.equal((await ctx.api.act({ action: 'checks' })).status, 200);
      await waitFor(async () => (await ctx.api.state()).job.id === 2, 'the checks job');
      const checks = await finished(ctx);
      assert.deepEqual([checks.action, checks.state, checks.exitCode], ['checks', 'failed', 2]);
      assert.ok(!fs.existsSync(path.join(root, 'third.txt')), 'the step after the failure never ran');

      const log = await ctx.api.logText();
      const order = ['job|$ step one', 'job|$ step two', 'job|$ first', 'job|first ok', 'job|$ second', 'job|second broke'].map((line) => log.indexOf(line));
      assert.ok(order.every((at) => at !== -1), 'every line is in the log');
      assert.deepEqual([...order].sort((a, b) => a - b), order, 'in order');
      assert.ok(!log.includes('job|$ third'));

      assert.equal((await ctx.api.act({ action: 'pull' })).status, 200);
      await waitFor(async () => (await ctx.api.state()).job.id === 3, 'the pull job');
      assert.equal((await finished(ctx)).state, 'ok');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a command that does not exist fails the job instead of hanging it', async () => {
    const root = makeRoot();
    const ctx = await startConsole({
      root,
      jobSteps: () => ({ pull: [{ file: path.join(root, 'no-such-program'), args: [], cwd: root, label: 'no-such-program' }], install: [], smoke: [], checks: [] }),
    });
    try {
      await ctx.api.act({ action: 'pull' });
      const job = await finished(ctx);
      assert.deepEqual([job.state, job.exitCode], ['failed', null]);
      assert.ok((await ctx.api.logText()).includes('Could not start'));
    } finally {
      await ctx.consoleServer.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Lifetime
// ---------------------------------------------------------------------------

describe('quit, idle exit and single instance', () => {
  test('quit stops the stack first, answers, then exits', async () => {
    let exited;
    const exit = new Promise((resolve) => {
      exited = resolve;
    });
    const ctx = await startConsole({ onExit: exited });
    const started = await ctx.api.act({ action: 'start', mode: 'full' });
    const pid = started.json.state.stack.pid;
    await waitFor(async () => (await ctx.api.state()).stack.state === 'running', 'running');
    const res = await ctx.api.act({ action: 'quit' });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.state.stack.state, 'stopped', 'the answer is sent after the stack has stopped');
    assert.equal(res.json.state.stack.lastExit.code, 0);
    assert.throws(() => process.kill(pid, 0), 'the stack child is gone');
    assert.equal(await exit, 'quit');
    assert.equal(ctx.consoleServer.server.listening, false);
    assert.equal(await pingConsole(ctx.port, 500), null);
  });

  test('idle exit: only when nobody calls the API and nothing is running', async () => {
    const reasons = [];
    const ctx = await startConsole({ idleExitMs: 400, onExit: (reason) => reasons.push(reason) });
    // Authenticated calls keep it alive well past the idle time...
    for (let i = 0; i < 8; i++) {
      await ctx.api.get('/api/state');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.deepEqual(reasons, []);
    // ...a running stack keeps it alive without any calls...
    await ctx.api.act({ action: 'start', mode: 'full' });
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.deepEqual(reasons, [], 'a running stack is never stopped by the idle timer');
    assert.equal((await ctx.consoleServer.state()).stack.state, 'running');
    // ...calls without the token do not count...
    await ctx.api.act({ action: 'stop' });
    await waitFor(async () => (await ctx.consoleServer.state()).stack.state === 'stopped', 'stopped');
    const poke = setInterval(() => request(ctx.port, { path: '/api/ping' }).catch(() => {}), 50);
    try {
      await waitFor(() => reasons.length > 0, 'the idle exit', 5000);
    } finally {
      clearInterval(poke);
    }
    assert.deepEqual(reasons, ['idle']);
    assert.equal(ctx.consoleServer.server.listening, false);
  });

  test('no idle exit unless asked for', async () => {
    const reasons = [];
    const ctx = await startConsole({ onExit: (reason) => reasons.push(reason) });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(reasons, []);
    assert.equal(ctx.consoleServer.server.listening, true);
    await ctx.consoleServer.close();
    await ctx.consoleServer.close(); // closing twice is fine
  });

  test('pingConsole recognises a console and nothing else', async () => {
    const ctx = await startConsole();
    const other = http.createServer((req, res) => res.end('{"app":"something-else"}'));
    await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
    try {
      assert.deepEqual(await pingConsole(ctx.port), { app: 'omnitask-console', version: '9.8.7' });
      assert.equal(await pingConsole(other.address().port), null);
    } finally {
      await ctx.consoleServer.close();
      await new Promise((resolve) => other.close(resolve));
    }
    assert.equal(await pingConsole(ctx.port, 500), null, 'nothing is listening any more');
  });

  function runLauncher(args) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [LAUNCHER, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OMNITASK_CONSOLE_PORT: '' } });
      let output = '';
      child.stdout.on('data', (chunk) => (output += chunk));
      child.stderr.on('data', (chunk) => (output += chunk));
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    });
  }

  test('a second launch on a port held by a console shows that one and exits 0', async () => {
    const ctx = await startConsole();
    try {
      const { code, output } = await runLauncher(['--port', String(ctx.port), '--browser', 'none', '--no-idle-exit']);
      assert.equal(code, 0, output);
      assert.ok(output.includes('already running'), output);
      assert.ok(output.includes(`http://127.0.0.1:${ctx.port}/`), output);
      assert.equal((await ctx.api.get('/api/state')).status, 200, 'the first console is untouched');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a launch on a port held by another program exits 1 and names the port', async () => {
    const other = http.createServer((req, res) => res.end('hello'));
    await new Promise((resolve) => other.listen(0, '127.0.0.1', resolve));
    const port = other.address().port;
    try {
      const { code, output } = await runLauncher(['--port', String(port), '--browser', 'none']);
      assert.equal(code, 1, output);
      assert.ok(output.includes(`Port ${port} is in use`), output);
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  test('a bad flag prints the usage and exits 2', async () => {
    const { code, output } = await runLauncher(['--browser', 'netscape']);
    assert.equal(code, 2);
    assert.ok(output.includes('Usage: node scripts/launch-console.mjs'));
  });
});
