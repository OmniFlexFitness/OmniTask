/**
 * Tests for scripts/local-user.mjs.
 *
 *   node --test scripts/local-user.test.mjs
 *
 * The emulators are replaced by one in-process HTTP server that mimics the
 * two endpoints families the seeding uses (Auth: accounts:lookup,
 * accounts:batchCreate, accounts:update; Firestore: GET and PATCH of a
 * document with an update mask). No emulator is started.
 */
import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildAuthAccount,
  buildDefaultFields,
  buildGoogleProvider,
  buildProfileFields,
  fromFirestoreFields,
  loadLocalUser,
  parseLocalUser,
  planAccountUpdate,
  planProfileWrite,
  seedLocalUser,
  toFirestoreValue,
} from './local-user.mjs';

const FIXTURE_FILE = fileURLToPath(new URL('./local-user.json', import.meta.url));
const fixture = JSON.parse(readFileSync(FIXTURE_FILE, 'utf8'));
const PROJECT = 'demo-omnitask';
const NOW = new Date('2026-01-02T03:04:05.000Z');
const quiet = { log: () => {}, warn: () => {} };

describe('fixture', () => {
  test('is valid and holds only what the profile model names', () => {
    const user = loadLocalUser(FIXTURE_FILE);
    assert.equal(user.email, 'bertin.kenol@omniflexfitness.com');
    assert.equal(user.photoURL, 'assets/images/logo.png');
    assert.equal(user.role, 'admin');
    assert.deepEqual(Object.values(user.permissions), [true, true, true, true, true, true]);
    assert.match(user.google.rawId, /^\d+$/);
    assert.ok(user._comment);
  });

  test('a missing file is null, a broken one is an error', () => {
    assert.equal(loadLocalUser('/nonexistent/local-user.json'), null);
    assert.throws(() => parseLocalUser('{"email":"a@b.c"}'), /uid/);
    assert.throws(() => parseLocalUser('{'), SyntaxError);
  });
});

describe('builders', () => {
  test('auth account', () => {
    assert.deepEqual(buildAuthAccount(fixture), {
      localId: 'local-bertin-kenol',
      email: 'bertin.kenol@omniflexfitness.com',
      emailVerified: true,
      displayName: 'Bertin Kenol',
      photoUrl: 'assets/images/logo.png',
      providerUserInfo: [
        {
          providerId: 'google.com',
          rawId: '108374920561837402915',
          federatedId: '108374920561837402915',
          email: 'bertin.kenol@omniflexfitness.com',
          displayName: 'Bertin Kenol',
          photoUrl: 'assets/images/logo.png',
        },
      ],
    });
  });

  test('provider can keep another raw id', () => {
    assert.equal(buildGoogleProvider(fixture, '42').rawId, '42');
    assert.equal(buildGoogleProvider(fixture, '42').federatedId, '42');
  });

  test('firestore profile fields are typed values', () => {
    assert.deepEqual(buildProfileFields(fixture, 'abc'), {
      uid: { stringValue: 'abc' },
      email: { stringValue: 'bertin.kenol@omniflexfitness.com' },
      displayName: { stringValue: 'Bertin Kenol' },
      photoURL: { stringValue: 'assets/images/logo.png' },
      domain: { stringValue: 'omniflexfitness.com' },
      role: { stringValue: 'admin' },
      permissions: {
        mapValue: {
          fields: {
            canCreateProjects: { booleanValue: true },
            canCreateTasks: { booleanValue: true },
            canDeleteProjects: { booleanValue: true },
            canDeleteTasks: { booleanValue: true },
            canInviteMembers: { booleanValue: true },
            isSuperAdmin: { booleanValue: true },
          },
        },
      },
    });
  });

  test('default-only fields', () => {
    assert.deepEqual(buildDefaultFields(fixture, NOW), {
      createdAt: { timestampValue: '2026-01-02T03:04:05.000Z' },
      dashboardSettings: {
        mapValue: {
          fields: {
            defaultMyTasksView: { stringValue: 'overview' },
            compactMode: { booleanValue: false },
            accentColor: { stringValue: '#00d2ff' },
          },
        },
      },
      jobTitle: { stringValue: 'Founder, OmniFlex Fitness' },
      timezone: { stringValue: 'America/New_York' },
      emailNotificationsEnabled: { booleanValue: true },
    });
  });

  test('value encoding covers arrays, numbers and round-trips', () => {
    assert.deepEqual(toFirestoreValue(['a', 1, 1.5]), {
      arrayValue: { values: [{ stringValue: 'a' }, { integerValue: '1' }, { doubleValue: 1.5 }] },
    });
    const plain = { a: 'x', b: [true, { c: 2 }], d: { e: false } };
    assert.deepEqual(fromFirestoreFields(toFirestoreValue(plain).mapValue.fields), plain);
  });

  test('plans: nothing to do when everything matches', () => {
    const doc = { ...buildProfileFields(fixture, 'u'), ...buildDefaultFields(fixture, NOW) };
    assert.deepEqual(planProfileWrite(fixture, 'u', doc, NOW).mask, []);
    const account = {
      localId: 'u',
      displayName: fixture.displayName,
      photoUrl: fixture.photoURL,
      emailVerified: true,
      providerUserInfo: [buildGoogleProvider(fixture)],
    };
    assert.equal(planAccountUpdate(fixture, account), null);
  });
});

// ---------------------------------------------------------------------------
// Fake emulators
// ---------------------------------------------------------------------------

/** One server that answers the Auth and the Firestore calls from in-memory state. */
function createFakeEmulators() {
  const state = {
    accounts: new Map(), // localId -> account
    docs: new Map(), // doc path -> { fields }
    calls: [],
    failFirestore: false,
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      const url = new URL(req.url, 'http://x');
      state.calls.push({ method: req.method, path: url.pathname, query: url.search, body, auth: req.headers.authorization });
      const send = (status, json) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.headers.authorization !== 'Bearer owner') return send(403, { error: { message: 'forbidden' } });
      const route = url.pathname.replace(`/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`, '');
      if (route === '/accounts:lookup') {
        const users = [...state.accounts.values()].filter((a) => body.email?.includes(a.email));
        return send(200, users.length ? { users } : {});
      }
      if (route === '/accounts:batchCreate') {
        for (const u of body.users) state.accounts.set(u.localId, { ...u });
        return send(200, { error: [] }); // the real emulator answers an empty error list
      }
      if (route === '/accounts:update') {
        const account = state.accounts.get(body.localId);
        if (!account) return send(400, { error: { message: 'USER_NOT_FOUND' } });
        const { displayName, photoUrl, emailVerified, linkProviderUserInfo } = body;
        Object.assign(account, { displayName, photoUrl, emailVerified });
        account.providerUserInfo = [
          ...(account.providerUserInfo ?? []).filter((p) => p.providerId !== linkProviderUserInfo.providerId),
          linkProviderUserInfo,
        ];
        return send(200, { localId: account.localId });
      }
      if (url.pathname.startsWith(`/v1/projects/${PROJECT}/databases/(default)/documents/`)) {
        if (state.failFirestore) return send(500, { error: { message: 'boom' } });
        const key = decodeURIComponent(url.pathname);
        if (req.method === 'GET') {
          const doc = state.docs.get(key);
          return doc ? send(200, { name: key, fields: doc.fields }) : send(404, { error: { message: 'NOT_FOUND' } });
        }
        if (req.method === 'PATCH') {
          const mask = url.searchParams.getAll('updateMask.fieldPaths');
          const doc = state.docs.get(key) ?? { fields: {} };
          for (const name of mask) {
            if (name in body.fields) doc.fields[name] = body.fields[name];
            else delete doc.fields[name];
          }
          state.docs.set(key, doc);
          return send(200, { name: key, fields: doc.fields });
        }
      }
      return send(404, { error: { message: `no route ${req.method} ${url.pathname}` } });
    });
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      done({ state, port: server.address().port, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

const docKey = (uid) => `/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`;

describe('seedLocalUser against fake emulators', () => {
  let fake;
  beforeEach(async () => {
    fake = await createFakeEmulators();
  });
  afterEach(async () => {
    await fake.close();
  });

  const seed = (extra = {}) =>
    seedLocalUser({
      authPort: fake.port,
      firestorePort: fake.port,
      projectId: PROJECT,
      user: fixture,
      now: NOW,
      ...quiet,
      ...extra,
    });

  test('missing account is created with the fixed uid, and its profile is written', async () => {
    const result = await seed();
    assert.equal(result.ok, true);
    assert.equal(result.uid, 'local-bertin-kenol');
    assert.equal(result.accountCreated, true);
    assert.equal(result.profileWritten, true);
    assert.deepEqual(fake.state.accounts.get('local-bertin-kenol'), buildAuthAccount(fixture));
    const doc = fromFirestoreFields(fake.state.docs.get(docKey('local-bertin-kenol')).fields);
    assert.equal(doc.uid, 'local-bertin-kenol');
    assert.equal(doc.photoURL, 'assets/images/logo.png');
    assert.equal(doc.createdAt, NOW.toISOString());
    assert.equal(doc.lastLoginAt, undefined);
    assert.ok(fake.state.calls.every((c) => c.auth === 'Bearer owner'));
  });

  test('existing account with a random uid keeps its uid and identity; fields are updated', async () => {
    fake.state.accounts.set('nzmqRandomUid', {
      localId: 'nzmqRandomUid',
      email: 'bertin.kenol@omniflexfitness.com',
      emailVerified: true,
      displayName: 'OmniFlexFitness',
      providerUserInfo: [
        {
          providerId: 'google.com',
          rawId: '555000111222',
          federatedId: '555000111222',
          email: 'bertin.kenol@omniflexfitness.com',
          displayName: 'OmniFlexFitness',
        },
      ],
    });
    const result = await seed();
    assert.equal(result.ok, true);
    assert.equal(result.uid, 'nzmqRandomUid');
    assert.equal(result.accountCreated, false);
    assert.equal(result.accountUpdated, true);
    assert.equal(fake.state.accounts.size, 1);
    const account = fake.state.accounts.get('nzmqRandomUid');
    assert.equal(account.displayName, 'Bertin Kenol');
    assert.equal(account.photoUrl, 'assets/images/logo.png');
    assert.equal(account.providerUserInfo.length, 1);
    assert.equal(account.providerUserInfo[0].rawId, '555000111222');
    assert.equal(account.providerUserInfo[0].displayName, 'Bertin Kenol');
    assert.equal(account.providerUserInfo[0].photoUrl, 'assets/images/logo.png');
    assert.ok(fake.state.docs.has(docKey('nzmqRandomUid')));
  });

  test('document with extra fields: they stay, the mask names only fixture fields', async () => {
    const lastLogin = { timestampValue: '2025-05-05T00:00:00.000Z' };
    const extras = {
      lastLoginAt: lastLogin,
      pinnedProjectIds: { arrayValue: { values: [{ stringValue: 'p1' }] } },
      myTasksSheetId: { stringValue: 'sheet-1' },
      googleTasksRefreshToken: { stringValue: 'secret' },
      createdAt: { timestampValue: '2024-01-01T00:00:00.000Z' },
      displayName: { stringValue: 'OmniFlexFitness' },
      photoURL: { stringValue: '' },
      email: { stringValue: fixture.email },
      uid: { stringValue: 'local-bertin-kenol' },
      domain: { stringValue: 'omniflexfitness.com' },
      role: { stringValue: 'admin' },
    };
    fake.state.docs.set(docKey('local-bertin-kenol'), { fields: { ...extras } });
    const result = await seed();
    assert.equal(result.ok, true);
    const doc = fake.state.docs.get(docKey('local-bertin-kenol')).fields;
    for (const key of ['lastLoginAt', 'pinnedProjectIds', 'myTasksSheetId', 'googleTasksRefreshToken', 'createdAt']) {
      assert.deepEqual(doc[key], extras[key], key);
    }
    assert.equal(doc.displayName.stringValue, 'Bertin Kenol');
    assert.equal(doc.photoURL.stringValue, 'assets/images/logo.png');
    assert.ok(doc.dashboardSettings);
    const patch = fake.state.calls.find((c) => c.method === 'PATCH');
    const mask = new URL(patch.path + patch.query, 'http://x').searchParams.getAll('updateMask.fieldPaths');
    for (const forbidden of ['lastLoginAt', 'pinnedProjectIds', 'myTasksSheetId', 'googleTasksRefreshToken', 'createdAt']) {
      assert.ok(!mask.includes(forbidden), `${forbidden} must not be in the mask`);
    }
    assert.ok(mask.includes('photoURL') && mask.includes('permissions'));
  });

  test('second run changes nothing', async () => {
    await seed();
    const snapshot = JSON.stringify([[...fake.state.accounts], [...fake.state.docs]]);
    fake.state.calls.length = 0;
    const again = await seed({ now: new Date('2027-01-01T00:00:00.000Z') });
    assert.equal(again.ok, true);
    assert.deepEqual(
      [again.accountCreated, again.accountUpdated, again.profileWritten],
      [false, false, false],
    );
    assert.equal(JSON.stringify([[...fake.state.accounts], [...fake.state.docs]]), snapshot);
    assert.ok(fake.state.calls.every((c) => c.method === 'GET' || c.path.endsWith('accounts:lookup')));
  });

  test('a firestore failure is a warning, the account step stays done', async () => {
    fake.state.failFirestore = true;
    const warnings = [];
    const result = await seed({ warn: (m) => warnings.push(m) });
    assert.equal(result.ok, false);
    assert.equal(result.accountCreated, true);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Profile read failed/);
  });
});

describe('seedLocalUser failure paths', () => {
  test('unreachable emulators resolve with a warning and never throw', async () => {
    // A port that was just free and is closed again.
    const probe = http.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const { port } = probe.address();
    await new Promise((r) => probe.close(r));
    const warnings = [];
    const result = await seedLocalUser({
      authPort: port,
      firestorePort: port,
      projectId: PROJECT,
      user: fixture,
      log: () => {},
      warn: (m) => warnings.push(m),
    });
    assert.equal(result.ok, false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /ECONNREFUSED/);
  });

  test('a server that answers errors resolves with a warning', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"nope"}}');
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const warnings = [];
    const result = await seedLocalUser({
      authPort: port,
      firestorePort: port,
      projectId: PROJECT,
      user: fixture,
      log: () => {},
      warn: (m) => warnings.push(m),
    });
    await new Promise((r) => server.close(r));
    assert.equal(result.ok, false);
    assert.match(warnings[0], /lookup failed \(HTTP 500 nope\)/);
  });

  test('a fixture that cannot be loaded resolves with a warning', async () => {
    const warnings = [];
    const result = await seedLocalUser({
      authPort: 1,
      firestorePort: 1,
      projectId: PROJECT,
      user: { email: 'x@y.z' }, // incomplete: no google identity
      log: () => {},
      warn: (m) => warnings.push(m),
    });
    assert.equal(result.ok, false);
    assert.equal(warnings.length, 1);
  });
});

test('profile fields the owner edits in the app are a starting value only', async () => {
  const { planProfileWrite, buildProfileFields, loadFixture } = await import('./local-user.mjs');
  const fixture = loadFixture ? await loadFixture() : null;
  const user = fixture ?? JSON.parse((await import('node:fs')).readFileSync(new URL('./local-user.json', import.meta.url), 'utf8'));
  const uid = 'u1';
  const existing = { ...buildProfileFields(user, uid), jobTitle: { stringValue: 'Chief Lifter' }, timezone: { stringValue: 'Europe/Paris' }, emailNotificationsEnabled: { booleanValue: false } };
  const plan = planProfileWrite(user, uid, existing);
  for (const key of ['jobTitle', 'timezone', 'emailNotificationsEnabled']) {
    assert.ok(!plan.mask.includes(key), key + ' must not be overwritten');
  }
  const fresh = planProfileWrite(user, uid, null);
  for (const key of ['jobTitle', 'timezone', 'emailNotificationsEnabled']) {
    assert.ok(fresh.mask.includes(key), key + ' must be seeded on a new profile');
  }
});
