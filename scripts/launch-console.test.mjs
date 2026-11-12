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
  capture,
  createConsoleServer,
  createGuard,
  defaultJobSteps,
  defaultStackPorts,
  editorCommand,
  findOnPath,
  folderCommand,
  openBrowser,
  parseArgs,
  parseEnvLocal,
  parsePortsFile,
  parseRegValue,
  parseSecretState,
  pingConsole,
  plainOutputEnv,
  redact,
  resolveInside,
  rewriteEnvLocal,
  stripAnsi,
  windowsBrowserCandidates,
  wrapPage,
  portsFileIsStale,
  portsFileHasLivePid,
  PROD_FUNCTIONS,
  appServePlan,
  buildElevatedCommand,
  defaultCommandSteps,
  elevatedBody,
  encodePowerShell,
  parseLsofListeners,
  parsePortFindOutput,
  portFindScript,
  powerShellArgs,
  runElevated,
  terminalCommand,
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
// stderr (to prove the redactor runs), and exits when asked over IPC. While a
// "hold-exit" file sits next to it, it has heard the request but does not exit
// yet: that is how a test keeps the stack in "stopping" for as long as it needs.
const FAKE_STACK = `
import fs from 'node:fs';
const emulatorsOnly = process.argv.includes('--emulators-only');
const stubborn = process.env.FAKE_STACK_STUBBORN === '1';
const holdExit = new URL('./hold-exit', import.meta.url);
console.log('\\u001b[36m[dev:local]\\u001b[0m Preflight checks...');
console.error('debug: using ${PATTERN_KEY} for requests');
console.log('[dev:local] colour env: FORCE_COLOR=' + process.env.FORCE_COLOR + ' NO_COLOR=' + process.env.NO_COLOR);
process.on('message', (m) => {
  if (!m || m.type !== 'shutdown') return;
  if (stubborn) { console.log('[dev:local] ignoring the shutdown request'); return; }
  console.log('[dev:local] Shutting down...');
  const leave = () => (fs.existsSync(holdExit) ? setTimeout(leave, 20) : process.exit(0));
  leave();
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
    probeElevated: async () => false,
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
    const fixedChecks = (r) => [
      ['npm', ['run', 'build'], path.join(r, 'functions'), true],
      ['npm', ['test'], path.join(r, 'functions'), true],
      ['yarn', ['lint'], r, true],
      ['yarn', ['build'], r, true],
      ['yarn', ['test', '--no-watch', '--no-progress', '--browsers=ChromeHeadless'], r, true],
    ];
    // No scripts/ folder here, so there are no tooling tests to add.
    assert.deepEqual(brief(steps.checks), fixedChecks(root));

    // With tooling tests, checks ends with the step PR Validation calls "Run dev tooling tests":
    // the scripts/*.test.mjs pattern, expanded here because no shell is involved.
    const real = tempDir('omnitask-steps-');
    for (const name of ['b.test.mjs', 'a.test.mjs', 'launch-console.mjs', 'notes.test.md', '.hidden.test.mjs', 'console/deep.test.mjs', 'folder.test.mjs/x']) {
      write(real, `scripts/${name}`, '');
    }
    const withTests = defaultJobSteps(real);
    assert.deepEqual(brief(withTests.checks), [
      ...fixedChecks(real),
      [process.execPath, ['--test', 'scripts/a.test.mjs', 'scripts/b.test.mjs'], real, false],
    ]);
    assert.equal(withTests.checks.at(-1).label, 'node --test scripts/*.test.mjs');

    for (const list of [...Object.values(steps), ...Object.values(withTests)]) {
      for (const step of list) {
        // The Windows shim path joins these with spaces, so none may contain one (or a shell character).
        if (step.shim) for (const part of [step.file, ...step.args]) assert.match(part, /^[A-Za-z0-9=_-]+$/);
        assert.equal(typeof step.label, 'string');
      }
    }
  });

  test('the tooling test step really runs the files it lists, without a shell', async () => {
    const root = makeRoot();
    write(root, 'scripts/one.test.mjs', "import { test } from 'node:test';\ntest('one', () => {});\n");
    write(root, 'scripts/two.test.mjs', "import fs from 'node:fs';\nimport { test } from 'node:test';\ntest('two', () => fs.writeFileSync('two-ran.txt', process.cwd()));\n");
    // This file itself runs under `node --test`, which marks its children (NODE_TEST_CONTEXT) so that a
    // nested run does nothing. The step under test is that nested run, so it is started without the mark.
    const unmarked = (step) => ({ ...step, env: { NODE_TEST_CONTEXT: undefined } });
    const ctx = await startConsole({ root, jobSteps: (r) => ({ pull: [], install: [], smoke: [], checks: defaultJobSteps(r).checks.slice(-1).map(unmarked) }) });
    try {
      assert.equal((await ctx.api.act({ action: 'checks' })).status, 200);
      const job = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.job && s.job.state !== 'running' ? s.job : null;
      }, 'the tooling tests to finish', 30_000);
      const log = await ctx.api.logText();
      assert.deepEqual([job.state, job.exitCode], ['ok', 0], log);
      assert.ok(log.includes('job|$ node --test scripts/*.test.mjs'));
      assert.equal(fs.readFileSync(path.join(root, 'two-ran.txt'), 'utf8'), root, 'it ran in the repository folder');
      assert.match(log, /^job\|.*\btests 2$/m, 'both files ran');

      // A file added after the console started (a pull can bring one) is picked up by the next run.
      write(root, 'scripts/three.test.mjs', "import { test } from 'node:test';\ntest('three', () => { throw new Error('three fails'); });\n");
      assert.equal((await ctx.api.act({ action: 'checks' })).status, 200);
      const second = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.job && s.job.id === 2 && s.job.state !== 'running' ? s.job : null;
      }, 'the second run to finish', 30_000);
      assert.deepEqual([second.state, second.exitCode], ['failed', 1]);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('findOnPath searches absolute PATH folders only, extensions in order', (t) => {
    const bin = tempDir('omnitask-path-');
    const other = tempDir('omnitask-path-other-');
    const exe = (dir, name) => fs.writeFileSync(path.join(dir, name), '', { mode: 0o755 });
    exe(bin, 'tool');
    exe(bin, 'git.exe');
    exe(other, 'git.exe');
    const join = (...dirs) => dirs.join(path.delimiter);
    assert.equal(findOnPath('tool', { pathValue: bin }), path.join(bin, 'tool'));
    assert.equal(findOnPath('tool', { pathValue: join(other, bin) }), path.join(bin, 'tool'), 'later folders are searched');
    assert.equal(findOnPath('missing', { pathValue: join(other, bin) }), null);
    assert.equal(findOnPath('git', { pathValue: bin }), null, 'no extension asked for, none tried');
    const windowsOrder = { extensions: ['.com', '.exe'] };
    assert.equal(findOnPath('git', { pathValue: join(other, bin), ...windowsOrder }), path.join(other, 'git.exe'), 'the first folder wins');
    exe(bin, 'git.com');
    assert.equal(findOnPath('git', { pathValue: bin, ...windowsOrder }), path.join(bin, 'git.com'), '.com before .exe, as Node on Windows');
    assert.equal(findOnPath('tool', { pathValue: `"${bin}"` }), path.join(bin, 'tool'), 'a quoted entry');
    assert.equal(findOnPath('tool', { pathValue: '' }), null);

    // An entry that is not absolute would be resolved against the working directory (the repository).
    const relative = path.relative(process.cwd(), bin);
    if (!path.isAbsolute(relative)) {
      assert.ok(fs.existsSync(path.join(relative, 'tool')), 'the file is reachable through the relative entry');
      assert.equal(findOnPath('tool', { pathValue: join('', '.', relative) }), null, 'but such an entry is never searched');
      assert.equal(findOnPath('tool', { pathValue: join('', '.', relative, bin) }), path.join(bin, 'tool'));
    }
    if (IS_WINDOWS) return t.diagnostic('the execute-permission case needs POSIX file modes');
    fs.writeFileSync(path.join(other, 'tool'), '', { mode: 0o644 });
    assert.equal(findOnPath('tool', { pathValue: join(other, bin) }), path.join(bin, 'tool'), 'a file that cannot be executed is skipped');
  });

  test('plainOutputEnv: FORCE_COLOR=0 and no NO_COLOR, so a child that forces colour for its own children does not make Node warn', async () => {
    const env = plainOutputEnv({ EXTRA: 'x', NO_COLOR: '1' }, { PATH: '/bin', NO_COLOR: '1', no_color: '1', NODE_DISABLE_COLORS: '1', FORCE_COLOR: '3', KEEP: 'k' });
    assert.deepEqual(env, { PATH: '/bin', FORCE_COLOR: '0', KEEP: 'k', EXTRA: 'x' });
    assert.equal(plainOutputEnv().PATH, process.env.PATH, 'the rest of the environment is passed on');

    // A Node child under this environment, and a grandchild started the way scripts/local-dev.mjs
    // starts the emulators (the same environment plus FORCE_COLOR=1). Each asks Node for the colour
    // depth, which is where Node prints "Warning: The 'NO_COLOR' env is ignored ..." when both are set.
    const probe =
      "const tty = require('node:tty'); const { spawnSync } = require('node:child_process');" +
      "const depth = tty.WriteStream.prototype.getColorDepth();" +
      "if (process.argv[1] === 'grandchild') { console.log('grandchild depth ' + depth); } else {" +
      "console.log('child depth ' + depth);" +
      "spawnSync(process.execPath, ['-e', process.env.PROBE, 'grandchild'], { env: { ...process.env, FORCE_COLOR: '1' }, stdio: 'inherit' }); }";
    const run = (childEnv) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, ['-e', probe], { env: { ...childEnv, PROBE: probe }, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('close', (code) => resolve({ code, stdout, stderr }));
      });
    const result = await run(plainOutputEnv({}, { ...process.env, NO_COLOR: '1' }));
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /NO_COLOR|FORCE_COLOR/, 'no colour warning from the child or the grandchild');
    assert.match(result.stdout, /^child depth 1$/m, 'the child itself does not colour its output');
    assert.match(result.stdout, /^grandchild depth 4$/m, 'the grandchild was really given FORCE_COLOR=1');
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
    assert.equal(guard.check(withToken('cross-site')).notice, undefined, 'the API answers in JSON');
  });

  test('the page is not served to a navigation another site started', () => {
    const from = (site, url = '/') => guard.check(req({ url, headers: site === undefined ? {} : { 'sec-fetch-site': site } }));
    for (const url of ['/', '/?source=link', '/index.html', '/nope']) {
      for (const site of ['cross-site', 'same-site', 'CROSS-SITE', '']) {
        const refused = from(site, url);
        assert.equal(refused?.status, 403, `${url} from ${site}`);
        assert.equal(refused.notice, true, 'answered with the notice, not JSON');
        assert.ok(!JSON.stringify(refused).includes(TOKEN));
      }
      // The shortcut's window, a typed address and a reload send "none"; the page's own requests "same-origin";
      // a program that is not a browser (the second launch's ping, curl) sends nothing.
      for (const site of ['none', 'same-origin', undefined]) assert.equal(from(site, url), null, `${url} from ${site}`);
    }
    // What a second launch and the browser's own icon request need stays reachable.
    for (const url of ['/api/ping', '/favicon.ico']) {
      for (const site of ['cross-site', 'same-site', 'none', undefined]) assert.equal(from(site, url), null, `${url} from ${site}`);
    }
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
    assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
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

  test('a navigation from another site gets a notice instead of the page; the shortcut and the address bar get the page', async () => {
    for (const site of ['cross-site', 'same-site']) {
      for (const target of ['/', '/?from=docs', '/nope']) {
        const headers = { 'sec-fetch-site': site, 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
        const res = await request(ctx.port, { path: target, headers });
        assert.equal(res.status, 403, `${site} ${target}`);
        assert.match(res.headers['content-type'], /^text\/plain/);
        assert.match(res.text, /^OmniTask Build Console\n/);
        assert.match(res.text, /shortcut/);
        assert.match(res.text, /address bar and press Enter/);
        assert.ok(!res.text.includes(ctx.token), 'no token in the notice');
        assert.ok(!res.text.includes('PAGE-BODY'), 'and nothing of the page');
        assert.equal(res.headers['content-security-policy'], undefined);
        assert.equal(res.headers['cross-origin-opener-policy'], 'same-origin');
        assertBaseHeaders(res, `${site} ${target}`);
      }
      // Loading the page as a script or an image from another site gets the same answer.
      const asScript = await request(ctx.port, { headers: { 'sec-fetch-site': site, 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'script' } });
      assert.equal(asScript.status, 403);
      assert.ok(!asScript.text.includes(ctx.token));
      // Still reachable: what a second launch pings, and the icon.
      assert.equal((await request(ctx.port, { path: '/api/ping', headers: { 'sec-fetch-site': site } })).status, 200);
      assert.equal((await request(ctx.port, { path: '/favicon.ico', headers: { 'sec-fetch-site': site } })).status, 200);
    }
    for (const headers of [{ 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' }, { 'sec-fetch-site': 'same-origin' }, {}]) {
      const res = await request(ctx.port, { headers });
      assert.equal(res.status, 200, JSON.stringify(headers));
      assert.ok(res.text.includes(ctx.token), 'the real page, with its token');
    }
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
      assert.deepEqual(Object.keys(s), ['console', 'git', 'tools', 'setup', 'stack', 'app', 'ports', 'job', 'logSeq']);
      assert.deepEqual(Object.keys(s.console), ['version', 'pid', 'port', 'platform', 'repo', 'startedAt', 'elevated']);
      assert.equal(s.console.elevated, false, 'the console itself never runs as administrator');
      assert.deepEqual(s.app, { state: 'stopped', pid: null, since: null, lastExit: null, port: null, configuration: null });
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
        platformSupports: { elevation: IS_WINDOWS, shortcut: false },
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
        ].map(([port, name]) => ({ name, port, default: port, open: false })),
      );
      assert.deepEqual(Object.keys(s.ports[0]), ['name', 'port', 'default', 'open']);
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
        platformSupports: { elevation: IS_WINDOWS, shortcut: false },
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

describe('stack ports', () => {
  const NAMES = ['app', 'auth', 'firestore', 'storage', 'functions', 'ui', 'hub'];
  /** What the console assumes when firebase.json says nothing. */
  const LITERALS = { app: 4200, auth: 9099, firestore: 8080, storage: 9199, functions: 5001, ui: 4000, hub: 4400 };
  /** A stack that had to leave every one of its ports. None of these numbers is a default anywhere. */
  const MOVED = { app: 61200, auth: 61099, firestore: 61080, functions: 61001, storage: 61199, ui: 61000, hub: 61400 };
  /** The file as scripts/local-dev.mjs writes it. */
  const stackFile = (ports, remapped = []) => JSON.stringify({ ...ports, remapped });
  const portsPath = (root) => path.join(root, '.local-dev-ports.json');
  const firebaseJson = (emulators) => JSON.stringify({ hosting: { public: 'dist' }, emulators: { singleProjectMode: true, ...emulators } });
  const listed = (ports, key = 'port') => Object.fromEntries(ports.map((p) => [p.name, p[key]]));

  /** A console whose probe records every port it is asked about and finds only `open` listening. */
  async function startProbed({ open = [], ...options } = {}) {
    const probed = [];
    const ctx = await startConsole({
      ...options,
      probePort: async (port) => {
        probed.push(port);
        return open.includes(port);
      },
    });
    return { ...ctx, probed };
  }

  test('defaultStackPorts: firebase.json where it names a port, the literal where it does not', () => {
    assert.deepEqual(defaultStackPorts(null), LITERALS);
    assert.deepEqual(defaultStackPorts(undefined), LITERALS);
    assert.deepEqual(Object.keys(defaultStackPorts(null)), NAMES, 'in the order the page lists them');
    const all = firebaseJson({
      auth: { host: '127.0.0.1', port: 9098 },
      firestore: { port: 8081 },
      functions: { port: 5002 },
      storage: { port: 9198 },
      ui: { enabled: true, port: 4001 },
      hub: { port: 4401 },
    });
    assert.deepEqual(defaultStackPorts(all), { app: 4200, auth: 9098, firestore: 8081, storage: 9198, functions: 5002, ui: 4001, hub: 4401 });
    assert.deepEqual(defaultStackPorts(`\uFEFF${all}`).auth, 9098, 'a byte order mark does not hide the file');
    // The repository's own firebase.json has no hub entry: the Firebase default stands.
    assert.equal(defaultStackPorts(firebaseJson({ auth: { port: 9098 } })).hub, 4400);
    assert.equal(defaultStackPorts(firebaseJson({ app: { port: 4999 } })).app, 4200, 'the app is not an emulator');
    for (const bad of ['9098', 0, -1, 65536, 9098.5, null, true, [9098], { port: 9098 }]) {
      assert.equal(defaultStackPorts(firebaseJson({ auth: { port: bad } })).auth, 9099, JSON.stringify(bad));
    }
    for (const text of ['', '{', 'null', '[]', '"emulators"', '{"emulators":null}', '{"emulators":"auth"}', '{"emulators":{"auth":9098}}']) {
      assert.deepEqual(defaultStackPorts(text), LITERALS, text);
    }
  });

  test('parsePortsFile: seven whole numbers from 1 to 65535, or nothing', () => {
    assert.deepEqual(parsePortsFile(stackFile(MOVED, ['auth'])), MOVED);
    assert.deepEqual(parsePortsFile(stackFile({ ...MOVED, auth: 1, hub: 65535 })), { ...MOVED, auth: 1, hub: 65535 }, 'both ends of the range');
    assert.deepEqual(Object.keys(parsePortsFile(stackFile(MOVED))), NAMES);
    // Only the seven names come back, whatever else the file holds.
    assert.deepEqual(parsePortsFile(JSON.stringify({ ...MOVED, remapped: 'x', extra: { deep: [1] }, command: 'calc.exe' })), MOVED);

    for (const text of [null, undefined, 42, {}, '', ' ', '{', 'null', '[]', '"auth"', '61099', 'true', stackFile(MOVED).slice(0, -5)]) {
      assert.equal(parsePortsFile(text), null, String(text));
    }
    assert.equal(parsePortsFile(JSON.stringify([MOVED])), null, 'an array is not the file');
    for (const name of NAMES) {
      const { [name]: dropped, ...rest } = MOVED;
      assert.equal(parsePortsFile(JSON.stringify(rest)), null, `without ${name}`);
      for (const bad of [0, -1, 65536, 1e9, 61099.5, '61099', null, true, [61099], { port: 61099 }]) {
        assert.equal(parsePortsFile(JSON.stringify({ ...MOVED, [name]: bad })), null, `${name}: ${JSON.stringify(bad)}`);
      }
    }
    // Numbers that only an inherited property would supply are not the file's own.
    assert.equal(parsePortsFile(`{"__proto__":${JSON.stringify(MOVED)}}`), null);
  });

  test('without the ports file: the defaults of firebase.json, and those are what is probed', async () => {
    const root = makeRoot();
    write(root, 'firebase.json', firebaseJson({ auth: { port: 9098 }, firestore: { port: 8081 }, functions: { port: 5002 }, storage: { port: 9198 }, ui: { port: 4001 } }));
    const ctx = await startProbed({ root, open: [9098] });
    try {
      const s = await ctx.api.state();
      assert.deepEqual(
        s.ports,
        [
          ['app', 4200],
          ['auth', 9098],
          ['firestore', 8081],
          ['storage', 9198],
          ['functions', 5002],
          ['ui', 4001],
          ['hub', 4400],
        ].map(([name, port]) => ({ name, port, default: port, open: name === 'auth' })),
      );
      assert.deepEqual([...ctx.probed].sort(), [4001, 4200, 4400, 5002, 8081, 9098, 9198]);
      assert.equal(s.stack.state, 'stopped', 'an open auth port alone is not a running stack');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a firebase.json that cannot be used leaves the literal defaults', async () => {
    const dir = makeRoot();
    fs.mkdirSync(path.join(dir, 'firebase.json'));
    const huge = makeRoot();
    // Valid, and it names a port, but no firebase.json is this large: it is not read.
    write(huge, 'firebase.json', firebaseJson({ auth: { port: 9098 } }) + ' '.repeat(300 * 1024));
    const broken = makeRoot();
    write(broken, 'firebase.json', '{ "emulators": { "auth": { "port": 9098 }');
    for (const [what, root] of [['a folder', dir], ['oversized', huge], ['cut short', broken], ['missing', makeRoot()]]) {
      const ctx = await startProbed({ root });
      try {
        const s = await ctx.api.state();
        assert.deepEqual(listed(s.ports), LITERALS, what);
        assert.deepEqual(listed(s.ports, 'default'), LITERALS, what);
      } finally {
        await ctx.consoleServer.close();
      }
    }
  });

  test('with the ports file: the effective port is shown and probed, next to its default', async () => {
    const root = makeRoot();
    write(root, 'firebase.json', firebaseJson({ auth: { port: 9099 }, firestore: { port: 8081 } }));
    // The case from the laptop: Windows held 9099 that boot, so sign-in went to 9100.
    const effective = { ...LITERALS, firestore: 8081, auth: 9100 };
    write(root, '.local-dev-ports.json', stackFile(effective, ['auth']));
    const ctx = await startProbed({ root, open: [9100, 8081] });
    try {
      const res = await ctx.api.get('/api/state');
      const s = res.json;
      assert.deepEqual(s.ports.map((p) => p.name), NAMES);
      assert.deepEqual(
        s.ports.find((p) => p.name === 'auth'),
        { name: 'auth', port: 9100, default: 9099, open: true },
      );
      assert.ok(res.text.includes('{"name":"auth","port":9100,"default":9099,"open":true}'), 'in the documented key order');
      assert.deepEqual(listed(s.ports), effective);
      assert.deepEqual(listed(s.ports, 'default'), { ...LITERALS, firestore: 8081 });
      assert.deepEqual(listed(s.ports, 'open'), { app: false, auth: true, firestore: true, storage: false, functions: false, ui: false, hub: false });
      assert.ok(ctx.probed.includes(9100), 'the effective port is probed');
      assert.ok(!ctx.probed.includes(9099), 'the default it moved away from is not');
      assert.deepEqual(Object.keys(s), ['console', 'git', 'tools', 'setup', 'stack', 'app', 'ports', 'job', 'logSeq'], 'the ports file adds nothing to the state');
      assert.ok(!res.text.includes('remapped'));
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a ports file that is malformed, oversized or out of range is ignored as a whole', async (t) => {
    const ctx = await startProbed();
    const file = portsPath(ctx.root);
    const whole = stackFile(MOVED, ['auth']);
    const padded = (bytes) => whole + ' '.repeat(bytes - Buffer.byteLength(whole));
    const expectDefaults = async (what) => {
      const res = await ctx.api.get('/api/state');
      assert.equal(res.status, 200, what);
      assert.deepEqual(listed(res.json.ports), LITERALS, what);
      assert.deepEqual(listed(res.json.ports, 'default'), LITERALS, what);
      // Only the ports part is searched: a process id or this console's own port may hold the same digits.
      const shown = JSON.stringify(res.json.ports);
      for (const port of Object.values(MOVED)) {
        assert.ok(!ctx.probed.includes(port), `${what}: ${port} must not be probed`);
        assert.ok(!shown.includes(String(port)), `${what}: ${port} must not reach the page`);
      }
    };
    try {
      const bad = [
        ['empty', ''],
        ['cut off while being written', whole.slice(0, 40)],
        ['not JSON', 'auth=61099\n'],
        ['null', 'null'],
        ['an array', JSON.stringify([MOVED])],
        ['a string', JSON.stringify(whole)],
        ['a name missing', JSON.stringify({ ...MOVED, hub: undefined })],
        ['a port as text', JSON.stringify({ ...MOVED, auth: '61099' })],
        ['a fraction', JSON.stringify({ ...MOVED, auth: 61099.5 })],
        ['port 0', JSON.stringify({ ...MOVED, ui: 0 })],
        ['a negative port', JSON.stringify({ ...MOVED, ui: -61000 })],
        ['port 65536', JSON.stringify({ ...MOVED, hub: 65536 })],
        ['a huge number', JSON.stringify({ ...MOVED, app: 1e21 })],
        ['a nested value', JSON.stringify({ ...MOVED, auth: { port: 61099 } })],
        // Valid JSON with valid ports: only the size refuses it.
        ['one byte over 4 KiB', padded(4097)],
        ['far over 4 KiB', padded(2 * 1024 * 1024)],
      ];
      for (const [what, text] of bad) {
        fs.writeFileSync(file, text);
        await expectDefaults(what);
      }

      // Not a file at all: a folder, and (where there are such things) a pipe nobody writes to.
      fs.rmSync(file);
      fs.mkdirSync(file);
      await expectDefaults('a folder');
      fs.rmdirSync(file);
      if (!IS_WINDOWS) {
        const made = await new Promise((resolve) => {
          const child = spawn('mkfifo', [file], { stdio: 'ignore' });
          child.on('error', () => resolve(false));
          child.on('exit', (code) => resolve(code === 0));
        });
        if (made) {
          await expectDefaults('a named pipe'); // would hang here if the open waited for a writer
          fs.rmSync(file);
        } else {
          t.diagnostic('mkfifo is not available: the named pipe case was not run');
        }
      }

      // The same content at exactly 4 KiB is taken, so it was the rules above that refused the others.
      fs.writeFileSync(file, padded(4096));
      const taken = await ctx.api.state();
      assert.deepEqual(listed(taken.ports), MOVED);
      assert.deepEqual(listed(taken.ports, 'default'), LITERALS);
      for (const port of Object.values(MOVED)) assert.ok(ctx.probed.includes(port), `${port} is probed once the file is valid`);
    } finally {
      fs.rmSync(file, { recursive: true, force: true });
      await ctx.consoleServer.close();
    }
  });

  test('"external" follows the effective hub and app ports', async () => {
    // Something listens on the default hub and app ports, but the stack says it is elsewhere.
    const moved = { ...LITERALS, hub: 4401, app: 4201 };
    const elsewhere = makeRoot();
    write(elsewhere, '.local-dev-ports.json', stackFile(moved, ['hub', 'app']));
    const idle = await startProbed({ root: elsewhere, open: [4400, 4200] });
    try {
      const s = await idle.api.state();
      assert.equal(s.stack.state, 'stopped');
      assert.ok(!idle.probed.includes(4400) && !idle.probed.includes(4200), 'the default hub and app ports are not probed');
    } finally {
      await idle.consoleServer.close();
    }

    for (const [name, port] of [['hub', 4401], ['app', 4201]]) {
      const root = makeRoot();
      write(root, '.local-dev-ports.json', stackFile(moved, ['hub', 'app']));
      const ctx = await startProbed({ root, open: [port] });
      try {
        const s = await ctx.api.state();
        assert.equal(s.stack.state, 'external', name);
        assert.deepEqual(s.ports.filter((p) => p.open), [{ name, port, default: LITERALS[name], open: true }]);
        const res = await ctx.api.act({ action: 'start', mode: 'full' });
        assert.equal(res.status, 409);
        assert.match(res.json.error, /did not start/);
        assert.match(res.json.error, /port 4401 or 4201 is in use/, 'the message names the ports that were probed');
      } finally {
        await ctx.consoleServer.close();
      }
    }
  });

  test('the file is followed as it appears, changes and disappears, without waiting for the probe cache', async () => {
    const ctx = await startProbed({ open: [61400] });
    const file = portsPath(ctx.root);
    try {
      const before = await ctx.api.state();
      assert.deepEqual(listed(before.ports), LITERALS);
      assert.equal(before.stack.state, 'stopped');

      fs.writeFileSync(file, stackFile(MOVED, NAMES));
      const during = await ctx.api.state();
      assert.deepEqual(listed(during.ports), MOVED);
      assert.deepEqual(listed(during.ports, 'default'), LITERALS);
      assert.equal(during.stack.state, 'external', 'the moved hub answers');

      fs.writeFileSync(file, stackFile({ ...MOVED, hub: 61401 }, NAMES));
      const changed = await ctx.api.state();
      assert.equal(listed(changed.ports).hub, 61401);
      assert.equal(changed.stack.state, 'stopped');

      fs.rmSync(file);
      const afterwards = await ctx.api.state();
      assert.deepEqual(afterwards.ports, before.ports, 'back to the defaults');
      assert.equal(afterwards.stack.state, 'stopped');

      // An unchanged set of ports within the same second is answered from the cache.
      const count = ctx.probed.length;
      await ctx.api.state();
      assert.equal(ctx.probed.length, count);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a stack that writes the file at start and deletes it on exit is followed through both', async () => {
    const root = makeRoot();
    // What scripts/local-dev.mjs does with the file, and nothing else of it.
    write(
      root,
      'scripts/local-dev.mjs',
      `
import fs from 'node:fs';
fs.writeFileSync('.local-dev-ports.json', ${JSON.stringify(stackFile({ ...LITERALS, auth: 9100 }, ['auth']))});
console.log('Port 9099 (sign-in) is reserved by Windows; using 9100 instead.');
console.log('OmniTask local stack is up.');
process.on('message', (m) => {
  if (!m || m.type !== 'shutdown') return;
  fs.rmSync('.local-dev-ports.json', { force: true });
  process.exit(0);
});
setInterval(() => {}, 1000);
`,
    );
    const ctx = await startProbed({ root });
    try {
      assert.equal(listed((await ctx.api.state()).ports).auth, 9099);
      assert.equal((await ctx.api.act({ action: 'start', mode: 'full' })).status, 200);
      const running = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.stack.state === 'running' ? s : null;
      }, 'the stack to report running');
      assert.deepEqual(
        running.ports.find((p) => p.name === 'auth'),
        { name: 'auth', port: 9100, default: 9099, open: false },
      );
      assert.equal((await ctx.api.act({ action: 'stop' })).status, 200);
      const stopped = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.stack.state === 'stopped' ? s : null;
      }, 'the stack to stop');
      assert.ok(!fs.existsSync(portsPath(root)));
      assert.deepEqual(listed(stopped.ports), LITERALS);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a finished job drops the cached defaults, since a pull can bring another firebase.json', async () => {
    const root = makeRoot();
    write(root, 'firebase.json', firebaseJson({ auth: { port: 9098 } }));
    const noop = [{ file: process.execPath, args: ['-e', ''], cwd: root, label: 'node -e ""' }];
    const ctx = await startProbed({ root, jobSteps: () => ({ pull: noop, install: [], smoke: [], checks: [] }) });
    try {
      assert.equal(listed((await ctx.api.state()).ports, 'default').auth, 9098);
      write(root, 'firebase.json', firebaseJson({ auth: { port: 9097 } }));
      assert.equal((await ctx.api.act({ action: 'pull' })).status, 200);
      const s = await waitFor(async () => {
        const state = await ctx.api.state();
        return state.job && state.job.state !== 'running' ? state : null;
      }, 'the job to finish');
      assert.equal(s.job.state, 'ok');
      assert.deepEqual(
        s.ports.find((p) => p.name === 'auth'),
        { name: 'auth', port: 9097, default: 9097, open: false },
      );
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
    assert.equal(res.status, 200);
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

      // The stand-in does not exit while this file exists, so "stopping" lasts until the test lets go
      // of it. Without the hold, the child's exit races the two requests below.
      const hold = write(ctx.root, 'scripts/hold-exit', '');
      const stopping = await ctx.api.act({ action: 'stop' });
      assert.equal(stopping.status, 200);
      assert.equal(stopping.json.state.stack.state, 'stopping');
      assert.equal((await ctx.api.act({ action: 'stop' })).status, 409, 'already stopping');
      assert.equal((await ctx.api.act({ action: 'start', mode: 'full' })).status, 409, 'not while stopping');
      await waitFor(async () => (await ctx.api.logText()).includes('stack|[dev:local] Shutting down...'), 'the child to hear the stop request');
      const held = await ctx.api.state();
      assert.deepEqual([held.stack.state, held.stack.pid], ['stopping', pid], 'still stopping after the child has the message');
      fs.rmSync(hold);

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
      assert.ok(log.includes('stack|[dev:local] colour env: FORCE_COLOR=0 NO_COLOR=undefined'), 'colour is turned off with FORCE_COLOR alone');
      assert.ok(log.includes('console|The stack has stopped.'));
      assert.ok(!log.includes('Scroll up'), 'a stop that was asked for needs no advice');
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
      assert.ok(!Number.isNaN(Date.parse(stopped.stack.lastExit.at)));
      // The line that reports it says where to look and what to do next.
      const said = (await ctx.api.logText()).split('\n').find((line) => line.startsWith('console|The stack exited'));
      assert.equal(said, 'console|The stack exited (code 7) before it finished starting. Scroll up to the first error above, fix what it names, then start the stack again.');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a stack that dies while running says so; lastExit keeps the code', async () => {
    const root = makeRoot();
    // Up at once, then exits with code 3 as soon as a "die" file appears next to it.
    const dies = write(
      root,
      'dies.mjs',
      "import fs from 'node:fs';\nconsole.log('OmniTask local stack is up.');\n" +
        "const wait = () => (fs.existsSync(new URL('./die', import.meta.url)) ? process.exit(3) : setTimeout(wait, 20));\nwait();\n",
    );
    const ctx = await startConsole({
      root,
      spawnStack: () => spawn(process.execPath, [dies], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: !IS_WINDOWS }),
    });
    try {
      await ctx.api.act({ action: 'start', mode: 'full' });
      await waitFor(async () => (await ctx.api.state()).stack.state === 'running', 'running');
      write(root, 'die', '');
      const stopped = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.stack.state === 'stopped' ? s : null;
      }, 'the stack to die');
      assert.equal(stopped.stack.lastExit.code, 3);
      const said = (await ctx.api.logText()).split('\n').find((line) => line.startsWith('console|The stack exited'));
      assert.equal(said, 'console|The stack exited (code 3) by itself. Scroll up to the first error above, then start the stack again.');
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
      const log = await ctx.api.logText();
      assert.ok(log.includes('ending its process tree'));
      assert.ok(log.includes('console|The stack exited (it was ended).'), 'a stop that was asked for is reported without advice');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('endStack: a stack that finishes within the grace time is left to finish', async () => {
    const ctx = await startConsole();
    try {
      await ctx.api.act({ action: 'start', mode: 'full' });
      await waitFor(async () => (await ctx.api.state()).stack.state === 'running', 'running');
      const hold = write(ctx.root, 'scripts/hold-exit', '');
      let ended = false;
      const ending = ctx.consoleServer.endStack(60_000).then(() => {
        ended = true;
      });
      await waitFor(async () => (await ctx.api.logText()).includes('stack|[dev:local] Shutting down...'), 'the child to hear the stop request');
      assert.equal((await ctx.api.state()).stack.state, 'stopping');
      assert.equal(ended, false, 'it waits for the stack');
      fs.rmSync(hold);
      await ending;
      const s = await ctx.api.state();
      assert.equal(s.stack.state, 'stopped');
      assert.equal(s.stack.lastExit.code, 0, 'it exited by itself');
      assert.ok(!(await ctx.api.logText()).includes('ending its process tree'));
      await ctx.consoleServer.endStack(60_000); // nothing running: returns at once
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('endStack: a stack that does not finish in time has its process tree ended', async () => {
    const root = makeRoot();
    const ctx = await startConsole({
      root,
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
      // The first Ctrl+C has asked for the stop; the second one arrives while it is still stopping.
      await ctx.api.act({ action: 'stop' });
      const asked = Date.now();
      await ctx.consoleServer.endStack(300);
      assert.ok(Date.now() - asked >= 250, 'not before the grace time');
      const s = await ctx.api.state();
      assert.equal(s.stack.state, 'stopped', 'endStack returns only once the stack is gone');
      assert.notEqual(s.stack.lastExit.code, 0);
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
      assert.deepEqual(Object.keys(res.json.state.job), ['id', 'action', 'state', 'exitCode', 'startedAt', 'endedAt', 'declined']);
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

test('a ports file left by a killed stack is recognised as stale', () => {
  const file = (pid) => JSON.stringify({ app: 4200, auth: 9100, firestore: 8080, storage: 9199, functions: 5001, ui: 4000, hub: 4400, pid });
  assert.equal(portsFileIsStale(file(4242), () => false), true, 'the writer is gone');
  assert.equal(portsFileIsStale(file(4242), () => true), false, 'the writer is alive');
  assert.equal(portsFileIsStale(file(process.pid)), false, 'a live pid, checked for real');
  assert.equal(portsFileIsStale(file(undefined), () => false), false, 'no pid: written by an older stack, trusted as before');
  assert.equal(portsFileIsStale(file('12'), () => false), false, 'a pid that is not a number is ignored');
  assert.equal(portsFileIsStale('{not json', () => false), false);
});

test('portsFileHasLivePid: port-free believes only a file written by a running stack', () => {
  const file = (pid) => JSON.stringify({ app: 4200, pid });
  assert.equal(portsFileHasLivePid(file(4242), () => true), true);
  assert.equal(portsFileHasLivePid(file(4242), () => false), false, 'the writer is gone');
  assert.equal(portsFileHasLivePid(file(undefined), () => true), false, 'no pid: a committed or dropped file');
  assert.equal(portsFileHasLivePid(file('4242'), () => true), false);
  assert.equal(portsFileHasLivePid(file(0), () => true), false);
  assert.equal(portsFileHasLivePid(file(-4), () => true), false);
  assert.equal(portsFileHasLivePid('{not json', () => true), false);
  assert.equal(portsFileHasLivePid(file(process.pid)), true, 'checked for real');
});

describe('capture: the answer comes from "exit" when asked to, not from "close"', () => {
  test('a program that outlives its parent with the pipes does not hold the answer', async () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], { stdio: ['ignore', 'inherit', 'inherit'], detached: true }).unref();",
      "console.log('opened');",
    ].join('');
    const started = Date.now();
    const result = await capture(process.execPath, ['-e', script], { timeoutMs: 10_000, exitGraceMs: 200 });
    assert.deepEqual([result.code, result.stdout.trim()], [0, 'opened']);
    assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms: it waited for the pipes`);
  });

  test('without the option the old behaviour stays (and a plain command still answers)', async () => {
    const result = await capture(process.execPath, ['-e', "console.log('x'); process.exitCode = 3"]);
    assert.deepEqual([result.code, result.stdout.trim()], [3, 'x']);
    const graced = await capture(process.execPath, ['-e', "console.error('boom'); process.exitCode = 1"], { exitGraceMs: 100 });
    assert.deepEqual([graced.code, graced.stderr.trim()], [1, 'boom'], 'the last output still arrives');
  });
});

// ---------------------------------------------------------------------------
// Addendum 2: every command runs from a button
// ---------------------------------------------------------------------------

const WIN_PORTS = [4200, 9099, 8080, 9199, 5001, 4000, 4400];
/** The script behind a `-EncodedCommand` argument list. */
function decodeEncoded(args) {
  const at = args.indexOf('-EncodedCommand');
  assert.notEqual(at, -1, 'the script is passed with -EncodedCommand');
  assert.equal(at, args.length - 2, 'and nothing follows it');
  return Buffer.from(args[at + 1], 'base64').toString('utf16le');
}
/** The script that the outer script hands to Start-Process. */
function decodeInner(outer) {
  const match = /-EncodedCommand(?:','| )([A-Za-z0-9+/=]+)/.exec(outer);
  assert.ok(match, 'the outer script passes the inner one encoded');
  return Buffer.from(match[1], 'base64').toString('utf16le');
}
const HIDDEN_PS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A real child that stays alive until it is killed; `listen` makes it hold a loopback port and print it. */
function standIn({ listen = false } = {}) {
  const code = listen
    ? "const s=require('net').createServer().listen(0,'127.0.0.1',()=>console.log('port='+s.address().port));setInterval(()=>{},1000)"
    : "console.log('ng stand-in: '+process.argv.slice(1).join(' '));console.error('warn: '+process.argv.length);setInterval(()=>{},1000)";
  return (args = []) => spawn(process.execPath, ['-e', code, '--', ...args], { stdio: ['ignore', 'pipe', 'pipe'], detached: !IS_WINDOWS });
}
const exited = (child) => child.exitCode !== null || child.signalCode !== null;
const waitJob = (ctx, action) =>
  waitFor(async () => {
    const { job } = await ctx.api.state();
    return job && job.action === action && job.state !== 'running' ? job : null;
  }, `the ${action} job to end`);

describe('PowerShell command text', () => {
  test('a script is passed as UTF-16LE base64, hidden and without a profile', () => {
    const script = "Write-Host 'h\u00e9 \"x\" $y'";
    assert.equal(Buffer.from(encodePowerShell(script), 'base64').toString('utf16le'), script);
    assert.match(encodePowerShell(script), /^[A-Za-z0-9+/=]+$/);
    assert.deepEqual(powerShellArgs('exit 0'), [...HIDDEN_PS, 'ZQB4AGkAdAAgADAA']);
  });

  test('port-find: one fixed pipeline, the ports as digits', () => {
    assert.equal(
      portFindScript([4200, 9100]),
      [
        "$ErrorActionPreference = 'SilentlyContinue'",
        '$ports = @(4200,9100)',
        'Get-NetTCPConnection -State Listen | Where-Object { $ports -contains $_.LocalPort } | Sort-Object LocalPort, OwningProcess -Unique | ForEach-Object {',
        "  '{0}|{1}|{2}' -f $_.LocalPort, $_.OwningProcess, (Get-Process -Id $_.OwningProcess).ProcessName",
        '}',
        'exit 0',
      ].join('\r\n'),
    );
    for (const bad of [['4200'], [0], [65536], [4200.5], ['1); calc #'], [], null, [NaN], [4200, '$(x)']]) {
      assert.throws(() => portFindScript(bad), TypeError, JSON.stringify(bad));
    }
  });

  test('port-find output: only well-formed lines count, names are cleaned', () => {
    assert.deepEqual(parsePortFindOutput('4200|4242|node\r\n9099|77|java\r\n4200|4242|node\r\nnoise\r\n70000|1|x\r\n8080|5|we`ird$(n)\r\n4000|9|\r\n'), [
      { port: 4200, pid: 4242, name: 'node' },
      { port: 9099, pid: 77, name: 'java' },
      { port: 8080, pid: 5, name: 'weird(n)' },
      { port: 4000, pid: 9, name: 'unknown' },
    ]);
    assert.deepEqual(parsePortFindOutput(null), []);
  });

  test('lsof output is filtered to the asked ports', () => {
    const text =
      'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\n' +
      'node     4242 me     23u  IPv4 0x1         0t0  TCP 127.0.0.1:4200 (LISTEN)\n' +
      'node     4242 me     24u  IPv6 0x2         0t0  TCP [::1]:4200 (LISTEN)\n' +
      'java       77 me     10u  IPv6 0x3         0t0  TCP *:9099 (LISTEN)\n' +
      'ng\\x20ser  901 me     34u  IPv4 0x5         0t0  TCP 127.0.0.1:4000 (LISTEN)\n' +
      'sshd       12 root    3u  IPv4 0x4         0t0  TCP *:22 (LISTEN)\n';
    assert.deepEqual(parseLsofListeners(text, [4200, 9099, 4000]), [
      { port: 4200, pid: 4242, name: 'node' },
      { port: 9099, pid: 77, name: 'java' },
      { port: 4000, pid: 901, name: 'ng ser' },
    ]);
    assert.deepEqual(parseLsofListeners('', [4200]), []);
  });

  test('the elevated work is three fixed texts with numbers in them', () => {
    assert.deepEqual(elevatedBody('reserve', [9099, 8080]), [
      "$netsh = Join-Path ([Environment]::SystemDirectory) 'netsh.exe'",
      'foreach ($n in @(9099,8080)) {',
      `  $r = (((& $netsh interface ipv4 add excludedportrange protocol=tcp startport=$n numberofports=1 store=persistent 2>&1 | ForEach-Object { "$_" }) -join ' ') -replace '\\s+', ' ').Trim()`,
      "  if ($LASTEXITCODE -eq 0) { Say ('port ' + $n + ': kept for the local stack') } else { Say ('port ' + $n + ': not changed. Windows said: ' + $r) }",
      '}',
    ]);
    const unreserve = elevatedBody('unreserve', [9099]);
    assert.equal(unreserve[1], 'foreach ($n in @(9099)) {');
    assert.ok(unreserve[2].includes('interface ipv4 delete excludedportrange protocol=tcp startport=$n numberofports=1 store=persistent'));
    assert.ok(unreserve[3].includes('given back to Windows'));
    assert.deepEqual(elevatedBody('kill', [4242, 4242, 5000]), [
      "$taskkill = Join-Path ([Environment]::SystemDirectory) 'taskkill.exe'",
      'foreach ($n in @(4242,5000)) {',
      `  $r = (((& $taskkill /PID $n /T /F 2>&1 | ForEach-Object { "$_" }) -join ' ') -replace '\\s+', ' ').Trim()`,
      '  if ($LASTEXITCODE -ne 0) { $code = 1 }',
      "  Say ('pid ' + $n + ': ' + $r)",
      '}',
    ]);
  });

  test('nothing but whole numbers in range gets into the elevated text', () => {
    for (const bad of [['9099'], [0], [70000], [1.5], ['9099); Remove-Item C:\\ #'], [], undefined, [9099, null]]) {
      assert.throws(() => elevatedBody('reserve', bad), TypeError, JSON.stringify(bad));
      assert.throws(() => elevatedBody('unreserve', bad), TypeError, JSON.stringify(bad));
    }
    // PID 0 is the idle process and 4 is Windows itself; a PID is never a string.
    for (const bad of [[0], [4], [1], [-5], ['4242'], [4242, '1 /IM *'], [2 ** 33], []]) {
      assert.throws(() => elevatedBody('kill', bad), TypeError, JSON.stringify(bad));
    }
    assert.throws(() => elevatedBody('format-c', [1]), TypeError);
    assert.throws(() => elevatedBody('__proto__', [9099]), TypeError);
  });

  test('the elevated command: exact inner script, RunAs outer script, both encoded', () => {
    const resultFile = "C:\\Users\\O'Brien & Co\\AppData\\Local\\Temp\\omnitask-console-00ff.txt";
    const { inner, outer, args } = buildElevatedCommand('reserve', [9099], resultFile);
    assert.equal(
      inner,
      [
        "$ErrorActionPreference = 'Continue'",
        `$out = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${Buffer.from(resultFile, 'utf16le').toString('base64')}'))`,
        'if (-not (Test-Path -LiteralPath $out -PathType Leaf)) { exit 3 }',
        '$enc = New-Object System.Text.UTF8Encoding($false)',
        'function Say([string]$t) { [IO.File]::AppendAllText($out, $t + "`r`n", $enc) }',
        '$code = 0',
        'try {',
        ...elevatedBody('reserve', [9099]),
        "} catch { Say ('error: ' + $_.Exception.Message); $code = 1 }",
        "Say ('::exit::' + $code)",
        'exit $code',
      ].join('\r\n'),
    );
    assert.ok(!inner.includes("O'Brien") && !outer.includes("O'Brien"), 'the path is only ever there as base64');
    assert.equal(
      outer,
      [
        "$ErrorActionPreference = 'Stop'",
        'try {',
        '  $psi = New-Object System.Diagnostics.ProcessStartInfo',
        "  $psi.FileName = Join-Path $PSHOME 'powershell.exe'",
        `  $psi.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${encodePowerShell(inner)}'`,
        "  $psi.Verb = 'runas'",
        '  $psi.UseShellExecute = $true',
        "  $psi.WindowStyle = 'Hidden'",
        '  $p = [System.Diagnostics.Process]::Start($psi)',
        '  $p.WaitForExit()',
        '  exit $p.ExitCode',
        '} catch {',
        '  $e = $_.Exception',
        '  while ($e) {',
        '    if ($e -is [System.ComponentModel.Win32Exception] -and $e.NativeErrorCode -eq 1223) { exit 1223 }',
        '    $e = $e.InnerException',
        '  }',
        '  [Console]::Error.WriteLine($_.Exception.Message)',
        '  exit 1',
        '}',
      ].join('\r\n'),
    );
    assert.deepEqual(args, powerShellArgs(outer));
    assert.equal(decodeEncoded(args), outer);
    assert.equal(decodeInner(outer), inner);
    // Comfortably inside what CreateProcess (32767) and ShellExecute accept.
    assert.ok(args.join(' ').length < 12_000, `outer command line is ${args.join(' ').length} characters`);
  });
});

describe('runElevated', () => {
  const NAME = /^omnitask-console-[0-9a-f]{32}\.txt$/;
  /** Stand-in for the helper PowerShell: plays the elevated script by writing to the file it was told about. */
  function fakePowerShell(calls, behave) {
    return async (file, args, opts) => {
      const outer = decodeEncoded(args);
      const inner = decodeInner(outer);
      const encodedPath = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(inner)[1];
      const resultFile = Buffer.from(encodedPath, 'base64').toString('utf16le');
      const call = { file, args, opts, outer, inner, resultFile, existedBefore: fs.existsSync(resultFile), sizeBefore: fs.statSync(resultFile).size };
      calls.push(call);
      return behave(call);
    };
  }

  test('success: the lines the elevated script wrote come back, and the file is gone', async () => {
    const tmpDir = tempDir('omnitask-elev-');
    const calls = [];
    const result = await runElevated('reserve', [9099, 8080], {
      tmpDir,
      powershell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      runTool: fakePowerShell(calls, ({ resultFile }) => {
        fs.appendFileSync(resultFile, 'port 9099: kept for the local stack\r\nport 8080: not changed. Windows said: The file exists.\r\n::exit::0\r\n');
        return { code: 0, stdout: '', stderr: '' };
      }),
    });
    assert.deepEqual(result, {
      status: 'ok',
      exitCode: 0,
      lines: ['port 9099: kept for the local stack', 'port 8080: not changed. Windows said: The file exists.'],
    });
    assert.equal(calls.length, 1, 'one PowerShell, so one UAC prompt');
    const [call] = calls;
    assert.equal(call.file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(call.args.slice(0, 5), HIDDEN_PS);
    assert.ok(call.outer.includes("$psi.Verb = 'runas'") && !call.outer.includes('Start-Process'));
    assert.ok(call.inner.includes('foreach ($n in @(9099,8080)) {'));
    assert.ok(call.inner.includes('interface ipv4 add excludedportrange protocol=tcp startport=$n numberofports=1 store=persistent'));
    assert.equal(path.dirname(call.resultFile), tmpDir);
    assert.match(path.basename(call.resultFile), NAME);
    assert.equal(call.existedBefore, true, 'created by the console before Windows is asked');
    assert.equal(call.sizeBefore, 0);
    assert.equal(fs.existsSync(call.resultFile), false, 'removed afterwards');
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('a failing elevated script is "failed" with its own exit code, whatever the helper reports', async () => {
    const tmpDir = tempDir('omnitask-elev-');
    const calls = [];
    const result = await runElevated('kill', [4242], {
      tmpDir,
      runTool: fakePowerShell(calls, ({ resultFile }) => {
        fs.appendFileSync(resultFile, '\uFEFFpid 4242: ERROR: The process "4242" not found.\r\n::exit::1\r\n');
        return { code: 0, stdout: '', stderr: '' };
      }),
    });
    assert.deepEqual(result, { status: 'failed', exitCode: 1, lines: ['pid 4242: ERROR: The process "4242" not found.'] });
    assert.ok(calls[0].inner.includes('foreach ($n in @(4242)) {'));
    assert.ok(calls[0].inner.includes('& $taskkill /PID $n /T /F'));
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('a declined UAC prompt is "declined": nothing ran, nothing is left behind', async () => {
    const tmpDir = tempDir('omnitask-elev-');
    const calls = [];
    const result = await runElevated('unreserve', [9099], {
      tmpDir,
      runTool: fakePowerShell(calls, () => ({ code: 1223, stdout: '', stderr: '' })),
    });
    assert.deepEqual(result, { status: 'declined', exitCode: null, lines: [] });
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('a helper that cannot start, or fails for another reason, is "error" with the reason', async () => {
    const tmpDir = tempDir('omnitask-elev-');
    const failed = await runElevated('reserve', [9099], {
      tmpDir,
      runTool: fakePowerShell([], () => ({ code: 1, stdout: '', stderr: 'This command cannot be run due to the error: Access is denied.\r\n' })),
    });
    assert.deepEqual(failed, { status: 'error', exitCode: 1, lines: ['This command cannot be run due to the error: Access is denied.'] });
    const missing = await runElevated('reserve', [9099], { tmpDir, runTool: fakePowerShell([], () => ({ code: null, stdout: '', stderr: '' })) });
    assert.equal(missing.status, 'error');
    assert.equal(missing.lines.length, 1);
    // An exit mark that is not the last line does not count as the script's verdict.
    const cut = await runElevated('reserve', [9099], {
      tmpDir,
      runTool: fakePowerShell([], ({ resultFile }) => {
        fs.appendFileSync(resultFile, '::exit::0\r\nport 9099: half\r\n');
        return { code: 5, stdout: '', stderr: '' };
      }),
    });
    assert.deepEqual(cut, { status: 'error', exitCode: 5, lines: ['::exit::0', 'port 9099: half', 'exit code 5'] });
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('every run gets its own unguessable file; a bad number throws before anything exists', async () => {
    const tmpDir = tempDir('omnitask-elev-');
    const calls = [];
    const runTool = fakePowerShell(calls, () => ({ code: 1223, stdout: '', stderr: '' }));
    await runElevated('reserve', [9099], { tmpDir, runTool });
    await runElevated('reserve', [9099], { tmpDir, runTool });
    assert.notEqual(calls[0].resultFile, calls[1].resultFile);
    await assert.rejects(runElevated('kill', ['4242; calc'], { tmpDir, runTool }), TypeError);
    await assert.rejects(runElevated('kill', [4], { tmpDir, runTool }), TypeError);
    assert.equal(calls.length, 2, 'PowerShell was not started for the bad values');
    assert.deepEqual(fs.readdirSync(tmpDir), []);
    const noDir = await runElevated('reserve', [9099], { tmpDir: path.join(tmpDir, 'missing'), runTool });
    assert.equal(noDir.status, 'error');
    assert.equal(calls.length, 2);
  });
});

describe('terminal windows and the app plan', () => {
  const ROOT = "C:\\Dev Folder\\Omni'Task [x]";

  test('Windows: a hidden PowerShell opens a visible one that shows the command and stays open', () => {
    const expected = {
      'firebase-login': ['OmniTask: Firebase sign-in', 'npx --yes firebase-tools@15 login'],
      'secret-set': ['OmniTask: set the production API key', 'npx --yes firebase-tools@15 functions:secrets:set ANTHROPIC_API_KEY --project omnitask-475422'],
      'deploy-functions': ['OmniTask: deploy functions to PRODUCTION', 'npx --yes firebase-tools@15 deploy --only functions --project omnitask-475422'],
    };
    for (const [kind, [title, shown]] of Object.entries(expected)) {
      const command = terminalCommand(kind, ROOT, 'win32');
      assert.equal(command.via, 'tool');
      assert.equal(command.shown, shown);
      assert.match(command.file, /powershell\.exe$/);
      assert.deepEqual(command.args.slice(0, 5), HIDDEN_PS);
      assert.deepEqual(command.env, { OMNITASK_CONSOLE_REPO: ROOT });
      const outer = decodeEncoded(command.args);
      assert.equal(
        outer,
        [
          "$ErrorActionPreference = 'Stop'",
          'try {',
          `  Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoLogo','-NoExit','-EncodedCommand','${encodePowerShell(command.inner)}'`,
          '  exit 0',
          '} catch {',
          '  [Console]::Error.WriteLine($_.Exception.Message)',
          '  exit 1',
          '}',
        ].join('\r\n'),
      );
      assert.equal(
        decodeInner(outer),
        [
          'if ($env:OMNITASK_CONSOLE_REPO) { Set-Location -LiteralPath $env:OMNITASK_CONSOLE_REPO }',
          `$Host.UI.RawUI.WindowTitle = '${title}'`,
          "Write-Host ''",
          "Write-Host 'The OmniTask Build Console opened this window to run:'",
          `Write-Host '> ${shown}' -ForegroundColor Cyan`,
          "Write-Host ''",
          ...(kind === 'deploy-functions'
            ? ["if ((Read-Host 'Type DEPLOY to deploy to PRODUCTION') -cne 'DEPLOY') { Write-Host 'Nothing was deployed.'; return }"]
            : []),
          `& npx.cmd ${shown.slice('npx '.length)}`,
          "Write-Host ''",
          "Write-Host ('Finished (exit code ' + $LASTEXITCODE + '). This window stays open; close it when you are done.')",
        ].join('\r\n'),
      );
      assert.ok(!outer.includes('Dev Folder') && !command.inner.includes('Dev Folder'), 'the repository path is in no script');
    }
    const plain = terminalCommand('terminal', ROOT, 'win32');
    assert.equal(plain.shown, null);
    assert.equal(
      plain.inner,
      [
        'if ($env:OMNITASK_CONSOLE_REPO) { Set-Location -LiteralPath $env:OMNITASK_CONSOLE_REPO }',
        "$Host.UI.RawUI.WindowTitle = 'OmniTask'",
        "Write-Host 'OmniTask repository folder. Close this window when you are done.'",
      ].join('\r\n'),
    );
    assert.throws(() => terminalCommand('rm -rf', ROOT, 'win32'), TypeError);
    assert.throws(() => terminalCommand('toString', ROOT, 'win32'), TypeError);
  });

  test('macOS and Linux: Terminal / x-terminal-emulator, the folder as an argument or the working directory', () => {
    assert.deepEqual(terminalCommand('firebase-login', '/Users/me/Omni Task', 'darwin'), {
      via: 'launch',
      file: 'osascript',
      args: [
        '-e', 'on run argv',
        '-e', 'tell application "Terminal" to do script "cd " & quoted form of (item 1 of argv) & " && npx --yes firebase-tools@15 login"',
        '-e', 'tell application "Terminal" to activate',
        '-e', 'end run',
        '/Users/me/Omni Task',
      ],
      shown: 'npx --yes firebase-tools@15 login',
    });
    assert.equal(
      terminalCommand('deploy-functions', '/Users/me/Omni Task', 'darwin').args[3],
      'tell application "Terminal" to do script "cd " & quoted form of (item 1 of argv) & " && printf \'Type DEPLOY to deploy to PRODUCTION: \'; read a; if [ \\"$a\\" = DEPLOY ]; then npx --yes firebase-tools@15 deploy --only functions --project omnitask-475422; else echo \'Nothing was deployed.\'; fi"',
    );
    assert.equal(terminalCommand('terminal', '/r', 'darwin').args[3], 'tell application "Terminal" to do script "cd " & quoted form of (item 1 of argv)');
    assert.deepEqual(terminalCommand('terminal', '/home/me/omni task', 'linux'), { via: 'launch', file: 'x-terminal-emulator', args: [], shown: null });
    assert.deepEqual(terminalCommand('deploy-functions', '/home/me/omni task', 'linux'), {
      via: 'launch',
      file: 'x-terminal-emulator',
      args: [
        '-e',
        'sh',
        '-c',
        "echo '> npx --yes firebase-tools@15 deploy --only functions --project omnitask-475422'; printf 'Type DEPLOY to deploy to PRODUCTION: '; read a; if [ \"$a\" = DEPLOY ]; then npx --yes firebase-tools@15 deploy --only functions --project omnitask-475422; else echo 'Nothing was deployed.'; fi; echo; echo 'Finished. This window stays open.'; exec \"${SHELL:-sh}\"",
      ],
      shown: 'npx --yes firebase-tools@15 deploy --only functions --project omnitask-475422',
    });
  });

  test('the app is served the way the stack serves it', () => {
    const defaults = { app: 4200, auth: 9099, firestore: 8080, storage: 9199, functions: 5001, ui: 4000, hub: 4400 };
    assert.deepEqual(appServePlan(defaults, defaults, false), {
      args: ['serve', '--configuration', 'local'],
      configuration: 'local',
      port: 4200,
      missingEnvironment: false,
    });
    assert.deepEqual(appServePlan({ ...defaults, app: 4201 }, defaults, true).args, ['serve', '--configuration', 'local', '--port', '4201']);
    assert.deepEqual(appServePlan({ ...defaults, auth: 9100 }, defaults, true), {
      args: ['serve', '--configuration', 'local-remapped'],
      configuration: 'local-remapped',
      port: 4200,
      missingEnvironment: false,
    });
    assert.deepEqual(appServePlan({ ...defaults, auth: 9100, app: 4207 }, defaults, true).args, ['serve', '--configuration', 'local-remapped', '--port', '4207']);
    // Only what the app connects to needs the generated environment: the UI and the hub do not.
    assert.equal(appServePlan({ ...defaults, ui: 4001, hub: 4401 }, defaults, true).configuration, 'local');
    // Without the generated file there is nothing for local-remapped to build with.
    assert.deepEqual(appServePlan({ ...defaults, storage: 9200 }, defaults, false), {
      args: ['serve', '--configuration', 'local'],
      configuration: 'local',
      port: 4200,
      missingEnvironment: true,
    });
    assert.throws(() => appServePlan({ ...defaults, app: '4200; calc' }, defaults, false), TypeError);
  });

  test('the fixed command lists of the other jobs', () => {
    const root = tempDir('omnitask-steps-');
    const steps = defaultCommandSteps(root);
    assert.deepEqual(Object.keys(steps), ['tools', 'prod-logs', 'shortcut', 'shortcut-remove']);
    assert.deepEqual(
      steps.tools.map((step) => [path.basename(step.file).replace(/\.(exe|com)$/i, ''), step.args, step.label, Boolean(step.shim)]),
      [
        [path.basename(process.execPath).replace(/\.exe$/i, ''), ['-v'], 'node -v', false],
        ['java', ['-version'], 'java -version', false],
        ['yarn', ['-v'], 'yarn -v', true],
        ['git', ['--version'], 'git --version', false],
      ],
    );
    assert.equal(steps.tools[0].file, process.execPath);
    assert.deepEqual(Object.keys(steps['prod-logs']), ['generateSubtasks', 'suggestTaskPriority', 'suggestDueDate', 'enhanceTaskDescription']);
    assert.deepEqual(Object.keys(steps['prod-logs']), PROD_FUNCTIONS);
    for (const name of PROD_FUNCTIONS) {
      assert.deepEqual(steps['prod-logs'][name], [
        {
          file: 'npx',
          args: ['--yes', 'firebase-tools@15', 'functions:log', '--only', name, '--project', 'omnitask-475422'],
          cwd: root,
          shim: true,
          label: `npx --yes firebase-tools@15 functions:log --only ${name} --project omnitask-475422`,
        },
      ]);
    }
    const script = path.join(root, 'scripts', 'console-shortcut.ps1');
    assert.match(steps.shortcut[0].file, /powershell(\.exe)?$/);
    assert.deepEqual(steps.shortcut[0].args, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script]);
    assert.deepEqual(steps['shortcut-remove'][0].args, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Remove']);
    assert.equal(steps.shortcut[0].shim, undefined, 'started without a shell');
    // Every argument of a step that goes through the Windows shell is free of spaces and shell characters.
    for (const list of [steps.tools, ...Object.values(steps['prod-logs'])]) {
      for (const step of list.filter((s) => s.shim)) for (const arg of step.args) assert.match(arg, /^[A-Za-z0-9@:._-]+$/);
    }
  });
});

describe('actions: tools, production commands and terminal windows', () => {
  const quick = (script) => ({ file: process.execPath, args: ['-e', script], cwd: os.tmpdir(), label: 'step' });

  test('tools: every step runs and is reported, even after one is missing', async () => {
    const root = makeRoot();
    let probes = 0;
    const ctx = await startConsole({
      root,
      probeTools: async () => ({ node: process.version, java: probes++ ? '99.0.1' : null, yarn: '1.22.22' }),
      commandSteps: () => ({
        tools: [
          { ...quick("console.log('v-one')"), label: 'node -v' },
          { file: path.join(root, 'no-such-java'), args: ['-version'], cwd: root, label: 'java -version' },
          { ...quick("console.log('v-three');process.exit(4)"), label: 'yarn -v' },
          { ...quick("console.log('v-four')"), label: 'git --version' },
        ],
      }),
    });
    try {
      assert.equal((await ctx.api.state()).tools.java, null);
      const res = await ctx.api.act({ action: 'tools' });
      assert.equal(res.status, 200);
      assert.equal(res.json.state.job.action, 'tools');
      const job = await waitJob(ctx, 'tools');
      assert.equal(job.state, 'failed', 'a missing tool fails the job');
      assert.equal(job.exitCode, null, 'with the code of the first step that failed');
      const log = await ctx.api.logText();
      for (const line of ['job|$ node -v', 'job|v-one', 'job|$ java -version', 'job|(could not run)', 'job|$ yarn -v', 'job|v-three', 'job|(exit code 4)', 'job|$ git --version', 'job|v-four']) {
        assert.ok(log.includes(line), `${line}\n${log}`);
      }
      assert.equal((await ctx.api.state()).tools.java, '99.0.1', 'the header is read again after the job');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('prod-logs: only the four function names, one job at a time', async () => {
    const root = makeRoot();
    write(root, 'functions/.secret.local', `ANTHROPIC_API_KEY=${PATTERN_KEY}\n`);
    write(root, 'functions/lib/index.js', '');
    const picked = [];
    const ctx = await startConsole({
      root,
      commandSteps: (r) => ({
        'prod-logs': Object.fromEntries(
          PROD_FUNCTIONS.map((name) => [name, [{ ...quick(`console.log('logs for ${name}')`), label: defaultCommandSteps(r)['prod-logs'][name][0].label, picked: picked.push(name) }]]),
        ),
      }),
    });
    try {
      for (const fn of [undefined, null, '', 'generateSubtasks ', 'GENERATESUBTASKS', 'deleteEverything', 'generateSubtasks --project other', ['generateSubtasks'], { name: 'generateSubtasks' }, 0, true, '__proto__', 'constructor', 'toString']) {
        const res = await ctx.api.act({ action: 'prod-logs', fn });
        assert.equal(res.status, 400, JSON.stringify(fn));
        assert.deepEqual(res.json, { ok: false, error: 'fn must be one of generateSubtasks, suggestTaskPriority, suggestDueDate, enhanceTaskDescription.' });
      }
      assert.equal((await ctx.api.state()).job, null, 'nothing was started');
      fs.writeFileSync(path.join(root, 'functions', 'scripts', 'hold'), '');
      assert.equal((await ctx.api.act({ action: 'smoke' })).status, 200);
      const busy = await ctx.api.act({ action: 'prod-logs', fn: 'suggestDueDate' });
      assert.equal(busy.status, 409);
      assert.equal(busy.json.error, 'Wait for the running job (smoke) to finish first.');
      fs.rmSync(path.join(root, 'functions', 'scripts', 'hold'));
      await waitJob(ctx, 'smoke');
      assert.equal((await ctx.api.act({ action: 'prod-logs', fn: 'suggestDueDate' })).status, 200);
      const job = await waitJob(ctx, 'prod-logs');
      assert.equal(job.state, 'ok');
      const log = await ctx.api.logText();
      assert.ok(log.includes('job|$ npx --yes firebase-tools@15 functions:log --only suggestDueDate --project omnitask-475422'), log);
      assert.ok(log.includes('job|logs for suggestDueDate'), log);
      assert.ok(!log.includes('logs for generateSubtasks'));
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('deploy-functions needs confirm: true and then opens its own window', async () => {
    const tools = [];
    const ctx = await startConsole({
      platform: 'win32',
      runTool: async (file, args, opts) => {
        tools.push({ file, args, opts });
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    try {
      for (const confirm of [undefined, false, 'true', 1, 'yes', {}, [true]]) {
        const res = await ctx.api.act({ action: 'deploy-functions', confirm });
        assert.equal(res.status, 400, JSON.stringify(confirm));
        assert.deepEqual(res.json, { ok: false, error: 'confirm must be true to deploy the functions to production.' });
      }
      assert.equal(tools.length, 0, 'nothing was started without the confirmation');
      const res = await ctx.api.act({ action: 'deploy-functions', confirm: true });
      assert.equal(res.status, 200);
      assert.deepEqual(Object.keys(res.json), ['ok', 'message', 'state']);
      assert.equal(
        res.json.message,
        'Opened a terminal window running: npx --yes firebase-tools@15 deploy --only functions --project omnitask-475422. If the window is not in front, look for it on the taskbar.',
      );
      assert.equal(res.json.state.job, null, 'a window is not a job');
      assert.equal(tools.length, 1);
      const expected = terminalCommand('deploy-functions', ctx.root, 'win32');
      assert.equal(tools[0].file, expected.file);
      assert.deepEqual(tools[0].args, expected.args);
      assert.equal(tools[0].opts.cwd, ctx.root, 'started in the repository');
      assert.equal(tools[0].opts.env.OMNITASK_CONSOLE_REPO, ctx.root);
      assert.equal(ctx.launched.length, 0);
      const log = await ctx.api.logText();
      assert.ok(
        log.includes('console|Opened a terminal window running: npx --yes firebase-tools@15 deploy --only functions --project omnitask-475422. If the window is not in front, look for it on the taskbar. Its output is in that window, not in this log.'),
        log,
      );
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('deploy-functions waits for a running job, and one press opens one window', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const tools = [];
    const ctx = await startConsole({
      platform: 'win32',
      jobSteps: () => ({ pull: [{ label: 'slow pull', run: async () => gate }], install: [], smoke: [], checks: [] }),
      runTool: async (file, args, opts) => {
        tools.push({ file, args, opts });
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    try {
      assert.equal((await ctx.api.act({ action: 'pull' })).status, 200);
      const during = await ctx.api.act({ action: 'deploy-functions', confirm: true });
      assert.equal(during.status, 409);
      assert.equal(during.json.error, 'Wait for the running job (pull) to finish first.');
      assert.equal(tools.length, 0, 'no window while a job rewrites the tree');
      release(0);
      await waitJob(ctx, 'pull');
      const burst = await Promise.all(Array.from({ length: 8 }, () => ctx.api.act({ action: 'deploy-functions', confirm: true })));
      assert.deepEqual(burst.map((r) => r.status).sort(), [200, 409, 409, 409, 409, 409, 409, 409]);
      assert.equal(tools.length, 1, 'one window');
      assert.match(burst.find((r) => r.status === 409).json.error, /A deploy window was opened a moment ago\./);
      // The other windows are not held back by the deploy cooldown.
      assert.equal((await ctx.api.act({ action: 'firebase-login' })).status, 200);
      assert.equal(tools.length, 2);
      // The helper's answer comes from its exit, so inherited pipes cannot make it fail.
      assert.equal(tools[0].opts.exitGraceMs, 1500);
      assert.equal(tools[0].opts.timeoutMs, 20_000);
    } finally {
      release(0);
      await ctx.consoleServer.close();
    }
  });

  test('a deploy window that could not open does not start the cooldown', async () => {
    let code = 1;
    const ctx = await startConsole({ platform: 'win32', runTool: async () => ({ code, stdout: '', stderr: 'nope\r\n' }) });
    try {
      const failed = await ctx.api.act({ action: 'deploy-functions', confirm: true });
      assert.equal(failed.status, 409);
      assert.equal(failed.json.error, 'Could not open a PowerShell window: nope');
      code = 0;
      assert.equal((await ctx.api.act({ action: 'deploy-functions', confirm: true })).status, 200);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('terminal, firebase-login and secret-set open a window; a window that cannot open is a 409', async () => {
    const tools = [];
    let code = 0;
    const win = await startConsole({
      platform: 'win32',
      runTool: async (file, args, opts) => {
        tools.push({ file, args, opts });
        return { code, stdout: '', stderr: code ? 'This command cannot be run due to the error: The system cannot find the file specified.\r\n' : '' };
      },
    });
    const linux = await startConsole({ platform: 'linux' });
    const noTerminal = await startConsole({ platform: 'linux', launch: async () => false });
    try {
      for (const action of ['terminal', 'firebase-login', 'secret-set']) {
        const expected = terminalCommand(action, win.root, 'win32');
        const res = await win.api.act({ action });
        assert.equal(res.status, 200, action);
        assert.equal(res.json.message, (expected.shown ? `Opened a terminal window running: ${expected.shown}` : 'Opened a terminal window in the repository folder') +
            '. If the window is not in front, look for it on the taskbar.',
        );
        assert.deepEqual(tools.at(-1).args, expected.args);
      }
      assert.ok((await win.api.logText()).includes('console|Opened a terminal window in the repository folder.'));
      code = 1;
      const failed = await win.api.act({ action: 'firebase-login' });
      assert.equal(failed.status, 409);
      assert.equal(failed.json.error, 'Could not open a PowerShell window: This command cannot be run due to the error: The system cannot find the file specified.');

      const opened = await linux.api.act({ action: 'secret-set' });
      assert.equal(opened.status, 200);
      assert.deepEqual(linux.launched, [
        [
          'x-terminal-emulator',
          terminalCommand('secret-set', linux.root, 'linux').args,
        ],
      ]);
      assert.ok(linux.launched[0][1][3].includes('functions:secrets:set ANTHROPIC_API_KEY --project omnitask-475422'));

      const none = await noTerminal.api.act({ action: 'firebase-login' });
      assert.equal(none.status, 409);
      assert.equal(none.json.error, `Could not open a terminal window. Run it yourself in ${noTerminal.root}: npx --yes firebase-tools@15 login`);
      assert.equal((await noTerminal.api.act({ action: 'terminal' })).json.error, `Could not open a terminal window. The folder is ${noTerminal.root}`);
    } finally {
      await Promise.all([win, linux, noTerminal].map((ctx) => ctx.consoleServer.close()));
    }
  });

  test('the Windows-only steps answer 409 elsewhere and start nothing', async () => {
    const tools = [];
    const ctx = await startConsole({
      platform: 'linux',
      runTool: async (...call) => {
        tools.push(call);
        return { code: 0, stdout: '', stderr: '' };
      },
      runElevated: async (...call) => {
        tools.push(call);
        return { status: 'ok', exitCode: 0, lines: [] };
      },
    });
    try {
      write(ctx.root, 'scripts/console-shortcut.ps1', '# stand-in');
      const state = await ctx.api.state();
      assert.deepEqual(state.setup.platformSupports, { elevation: false, shortcut: false });
      for (const action of ['ports-reserve', 'ports-unreserve']) {
        const res = await ctx.api.act({ action });
        assert.equal(res.status, 409, action);
        assert.equal(res.json.error, 'This is a Windows-only step: only Windows hands ports to Hyper-V, WSL and Docker. Nothing to do on this system.');
      }
      for (const action of ['shortcut', 'shortcut-remove']) {
        const res = await ctx.api.act({ action });
        assert.equal(res.status, 409, action);
        assert.equal(res.json.error, 'Shortcuts are a Windows-only step. On this system, start the console with: yarn console');
      }
      assert.equal(tools.length, 0);
      assert.equal((await ctx.api.state()).job, null);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('shortcut and shortcut-remove run the script as a job on Windows', async () => {
    const asked = [];
    const ctx = await startConsole({
      platform: 'win32',
      commandSteps: (r) => {
        const real = defaultCommandSteps(r);
        const stand = (name) => [{ ...quick(`console.log('ran ${name}')`), label: real[name][0].label, tag: asked.push(name) }];
        return { shortcut: stand('shortcut'), 'shortcut-remove': stand('shortcut-remove') };
      },
    });
    try {
      const missing = await ctx.api.act({ action: 'shortcut' });
      assert.equal(missing.status, 409);
      assert.equal(missing.json.error, 'scripts/console-shortcut.ps1 is not on this branch.');
      write(ctx.root, 'scripts/console-shortcut.ps1', '# stand-in');
      assert.deepEqual((await ctx.api.state()).setup.platformSupports, { elevation: true, shortcut: true });
      assert.equal((await ctx.api.act({ action: 'shortcut' })).status, 200);
      assert.equal((await waitJob(ctx, 'shortcut')).state, 'ok');
      assert.equal((await ctx.api.act({ action: 'shortcut-remove' })).status, 200);
      assert.equal((await waitJob(ctx, 'shortcut-remove')).state, 'ok');
      const log = await ctx.api.logText();
      assert.ok(log.includes('job|$ powershell -NoProfile -ExecutionPolicy Bypass -File scripts/console-shortcut.ps1\njob|ran shortcut'), log);
      assert.ok(log.includes('job|$ powershell -NoProfile -ExecutionPolicy Bypass -File scripts/console-shortcut.ps1 -Remove\njob|ran shortcut-remove'), log);
    } finally {
      await ctx.consoleServer.close();
    }
  });
});

describe('actions: ports-reserve / ports-unreserve', () => {
  /** A console that believes it is on Windows, with a helper PowerShell that plays the elevated script. */
  async function winConsole(elevated, extra = {}) {
    const tools = [];
    const root = makeRoot();
    // Defaults come from firebase.json, not from literals and not from the ports file.
    write(root, 'firebase.json', JSON.stringify({ emulators: { auth: { port: 9555 }, firestore: { port: 8080 }, functions: { port: 5001 }, storage: { port: 9199 }, ui: { port: 4000 } } }));
    write(root, '.local-dev-ports.json', JSON.stringify({ app: 4200, auth: 9777, firestore: 8080, storage: 9199, functions: 5001, ui: 4000, hub: 4400, pid: process.pid }));
    const ctx = await startConsole({
      root,
      platform: 'win32',
      runTool: async (file, args, opts) => {
        const call = { file, args, opts };
        tools.push(call);
        if (/netsh(\.exe)?$/.test(file)) return { code: 0, stdout: '\r\nProtocol tcp Port Exclusion Ranges\r\n      9555        9555     *\r\n', stderr: '' };
        call.outer = decodeEncoded(args);
        call.inner = decodeInner(call.outer);
        call.resultFile = Buffer.from(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(call.inner)[1], 'base64').toString('utf16le');
        return elevated(call);
      },
      ...extra,
    });
    return { ...ctx, tools };
  }

  test('one elevated PowerShell reserves every default port, then the result is shown', async () => {
    const ctx = await winConsole(({ resultFile }) => {
      fs.appendFileSync(resultFile, 'port 4200: kept for the local stack\r\nport 9555: not changed. Windows said: The process cannot access the file because it is being used by another process.\r\n::exit::0\r\n');
      return { code: 0, stdout: '', stderr: '' };
    });
    try {
      const res = await ctx.api.act({ action: 'ports-reserve', ports: [1, 2, 3], startport: '22', store: 'active' });
      assert.equal(res.status, 200);
      assert.equal(res.json.state.job.action, 'ports-reserve');
      const job = await waitJob(ctx, 'ports-reserve');
      assert.deepEqual([job.state, job.exitCode, job.declined], ['ok', 0, false]);
      const elevated = ctx.tools.filter((call) => call.inner);
      assert.equal(elevated.length, 1, 'one PowerShell, one UAC prompt');
      assert.match(elevated[0].file, /powershell(\.exe)?$/);
      assert.ok(elevated[0].outer.includes("$psi.Verb = 'runas'"));
      assert.ok(elevated[0].inner.includes('foreach ($n in @(4200,9555,8080,9199,5001,4000,4400)) {'), elevated[0].inner);
      assert.ok(elevated[0].inner.includes('interface ipv4 add excludedportrange protocol=tcp startport=$n numberofports=1 store=persistent'));
      assert.ok(!elevated[0].inner.includes('9777'), 'the ports of the current run are not what gets reserved');
      assert.ok(!elevated[0].inner.includes('store=active'));
      assert.equal(fs.existsSync(elevated[0].resultFile), false);
      const show = ctx.tools.filter((call) => !call.inner);
      assert.deepEqual(show.map((call) => call.args), [['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp']]);
      const log = await ctx.api.logText();
      for (const line of [
        'job|$ netsh interface ipv4 add excludedportrange protocol=tcp startport=<4200|9555|8080|9199|5001|4000|4400> numberofports=1 store=persistent  (as administrator)',
        'job|Asking Windows for administrator permission (answer the prompt). If no prompt appears, click the flashing shield button on the taskbar.',
        'job|port 4200: kept for the local stack',
        'job|port 9555: not changed. Windows said: The process cannot access the file',
        'job|A port that was "not changed" is already reserved',
        'job|$ netsh interface ipv4 show excludedportrange protocol=tcp',
        'job|      9555        9555     *',
        'console|ports-reserve: finished.',
      ]) {
        assert.ok(log.includes(line), `${line}\n${log}`);
      }
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('ports-unreserve deletes the same ranges', async () => {
    const ctx = await winConsole(({ resultFile }) => {
      fs.appendFileSync(resultFile, 'port 4200: given back to Windows\r\n::exit::0\r\n');
      return { code: 0, stdout: '', stderr: '' };
    });
    try {
      assert.equal((await ctx.api.act({ action: 'ports-unreserve' })).status, 200);
      assert.equal((await waitJob(ctx, 'ports-unreserve')).state, 'ok');
      const [elevated] = ctx.tools.filter((call) => call.inner);
      assert.ok(elevated.inner.includes('interface ipv4 delete excludedportrange protocol=tcp startport=$n numberofports=1 store=persistent'));
      assert.ok(elevated.inner.includes('@(4200,9555,8080,9199,5001,4000,4400)'));
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a declined prompt ends the job without an error, in plain words', async () => {
    const ctx = await winConsole(() => ({ code: 1223, stdout: '', stderr: '' }));
    try {
      assert.equal((await ctx.api.act({ action: 'ports-reserve' })).status, 200);
      const job = await waitJob(ctx, 'ports-reserve');
      assert.deepEqual([job.state, job.exitCode, job.declined], ['ok', 0, true]);
      assert.equal(ctx.tools.filter((call) => !call.inner).length, 0, 'nothing changed, so nothing is listed');
      const log = await ctx.api.logText();
      assert.ok(log.includes('job|Windows did not get permission; nothing was changed.'), log);
      assert.ok(log.includes('console|ports-reserve: Windows did not get permission; nothing was changed.'), log);
      assert.ok(!log.includes('failed'), log);
      assert.ok(!log.includes('finished'), log);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('a helper that cannot run is a failed job; a second press while one runs is a 409', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const ctx = await winConsole(async () => {
      await gate;
      return { code: 1, stdout: '', stderr: 'Start-Process : boom\r\n' };
    });
    try {
      assert.equal((await ctx.api.act({ action: 'ports-reserve' })).status, 200);
      const again = await ctx.api.act({ action: 'ports-unreserve' });
      assert.equal(again.status, 409);
      assert.equal(again.json.error, 'Wait for the running job (ports-reserve) to finish first.');
      release();
      const job = await waitJob(ctx, 'ports-reserve');
      assert.deepEqual([job.state, job.exitCode, job.declined], ['failed', 1, false]);
      const log = await ctx.api.logText();
      assert.ok(log.includes('job|Start-Process : boom'), log);
      assert.ok(log.includes('job|The administrator step could not be started; nothing was changed.'), log);
    } finally {
      release();
      await ctx.consoleServer.close();
    }
  });
});

describe('actions: port-find / port-free', () => {
  const FREE = { ok: true, listeners: [] };

  test('port-find lists every stack port with what holds it', async () => {
    const asked = [];
    const ctx = await startConsole({
      findListeners: async (ports) => {
        asked.push(ports);
        return { ok: true, listeners: [{ port: 4200, pid: 4242, name: 'node' }, { port: 9099, pid: 77, name: 'java' }, { port: 9099, pid: 78, name: 'ja`va$(x)' }] };
      },
    });
    try {
      const res = await ctx.api.act({ action: 'port-find' });
      assert.equal(res.status, 200);
      assert.equal((await waitJob(ctx, 'port-find')).state, 'ok');
      assert.deepEqual(asked, [[4200, 9099, 8080, 9199, 5001, 4000, 4400]]);
      const log = await ctx.api.logText();
      for (const line of [
        `job|$ ${IS_WINDOWS ? 'Get-NetTCPConnection -State Listen' : 'lsof -nP -iTCP -sTCP:LISTEN'}  (ports 4200, 9099, 8080, 9199, 5001, 4000, 4400)`,
        'job|app        4200   node (pid 4242)',
        'job|auth       9099   java (pid 77), java(x) (pid 78)',
        'job|firestore  8080   nothing is listening',
        'job|hub        4400   nothing is listening',
      ]) {
        assert.ok(log.includes(line), `${line}\n${log}`);
      }
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('port-find on Windows runs the fixed pipeline through the hidden PowerShell', async () => {
    const tools = [];
    const ctx = await startConsole({
      platform: 'win32',
      runTool: async (file, args) => {
        tools.push({ file, args });
        return { code: 0, stdout: '4000|4242|java\r\n', stderr: '' };
      },
    });
    try {
      assert.equal((await ctx.api.act({ action: 'port-find' })).status, 200);
      assert.equal((await waitJob(ctx, 'port-find')).state, 'ok');
      assert.equal(tools.length, 1);
      assert.match(tools[0].file, /powershell(\.exe)?$/);
      assert.deepEqual(tools[0].args, powerShellArgs(portFindScript(WIN_PORTS)));
      assert.ok((await ctx.api.logText()).includes('job|ui         4000   java (pid 4242)'));
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('port-free takes one of the seven names and nothing else', async () => {
    const calls = [];
    const ctx = await startConsole({
      findListeners: async (ports) => {
        calls.push(ports);
        return FREE;
      },
    });
    try {
      for (const name of [undefined, null, '', 'App', 'app ', 'console', '4200', 4200, ['app'], { name: 'app' }, '__proto__', 'constructor', 'app; taskkill /IM *']) {
        const res = await ctx.api.act({ action: 'port-free', name, pid: 1, port: 22 });
        assert.equal(res.status, 400, JSON.stringify(name));
        assert.deepEqual(res.json, { ok: false, error: 'name must be one of app, auth, firestore, storage, functions, ui, hub.' });
      }
      assert.equal(calls.length, 0);
      const nothing = await ctx.api.act({ action: 'port-free', name: 'ui', port: 22, pid: 1 });
      assert.equal(nothing.status, 409);
      assert.equal(nothing.json.error, 'Nothing is listening on port 4000 (ui).');
      assert.deepEqual(calls, [[4000]], 'the port is the one the state shows, whatever the request says');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('port-free never ends the console, what it started, or the operating system', async () => {
    let holder = null;
    const killed = [];
    const ctx = await startConsole({
      findListeners: async (ports) => (holder === 'error' ? { ok: false, error: 'lsof is not installed, or it did not answer.' } : { ok: true, listeners: [{ port: ports[0], pid: holder, name: 'node' }] }),
      kill: (pid, signal) => killed.push([pid, signal]),
      runTool: async (...call) => {
        killed.push(call);
        return { code: 0, stdout: '', stderr: '' };
      },
      runElevated: async (...call) => {
        killed.push(call);
        return { status: 'ok', exitCode: 0, lines: [] };
      },
      spawnApp: standIn(),
    });
    try {
      write(ctx.root, 'node_modules/@angular/cli/bin/ng.js', '');
      const refuse = async (name, pid, error) => {
        holder = pid;
        const res = await ctx.api.act({ action: 'port-free', name });
        assert.equal(res.status, 409, `${name} ${pid}`);
        assert.equal(res.json.error, error);
      };
      await refuse('ui', process.pid, `Port 4000 is held by this console or by something it started (pid ${process.pid}). Use Stop or Quit instead.`);
      await refuse('ui', process.ppid, `Port 4000 is held by this console or by something it started (pid ${process.ppid}). Use Stop or Quit instead.`);
      for (const pid of [0, 1, 4]) await refuse('hub', pid, `Port 4400 is held by the operating system itself (pid ${pid}), which the console never ends.`);
      await refuse('hub', 'error', 'Could not look up what is using port 4400: lsof is not installed, or it did not answer.');

      // The app dev server this console started.
      assert.equal((await ctx.api.act({ action: 'app-start' })).status, 200);
      const appPid = (await ctx.api.state()).app.pid;
      await refuse('app', 4242, 'The app dev server this console started is using port 4200. Use Stop app instead.');
      await refuse('ui', appPid, `Port 4000 is held by this console or by something it started (pid ${appPid}). Use Stop or Quit instead.`);
      assert.equal((await ctx.api.act({ action: 'app-stop' })).status, 200);
      await waitFor(async () => (await ctx.api.state()).app.state === 'stopped', 'the app to stop');

      // The stack this console started: emulators only leaves the app port alone, the full stack owns all seven.
      assert.equal((await ctx.api.act({ action: 'start', mode: 'emulators' })).status, 200);
      const stackPid = (await ctx.api.state()).stack.pid;
      for (const name of ['auth', 'firestore', 'storage', 'functions', 'ui', 'hub']) {
        const port = (await ctx.api.state()).ports.find((p) => p.name === name).port;
        await refuse(name, 4242, `The stack this console started is using port ${port}. Use Stop instead.`);
      }
      await refuse('app', stackPid, `Port 4200 is held by this console or by something it started (pid ${stackPid}). Use Stop or Quit instead.`);
      assert.equal((await ctx.api.act({ action: 'stop' })).status, 200);
      await waitFor(async () => (await ctx.api.state()).stack.state === 'stopped', 'the stack to stop');
      assert.equal((await ctx.api.act({ action: 'start', mode: 'full' })).status, 200);
      await refuse('app', 4242, 'The stack this console started is using port 4200. Use Stop instead.');

      assert.deepEqual(killed, [], 'nothing was ended and no helper was started');
      assert.equal((await ctx.api.state()).job, null);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('Windows: taskkill by PID with /T /F, and the port is checked afterwards', async () => {
    const tools = [];
    let listening = true;
    const ctx = await startConsole({
      platform: 'win32',
      portFreeWaitMs: 50,
      findListeners: async () => ({ ok: true, listeners: listening ? [{ port: 9099, pid: 4242, name: 'java' }, { port: 9099, pid: 4243, name: 'java' }] : [] }),
      runTool: async (file, args) => {
        tools.push({ file, args });
        if (args[1] === '4243') listening = false;
        return { code: 0, stdout: `SUCCESS: The process with PID ${args[1]} has been terminated.\r\n`, stderr: '' };
      },
      runElevated: async () => assert.fail('no elevation when Windows did not refuse'),
    });
    try {
      const res = await ctx.api.act({ action: 'port-free', name: 'auth', pid: '999', pids: [1], force: true });
      assert.equal(res.status, 200);
      const job = await waitJob(ctx, 'port-free');
      assert.deepEqual([job.state, job.exitCode, job.declined], ['ok', 0, false]);
      assert.deepEqual(tools.map((call) => call.args), [['/PID', '4242', '/T', '/F'], ['/PID', '4243', '/T', '/F']]);
      for (const call of tools) assert.match(call.file, /taskkill(\.exe)?$/);
      const log = await ctx.api.logText();
      for (const line of ['job|$ taskkill /PID 4242 /T /F ; taskkill /PID 4243 /T /F', 'job|Port 9099 (auth) is held by java (pid 4242), java (pid 4243).', 'job|SUCCESS: The process with PID 4243 has been terminated.', 'job|Port 9099 is free.']) {
        assert.ok(log.includes(line), `${line}\n${log}`);
      }
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('Windows: access denied leads to the same kill, elevated, for the PIDs the console found', async () => {
    const tools = [];
    let listening = true;
    let answer = 'allow';
    const ctx = await startConsole({
      platform: 'win32',
      portFreeWaitMs: 50,
      findListeners: async () => ({ ok: true, listeners: listening ? [{ port: 4400, pid: 4242, name: 'java' }] : [] }),
      runTool: async (file, args) => {
        const call = { file, args };
        tools.push(call);
        if (/taskkill/.test(file)) return { code: 1, stdout: '', stderr: 'ERROR: The process with PID 4242 could not be terminated.\r\nReason: Access is denied.\r\n' };
        call.inner = decodeInner(decodeEncoded(args));
        if (answer === 'decline') return { code: 1223, stdout: '', stderr: '' };
        const resultFile = Buffer.from(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(call.inner)[1], 'base64').toString('utf16le');
        fs.appendFileSync(resultFile, 'pid 4242: SUCCESS: The process with PID 4242 has been terminated.\r\n::exit::0\r\n');
        listening = false;
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    try {
      answer = 'decline';
      assert.equal((await ctx.api.act({ action: 'port-free', name: 'hub', pid: 31337 })).status, 200);
      let job = await waitJob(ctx, 'port-free');
      assert.deepEqual([job.state, job.exitCode, job.declined], ['ok', 0, true]);
      let log = await ctx.api.logText();
      assert.ok(log.includes('job|Reason: Access is denied.'), log);
      assert.ok(
        log.includes('job|Windows refused: the program runs with administrator rights. Asking Windows for permission to end it... If no prompt appears, click the flashing shield button on the taskbar.'),
        log,
      );
      assert.ok(log.includes('console|port-free: Windows did not get permission; nothing was changed.'), log);

      answer = 'allow';
      tools.length = 0;
      assert.equal((await ctx.api.act({ action: 'port-free', name: 'hub', pid: 31337 })).status, 200);
      await waitFor(async () => (await ctx.api.state()).job.id === job.id + 1, 'the second job');
      job = await waitJob(ctx, 'port-free');
      assert.deepEqual([job.state, job.exitCode, job.declined], ['ok', 0, false]);
      assert.deepEqual(tools[0].args, ['/PID', '4242', '/T', '/F']);
      assert.equal(tools.length, 2);
      assert.ok(tools[1].inner.includes('foreach ($n in @(4242)) {'), tools[1].inner);
      assert.ok(tools[1].inner.includes('& $taskkill /PID $n /T /F'));
      assert.ok(!tools[1].inner.includes('31337'));
      log = await ctx.api.logText();
      assert.ok(log.includes('job|pid 4242: SUCCESS: The process with PID 4242 has been terminated.'), log);
      assert.ok(log.includes('job|Port 4400 is free.'), log);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('port-free refuses ports below 1024, whichever file chose them', async () => {
    const asked = [];
    const root = makeRoot();
    write(root, '.local-dev-ports.json', JSON.stringify({ app: 4200, auth: 9099, firestore: 8080, storage: 9199, functions: 5001, ui: 4000, hub: 443, pid: process.pid }));
    const ctx = await startConsole({
      root,
      platform: 'win32',
      findListeners: async (ports) => {
        asked.push(ports);
        return { ok: true, listeners: [{ port: ports[0], pid: 4242, name: 'node' }] };
      },
      runTool: async () => assert.fail('nothing is ended'),
      runElevated: async () => assert.fail('no prompt'),
    });
    try {
      const res = await ctx.api.act({ action: 'port-free', name: 'hub' });
      assert.equal(res.status, 409);
      assert.equal(res.json.error, 'Port 443 (hub) is below 1024: those belong to the system, and the console never ends what holds one.');
      assert.deepEqual(asked, [], 'the system was not even asked');
    } finally {
      await ctx.consoleServer.close();
    }
    // The same through the tracked firebase.json: with no live stack the default is what counts.
    const root2 = makeRoot();
    write(root2, 'firebase.json', JSON.stringify({ emulators: { firestore: { port: 135 }, functions: { port: 445 } } }));
    const ctx2 = await startConsole({ root: root2, platform: 'win32', findListeners: async () => assert.fail('not asked') });
    try {
      for (const [name, port] of [['firestore', 135], ['functions', 445]]) {
        assert.equal((await ctx2.api.state()).ports.find((p) => p.name === name).port, port);
        assert.equal((await ctx2.api.act({ action: 'port-free', name })).status, 409, name);
      }
    } finally {
      await ctx2.consoleServer.close();
    }
  });

  test('port-free ignores a ports file without a live pid, and believes one with a live pid', async () => {
    const asked = []; // the port each lookup was for
    const listeners = (ports) => ({ ok: true, listeners: [{ port: ports[0], pid: 4242, name: 'node' }] });
    const run = async (extra, expectedPort) => {
      const root = makeRoot();
      write(root, '.local-dev-ports.json', JSON.stringify({ app: 4200, auth: 9099, firestore: 8080, storage: 9199, functions: 5001, ui: 4000, hub: 36503, ...extra }));
      const ctx = await startConsole({
        root,
        platform: 'linux',
        portFreeWaitMs: 20,
        kill: () => {},
        findListeners: async (ports) => {
          asked.push(ports[0]);
          return listeners(ports);
        },
      });
      try {
        assert.equal((await ctx.api.act({ action: 'port-free', name: 'hub' })).status, 200);
        await waitJob(ctx, 'port-free');
        assert.equal(asked.at(-1), expectedPort);
      } finally {
        await ctx.consoleServer.close();
      }
    };
    await run({}, 4400);
    await run({ pid: 2_000_000_000 }, 4400); // a pid nobody has
    await run({ pid: process.pid }, 36503);
  });

  test('port-free refuses the number of a managed port, whatever the name', async () => {
    const root = makeRoot();
    // "ui" is forged onto the number the app dev server is using.
    write(root, '.local-dev-ports.json', JSON.stringify({ app: 4200, auth: 9099, firestore: 8080, storage: 9199, functions: 5001, ui: 4200, hub: 4400, pid: process.pid }));
    write(root, 'node_modules/@angular/cli/bin/ng.js', '');
    const killed = [];
    const ctx = await startConsole({
      root,
      kill: (pid) => killed.push(pid),
      findListeners: async (ports) => ({ ok: true, listeners: [{ port: ports[0], pid: 4242, name: 'node' }] }),
      spawnApp: standIn(),
    });
    try {
      assert.equal((await ctx.api.act({ action: 'app-start' })).status, 200);
      const res = await ctx.api.act({ action: 'port-free', name: 'ui' });
      assert.equal(res.status, 409);
      assert.equal(res.json.error, 'Port 4200 is one that the app dev server this console started is using. Use Stop app instead.');
      assert.deepEqual(killed, []);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('Windows: a system program holding the port is not ended and raises no prompt', async () => {
    for (const name of ['svchost', 'svchost.exe', 'LSASS', 'wininit', 'services', 'csrss', 'smss', 'System', 'Registry']) {
      const ctx = await startConsole({
        platform: 'win32',
        findListeners: async () => ({ ok: true, listeners: [{ port: 9099, pid: 1234, name }] }),
        runTool: async () => assert.fail('nothing is ended'),
        runElevated: async () => assert.fail('no prompt'),
      });
      try {
        const res = await ctx.api.act({ action: 'port-free', name: 'auth' });
        assert.equal(res.status, 409, name);
        assert.equal(res.json.error, `Port 9099 is held by ${name} (pid 1234), a Windows system program, which the console never ends.`);
        assert.ok((await ctx.api.logText()).includes(`console|port-free: port 9099 (auth) is held by ${name} (pid 1234), a Windows system program. It was not ended and no administrator prompt was raised.`));
        assert.equal((await ctx.api.state()).job, null);
      } finally {
        await ctx.consoleServer.close();
      }
    }
  });

  test('Windows: only "access denied" (1) raises the prompt; "no such process" (128) says a child holds the port', async () => {
    for (const [code, elevates] of [[1, true], [128, false], [5, false], [null, false]]) {
      let elevations = 0;
      const ctx = await startConsole({
        platform: 'win32',
        portFreeWaitMs: 20,
        findListeners: async () => ({ ok: true, listeners: [{ port: 4400, pid: 4242, name: 'node' }] }),
        runTool: async () => ({ code, stdout: '', stderr: code === 128 ? 'ERROR: The process "4242" not found.\r\n' : '' }),
        runElevated: async () => {
          elevations += 1;
          return { status: 'declined', exitCode: null, lines: [] };
        },
      });
      try {
        assert.equal((await ctx.api.act({ action: 'port-free', name: 'hub' })).status, 200);
        const job = await waitJob(ctx, 'port-free');
        assert.equal(elevations, elevates ? 1 : 0, `taskkill code ${code}`);
        const log = await ctx.api.logText();
        if (code === 128) {
          assert.deepEqual([job.state, job.exitCode, job.declined], ['failed', 1, false]);
          assert.ok(log.includes('job|The process that opened port 4400 (pid 4242) has already ended, and a program it started still holds the port.'), log);
          assert.ok(log.includes('job|Port 4400 is still in use (pid 4242).'), log);
          assert.ok(!log.includes('Windows refused'), log);
        }
        if (!elevates) assert.ok(!log.includes('Asking Windows'), log);
      } finally {
        await ctx.consoleServer.close();
      }
    }
  });

  test('elsewhere: a plain kill, and EPERM is reported instead of worked around', async () => {
    const signals = [];
    const ctx = await startConsole({
      platform: 'linux',
      portFreeWaitMs: 50,
      findListeners: async () => ({ ok: true, listeners: [{ port: 8080, pid: 4242, name: 'java' }] }),
      kill: (pid, signal) => {
        signals.push([pid, signal]);
        throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
      },
      runTool: async () => assert.fail('no helper program is used'),
      runElevated: async () => assert.fail('no elevation outside Windows'),
    });
    try {
      assert.equal((await ctx.api.act({ action: 'port-free', name: 'firestore' })).status, 200);
      const job = await waitJob(ctx, 'port-free');
      assert.deepEqual([job.state, job.exitCode], ['failed', 1]);
      assert.deepEqual(signals, [[4242, 'SIGTERM']]);
      const log = await ctx.api.logText();
      assert.ok(log.includes('job|$ kill 4242'), log);
      assert.ok(log.includes('job|pid 4242 belongs to another user, so it was not ended (EPERM). In a terminal: sudo kill 4242'), log);
      assert.ok(log.includes('job|Port 8080 is still in use (pid 4242).'), log);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('for real: finds a listening process by its port and ends it', { skip: IS_WINDOWS || !findOnPath('lsof') }, async () => {
    const child = standIn({ listen: true })();
    const port = await new Promise((resolve, reject) => {
      let text = '';
      child.stdout.on('data', (chunk) => {
        text += chunk;
        const match = /port=(\d+)/.exec(text);
        if (match) resolve(Number(match[1]));
      });
      child.once('exit', () => reject(new Error('the listener ended early')));
    });
    const root = makeRoot();
    write(root, '.local-dev-ports.json', JSON.stringify({ app: 4200, auth: 9099, firestore: 8080, storage: 9199, functions: 5001, ui: port, hub: 4400, pid: process.pid }));
    const ctx = await startConsole({ root, portFreeWaitMs: 3000 });
    try {
      assert.equal((await ctx.api.act({ action: 'port-find' })).status, 200);
      assert.equal((await waitJob(ctx, 'port-find')).state, 'ok');
      assert.match(await ctx.api.logText(), new RegExp(`job\\|ui +${port} +\\S+ \\(pid ${child.pid}\\)`));
      assert.equal((await ctx.api.act({ action: 'port-free', name: 'ui' })).status, 200);
      const job = await waitJob(ctx, 'port-free');
      assert.equal(job.state, 'ok', await ctx.api.logText());
      await waitFor(() => exited(child), 'the listener to be gone');
      assert.ok((await ctx.api.logText()).includes(`job|Port ${port} is free.`));
      const gone = await ctx.api.act({ action: 'port-free', name: 'ui' });
      assert.equal(gone.status, 409);
      assert.equal(gone.json.error, `Nothing is listening on port ${port} (ui).`);
    } finally {
      if (!exited(child)) child.kill('SIGKILL');
      await ctx.consoleServer.close();
    }
  });
});

describe('actions: app-start / app-stop', () => {
  /** A console whose "ng serve" is a stand-in child; `spawned` records the arguments it was given. */
  async function appConsole(options = {}) {
    const spawned = [];
    const children = [];
    const make = standIn();
    const root = options.root ?? makeRoot();
    write(root, 'node_modules/@angular/cli/bin/ng.js', '');
    const ctx = await startConsole({
      root,
      spawnApp: (args, extra) => {
        spawned.push({ args, extra });
        const child = make(args);
        children.push(child);
        return child;
      },
      ...options,
    });
    return { ...ctx, spawned, children };
  }

  test('lifecycle: starting, running once the port answers, stopped with its tree gone', async () => {
    const ctx = await appConsole();
    try {
      const notRunning = await ctx.api.act({ action: 'app-stop' });
      assert.equal(notRunning.status, 409);
      assert.equal(notRunning.json.error, 'The app dev server is not running.');

      const res = await ctx.api.act({ action: 'app-start', port: 1, configuration: 'production', args: ['--open'] });
      assert.equal(res.status, 200);
      assert.equal(res.json.message, 'Starting the app dev server on port 4200.');
      assert.deepEqual(ctx.spawned, [{ args: ['serve', '--configuration', 'local'], extra: { root: ctx.root } }]);
      const [child] = ctx.children;
      let app = res.json.state.app;
      assert.deepEqual(Object.keys(app), ['state', 'pid', 'since', 'lastExit', 'port', 'configuration']);
      assert.deepEqual([app.state, app.pid, app.lastExit, app.port, app.configuration], ['starting', child.pid, null, 4200, 'local']);
      assert.ok(!Number.isNaN(Date.parse(app.since)));
      assert.equal(res.json.state.stack.state, 'stopped');

      const again = await ctx.api.act({ action: 'app-start' });
      assert.equal(again.status, 409);
      assert.equal(again.json.error, 'The app dev server is already running.');

      await waitFor(async () => (await ctx.api.logText()).includes('app|ng stand-in: serve --configuration local'), 'the output of the app');
      assert.ok((await ctx.api.logText()).includes('app|warn: '), 'stderr goes to the log too');
      assert.ok((await ctx.api.logText()).includes('console|Starting the app dev server (ng serve --configuration local)...'));

      ctx.openPorts.push(4200);
      const state = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.app.state === 'running' ? s : null;
      }, 'the app to be running');
      assert.equal(state.stack.state, 'stopped', 'its own app port does not make the stack "external"');
      assert.ok((await ctx.api.logText()).includes('console|The app is up: http://localhost:4200/'));

      for (const [body, error] of [
        [{ action: 'start', mode: 'full' }, 'Stop the app dev server first: the full stack starts its own.'],
        [{ action: 'pull' }, 'Stop the app dev server first.'],
        [{ action: 'install' }, 'Stop the app dev server first.'],
      ]) {
        const refused = await ctx.api.act(body);
        assert.equal(refused.status, 409, body.action);
        assert.equal(refused.json.error, error);
      }

      const stop = await ctx.api.act({ action: 'app-stop' });
      assert.equal(stop.status, 200);
      ctx.openPorts.length = 0;
      await waitFor(() => exited(child), 'the app process to be gone');
      const after = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.app.state === 'stopped' ? s : null;
      }, 'the app to be stopped');
      assert.deepEqual([after.app.pid, after.app.since, after.app.port, after.app.configuration], [null, null, null, null]);
      assert.ok(!Number.isNaN(Date.parse(after.app.lastExit.at)));
      assert.ok((await ctx.api.logText()).includes('console|The app dev server has stopped.'));
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('the configuration and the port follow the ports file the stack wrote', async () => {
    const moved = (ports) => JSON.stringify({ app: 4200, auth: 9099, firestore: 8080, storage: 9199, functions: 5001, ui: 4000, hub: 4400, pid: process.pid, ...ports });
    const cases = [
      [{ auth: 9100 }, true, ['serve', '--configuration', 'local-remapped'], 4200, 'local-remapped'],
      [{ app: 4207, firestore: 8081, remapped: ['app', 'firestore', '; calc'] }, true, ['serve', '--configuration', 'local-remapped', '--port', '4207'], 4207, 'local-remapped'],
      [{ app: 4207 }, false, ['serve', '--configuration', 'local', '--port', '4207'], 4207, 'local'],
      [{ auth: 9100 }, false, ['serve', '--configuration', 'local'], 4200, 'local'],
      [{ ui: 4001, hub: 4401 }, true, ['serve', '--configuration', 'local'], 4200, 'local'],
    ];
    for (const [ports, withEnvironment, args, port, configuration] of cases) {
      const root = makeRoot();
      write(root, '.local-dev-ports.json', moved(ports));
      if (withEnvironment) write(root, 'src/environments/environment.local-remapped.ts', 'export const environment = {};\n');
      const ctx = await appConsole({ root });
      try {
        const res = await ctx.api.act({ action: 'app-start' });
        assert.equal(res.status, 200, JSON.stringify(ports));
        assert.deepEqual(ctx.spawned[0].args, args, JSON.stringify(ports));
        assert.deepEqual([res.json.state.app.port, res.json.state.app.configuration], [port, configuration]);
        const warned = (await ctx.api.logText()).includes('src/environments/environment.local-remapped.ts is missing');
        assert.equal(warned, !withEnvironment && 'auth' in ports);
      } finally {
        await ctx.consoleServer.close();
        assert.ok(exited(ctx.children[0]) || (await waitFor(() => exited(ctx.children[0]), 'the app to end with the console')));
      }
    }
  });

  test('preconditions: dependencies, a free port, no full stack, no running job', async () => {
    const bare = await startConsole({ spawnApp: () => assert.fail('must not start') });
    const busy = await appConsole({ openPorts: [4200] });
    const ctx = await appConsole();
    try {
      const noDeps = await bare.api.act({ action: 'app-start' });
      assert.equal(noDeps.status, 409);
      assert.equal(noDeps.json.error, 'The dependencies are not installed yet (node_modules has no Angular CLI). Run Install first.');

      const taken = await busy.api.act({ action: 'app-start' });
      assert.equal(taken.status, 409);
      assert.equal(taken.json.error, 'Port 4200 is already in use, so the app cannot start there. Find out what is using it, or free it.');
      assert.equal(busy.spawned.length, 0);

      assert.equal((await ctx.api.act({ action: 'start', mode: 'full' })).status, 200);
      const full = await ctx.api.act({ action: 'app-start' });
      assert.equal(full.status, 409);
      assert.equal(full.json.error, 'The full stack already runs the app. Stop it, or start only the emulators, then start the app by itself.');
      assert.equal((await ctx.api.act({ action: 'stop' })).status, 200);
      await waitFor(async () => (await ctx.api.state()).stack.state === 'stopped', 'the stack to stop');

      // Next to the emulators it is allowed: that is what it is for.
      assert.equal((await ctx.api.act({ action: 'start', mode: 'emulators' })).status, 200);
      assert.equal((await ctx.api.act({ action: 'app-start' })).status, 200);
      const both = await ctx.api.state();
      assert.deepEqual([both.stack.mode, both.app.state], ['emulators', 'starting']);
      assert.equal(ctx.spawned.length, 1);
    } finally {
      await Promise.all([bare, busy, ctx].map((c) => c.consoleServer.close()));
      assert.ok(exited(ctx.children[0]), 'closing the console ends the app');
    }
  });

  test('an app that ends by itself is reported, with its exit code', async () => {
    const ctx = await startConsole({
      spawnApp: () => spawn(process.execPath, ['-e', "console.error('Error: Port 4200 is already in use.');process.exit(3)"], { stdio: ['ignore', 'pipe', 'pipe'] }),
    });
    try {
      write(ctx.root, 'node_modules/@angular/cli/bin/ng.js', '');
      assert.equal((await ctx.api.act({ action: 'app-start' })).status, 200);
      const state = await waitFor(async () => {
        const s = await ctx.api.state();
        return s.app.state === 'stopped' ? s : null;
      }, 'the app to end');
      assert.equal(state.app.lastExit.code, 3);
      const log = await ctx.api.logText();
      assert.ok(log.includes('app|Error: Port 4200 is already in use.'), log);
      assert.ok(log.includes('console|The app dev server exited (code 3) before it finished starting. Scroll up to the first error above.'), log);
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('for real: node runs ng.js from the repository, without a shell', async () => {
    const root = makeRoot();
    // A folder name with a space and shell characters: nothing may split or interpret it.
    const odd = path.join(root, 'odd & dir (x)');
    fs.mkdirSync(odd);
    write(odd, 'package.json', JSON.stringify({ name: 'omni-task', version: '1.0.0' }));
    write(odd, 'scripts/console/console.html', '<title>x</title>');
    write(odd, 'node_modules/@angular/cli/bin/ng.js', "console.log('ng argv: ' + process.argv.slice(2).join(' ') + ' cwd: ' + process.cwd() + ' FORCE_COLOR=' + process.env.FORCE_COLOR);setInterval(()=>{},1000);");
    const ctx = await startConsole({ root: odd });
    try {
      assert.equal((await ctx.api.act({ action: 'app-start' })).status, 200);
      const pid = (await ctx.api.state()).app.pid;
      await waitFor(async () => (await ctx.api.logText()).includes(`app|ng argv: serve --configuration local cwd: ${odd} FORCE_COLOR=0`), 'the output of ng');
      const res = await ctx.api.act({ action: 'quit' });
      assert.equal(res.status, 200);
      await waitFor(() => {
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          return true;
        }
      }, 'ng to be gone after quit');
    } finally {
      await ctx.consoleServer.close();
    }
  });

  test('the console does not idle-exit while the app is running', async () => {
    const exits = [];
    const ctx = await appConsole({ idleExitMs: 200, onExit: (reason) => exits.push(reason) });
    try {
      assert.equal((await ctx.api.act({ action: 'app-start' })).status, 200);
      await sleep(700);
      assert.deepEqual(exits, []);
      assert.equal(exited(ctx.children[0]), false);
    } finally {
      await ctx.consoleServer.close();
    }
  });
});

describe('nothing a request says reaches a command line', () => {
  const MARK = 'FUZZMARK';
  const NASTY = [
    `${MARK}" & calc.exe & "`,
    `${MARK}'; Start-Process calc; '`,
    `$(${MARK})`,
    `\`${MARK}\``,
    `${MARK} | rm -rf / ; echo`,
    `%COMSPEC% /c ${MARK}`,
    `${MARK}\r\nnet user x y /add`,
    `..\\..\\${MARK}`,
    `-EncodedCommand ${MARK}`,
  ];
  const FIELDS = ['name', 'fn', 'mode', 'model', 'confirm', 'realmail', 'pid', 'pids', 'port', 'ports', 'command', 'args', 'cwd', 'file', 'script', 'configuration', 'startport', 'store', 'env'];
  const ACTIONS = [
    'tools', 'app-start', 'app-stop', 'port-find', 'port-free', 'ports-reserve', 'ports-unreserve', 'shortcut', 'shortcut-remove',
    'terminal', 'firebase-login', 'secret-set', 'deploy-functions', 'prod-logs', 'start', 'stop', 'pull', 'install', 'smoke', 'checks', 'open-key', 'open-env', 'open-folder',
  ];
  /** Everything a string could hide in: itself, and what it decodes to when it is base64 of a script. */
  const seen = (value) => {
    const text = String(value);
    const out = [text];
    if (/^[A-Za-z0-9+/=]{16,}$/.test(text)) {
      const decoded = Buffer.from(text, 'base64').toString('utf16le');
      out.push(decoded);
      for (const match of decoded.matchAll(/(?:'|-EncodedCommand )([A-Za-z0-9+/=]{16,})'/g)) out.push(Buffer.from(match[1], 'base64').toString('utf16le'));
    }
    return out;
  };

  for (const platform of ['win32', 'linux']) {
    test(`fuzzed bodies on ${platform}`, async () => {
      const argv = [];
      const record = (file, args) => argv.push(file, ...args);
      const harmless = (lists) => {
        const walk = (value) => {
          if (Array.isArray(value)) return value.map((step) => (record(step.file, step.args), { file: process.execPath, args: ['-e', ''], cwd: os.tmpdir(), label: step.label }));
          return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, walk(inner)]));
        };
        return walk(lists);
      };
      const root = makeRoot();
      write(root, 'node_modules/@angular/cli/bin/ng.js', '');
      write(root, 'scripts/console-shortcut.ps1', '# stand-in');
      write(root, 'functions/.secret.local', `ANTHROPIC_API_KEY=${PATTERN_KEY}\n`);
      write(root, 'functions/lib/index.js', '');
      const make = standIn();
      const children = [];
      const ctx = await startConsole({
        root,
        platform,
        portFreeWaitMs: 20,
        jobSteps: (r) => harmless(defaultJobSteps(r)),
        commandSteps: (r) => harmless(defaultCommandSteps(r)),
        launch: async (file, args) => (record(file, args), true),
        runTool: async (file, args) => {
          record(file, args);
          // taskkill says "access denied" (1), which is what leads to the administrator step; that one is declined.
          return { code: /taskkill/.test(file) ? 1 : 1223, stdout: '', stderr: '' };
        },
        findListeners: async () => ({ ok: true, listeners: [{ port: 4000, pid: 4242, name: 'java' }] }),
        kill: (pid, signal) => record('kill', [String(pid), signal]),
        spawnApp: (args) => {
          record('ng', args);
          const child = make(args);
          children.push(child);
          return child;
        },
        spawnStack: (mode) => {
          record('local-dev', [mode]);
          return spawn(process.execPath, [path.join(root, 'scripts', 'local-dev.mjs')], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], detached: !IS_WINDOWS });
        },
      });
      try {
        const settle = async () => {
          await waitFor(async () => (await ctx.api.state()).job?.state !== 'running', 'the job to end');
          const state = await ctx.api.state();
          if (state.app.state !== 'stopped') {
            await ctx.api.act({ action: 'app-stop' });
            await waitFor(async () => (await ctx.api.state()).app.state === 'stopped', 'the app to stop');
          }
          if (state.stack.state !== 'stopped') {
            await ctx.api.act({ action: 'stop' });
            await waitFor(async () => (await ctx.api.state()).stack.state === 'stopped', 'the stack to stop');
          }
        };
        let round = 0;
        for (const action of ACTIONS) {
          for (const valid of [{}, { name: 'ui' }, { fn: 'generateSubtasks' }, { confirm: true }, { mode: 'emulators' }]) {
            const nasty = NASTY[round++ % NASTY.length];
            const body = Object.fromEntries(FIELDS.map((field, i) => [field, i % 3 === 0 ? [nasty] : i % 3 === 1 ? nasty : { [nasty]: nasty }]));
            const res = await ctx.api.act({ ...body, ...valid, action, [nasty]: nasty });
            assert.ok([200, 400, 409].includes(res.status), `${action}: ${res.status}`);
            await settle();
          }
        }
        assert.ok(argv.length > 40, `commands were really built (${argv.length} words)`);
        for (const word of argv) for (const text of seen(word)) assert.ok(!text.includes(MARK), `request text reached a command: ${text.slice(0, 200)}`);
        const said = argv.flatMap(seen).join('\n');
        // The run did reach the interesting commands, so the absence above means something.
        for (const expected of platform === 'win32'
          ? ["$psi.Verb = 'runas'", 'excludedportrange', '/PID', 'firebase-tools@15 deploy --only functions', 'console-shortcut.ps1', 'functions:log']
          : ['x-terminal-emulator', 'firebase-tools@15 deploy --only functions', 'functions:log', 'SIGTERM', 'serve']) {
          assert.ok(said.includes(expected), `${expected} was exercised`);
        }
      } finally {
        await ctx.consoleServer.close();
        for (const child of children) if (!exited(child)) child.kill('SIGKILL');
      }
    });
  }

  test('an unknown action stays unknown, however it is spelled', async () => {
    const ctx = await startConsole();
    try {
      for (const action of ['Terminal', 'terminal ', 'deploy', 'port-kill', 'elevate', 'run', 'exec', '__proto__', 'constructor', 'toString', ['terminal'], { action: 'terminal' }]) {
        const res = await ctx.api.act({ action });
        assert.equal(res.status, 400, JSON.stringify(action));
        assert.deepEqual(res.json, { ok: false, error: 'Unknown action.' });
      }
      assert.deepEqual(ctx.launched, []);
    } finally {
      await ctx.consoleServer.close();
    }
  });
});
