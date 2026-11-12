/**
 * The built-in local profile of the OmniTask local stack.
 *
 * scripts/local-user.json describes one account (the owner of this checkout).
 * seedLocalUser() makes sure that account exists in the Auth emulator and that
 * its profile exists in the Firestore emulator, so that choosing it in the fake
 * Google popup lands in a fully populated profile.
 *
 * Plain ESM, no dependencies, no side effects on import. Everything here talks
 * to the emulators over loopback HTTP only, with the emulators' own
 * "Authorization: Bearer owner" admin credential, which bypasses security
 * rules. It never touches a real Firebase project.
 *
 * Rules the seeding follows:
 *   - an account that already exists keeps its uid (an imported .emulator-data
 *     holds accounts with random uids) and its Google identity; only the name,
 *     the photo and the verified flag are brought in line
 *   - the profile document is written with an update mask that names only the
 *     fields of the fixture, so every other field survives (lastLoginAt, pinned
 *     projects, sheet ids, tokens, ...)
 *   - createdAt and dashboardSettings are only written when the document has none
 *   - nothing is written when everything is already in place
 *   - any failure is reported as a warning and never thrown
 *
 * Tests: scripts/local-user.test.mjs. Guide: docs/local-development.md.
 */
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_USER_FILE = join(dirname(fileURLToPath(import.meta.url)), 'local-user.json');

/** Provider id the app signs in with ("Continue with Google"). */
export const GOOGLE_PROVIDER_ID = 'google.com';

/** Credential the emulators accept as project owner; it bypasses security rules. */
const OWNER_HEADERS = { Authorization: 'Bearer owner' };
const LOOPBACK = '127.0.0.1';
const REQUEST_TIMEOUT_MS = 8000;

/** Fields of the profile document that are always brought in line with the fixture. */
export const PROFILE_FIELDS = [
  'uid',
  'email',
  'displayName',
  'photoURL',
  'domain',
  'role',
  'permissions',
];

/** Fields that are only written when the document does not have them yet. */
export const DEFAULT_ONLY_FIELDS = [
  'createdAt',
  'dashboardSettings',
  // Editable in the app's profile settings, so only a starting value: the owner's own
  // changes must survive a restart.
  'jobTitle',
  'timezone',
  'emailNotificationsEnabled',
];

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** Parse and check the fixture text; throws an Error that names what is wrong. */
export function parseLocalUser(text) {
  const data = JSON.parse(text);
  const need = (key, ok) => {
    if (!ok(data?.[key])) throw new Error(`local-user.json: "${key}" is missing or invalid`);
  };
  const isText = (v) => typeof v === 'string' && v.trim() !== '';
  need('uid', isText);
  need('email', isText);
  need('displayName', isText);
  need('google', (v) => v && isText(v.rawId));
  return data;
}

/** The fixture at `file`, or null when there is no such file (seeding is then skipped). */
export function loadLocalUser(file = LOCAL_USER_FILE) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
  return parseLocalUser(text);
}

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------

/** The google.com entry of the Auth account; rawId is what the fake popup signs in with. */
export function buildGoogleProvider(user, rawId = user.google.rawId) {
  return {
    providerId: GOOGLE_PROVIDER_ID,
    rawId,
    // The emulator itself stores the raw id as the federated id after a sign-in.
    federatedId: rawId,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoURL ?? '',
  };
}

/** The account record for accounts:batchCreate (an account that does not exist yet). */
export function buildAuthAccount(user) {
  return {
    localId: user.uid,
    email: user.email,
    emailVerified: true,
    displayName: user.displayName,
    photoUrl: user.photoURL ?? '',
    providerUserInfo: [buildGoogleProvider(user)],
  };
}

/** A JS value as a Firestore REST typed value. */
export function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  throw new TypeError(`Cannot store a ${typeof value} in Firestore`);
}

/** A plain object as the `fields` of a Firestore REST document. */
export function toFirestoreFields(object) {
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, toFirestoreValue(v)]));
}

/** A Firestore REST typed value as a JS value (timestamps stay strings). */
export function fromFirestoreValue(typed) {
  if (!typed || typeof typed !== 'object') return undefined;
  if ('stringValue' in typed) return typed.stringValue;
  if ('booleanValue' in typed) return typed.booleanValue;
  if ('integerValue' in typed) return Number(typed.integerValue);
  if ('doubleValue' in typed) return typed.doubleValue;
  if ('timestampValue' in typed) return typed.timestampValue;
  if ('nullValue' in typed) return null;
  if ('arrayValue' in typed) return (typed.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in typed) return fromFirestoreFields(typed.mapValue.fields ?? {});
  return undefined;
}

export function fromFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromFirestoreValue(v)]));
}

/** The fields that always follow the fixture, as Firestore typed values, for user `uid`. */
export function buildProfileFields(user, uid = user.uid) {
  const plain = { ...user, uid };
  const out = {};
  for (const key of PROFILE_FIELDS) {
    if (plain[key] !== undefined) out[key] = plain[key];
  }
  return toFirestoreFields(out);
}

/** The fields written only to a document that lacks them, as Firestore typed values. */
export function buildDefaultFields(user, now = new Date()) {
  const out = { createdAt: now };
  for (const key of DEFAULT_ONLY_FIELDS) {
    if (key !== 'createdAt' && user[key] !== undefined) out[key] = user[key];
  }
  return toFirestoreFields(out);
}

/** Deep equality of two plain JSON-like values. */
export function sameValue(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => sameValue(a[k], b[k]));
}

/**
 * What to write to the profile document: `fields` (typed values) and the
 * `mask` (field names) of the ones that differ from `existing` (the document's
 * typed `fields`, or null when the document does not exist). An empty mask
 * means there is nothing to do.
 */
export function planProfileWrite(user, uid, existing, now = new Date()) {
  const current = existing ?? {};
  const fields = {};
  for (const [key, typed] of Object.entries(buildProfileFields(user, uid))) {
    if (!sameValue(fromFirestoreValue(current[key]), fromFirestoreValue(typed))) fields[key] = typed;
  }
  for (const [key, typed] of Object.entries(buildDefaultFields(user, now))) {
    if (current[key] === undefined) fields[key] = typed;
  }
  return { fields, mask: Object.keys(fields) };
}

/**
 * What to change on an existing Auth account `account` (as accounts:lookup
 * returns it), or null when it already matches. The Google identity the
 * account has is kept; one without it gets the fixture's.
 */
export function planAccountUpdate(user, account) {
  const existing = (account.providerUserInfo ?? []).find((p) => p.providerId === GOOGLE_PROVIDER_ID);
  const provider = buildGoogleProvider(user, existing?.rawId ?? user.google.rawId);
  const providerOk =
    existing &&
    ['rawId', 'federatedId', 'email', 'displayName', 'photoUrl'].every(
      (k) => (existing[k] ?? '') === provider[k],
    );
  const photoUrl = user.photoURL ?? '';
  if (
    providerOk &&
    account.displayName === user.displayName &&
    (account.photoUrl ?? '') === photoUrl &&
    account.emailVerified === true
  ) {
    return null;
  }
  return {
    localId: account.localId,
    displayName: user.displayName,
    photoUrl,
    emailVerified: true,
    linkProviderUserInfo: provider,
  };
}

// ---------------------------------------------------------------------------
// Emulator HTTP
// ---------------------------------------------------------------------------

/** One JSON request over loopback HTTP. Resolves { status, json }; rejects on a network error. */
function requestJson({ host, port, method, path, body }) {
  return new Promise((done, failed) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = httpRequest(
      {
        host,
        port,
        path,
        method,
        headers: {
          ...OWNER_HEADERS,
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            // not JSON: the status still tells
          }
          done({ status: res.statusCode ?? 0, json, text });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`no answer within ${REQUEST_TIMEOUT_MS / 1000} s`)));
    req.on('error', failed);
    if (payload) req.write(payload);
    req.end();
  });
}

const describeFailure = (what, res) =>
  `${what} failed (HTTP ${res.status} ${(res.json?.error?.message ?? res.text ?? '').toString().slice(0, 200)})`.trim();

/**
 * Make sure the fixture's account and profile exist in the running emulators.
 *
 * Never throws: resolves to { ok, uid, accountCreated, accountUpdated,
 * profileWritten, warnings }. `ok` is false when a step failed (the warnings
 * say which); what was done before the failure stays done.
 *
 * `user` is the parsed fixture (default: scripts/local-user.json, which resolves
 * to ok: false with no warning when the file is missing). `host` is for tests.
 */
export async function seedLocalUser({
  authPort,
  firestorePort,
  projectId,
  log = () => {},
  warn = (message) => console.warn(message),
  user,
  host = LOOPBACK,
  now = new Date(),
} = {}) {
  const result = {
    ok: false,
    uid: null,
    accountCreated: false,
    accountUpdated: false,
    profileWritten: false,
    warnings: [],
  };
  const warning = (message) => {
    result.warnings.push(message);
    warn(`Local profile was not fully set up: ${message}`);
  };
  try {
    const fixture = user ?? loadLocalUser();
    if (!fixture) return result;

    const auth = `/identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`;
    const authCall = (method, path, body) =>
      requestJson({ host, port: authPort, method, path: `${auth}${path}`, body });

    // 1. The Auth account.
    const lookup = await authCall('POST', '/accounts:lookup', { email: [fixture.email] });
    if (lookup.status !== 200) throw new Error(describeFailure('Auth account lookup', lookup));
    const account = lookup.json?.users?.[0] ?? null;
    if (!account) {
      const created = await authCall('POST', '/accounts:batchCreate', { users: [buildAuthAccount(fixture)] });
      const rejected = Array.isArray(created.json?.error) ? created.json.error.length > 0 : !!created.json?.error;
      if (created.status !== 200 || rejected) {
        const detail = JSON.stringify(created.json?.error ?? created.json ?? created.text).slice(0, 200);
        throw new Error(`Auth account creation failed (HTTP ${created.status} ${detail})`);
      }
      result.uid = fixture.uid;
      result.accountCreated = true;
    } else {
      result.uid = account.localId;
      const update = planAccountUpdate(fixture, account);
      if (update) {
        const updated = await authCall('POST', '/accounts:update', update);
        if (updated.status !== 200) throw new Error(describeFailure('Auth account update', updated));
        result.accountUpdated = true;
      }
    }

    // 2. The Firestore profile of that account.
    const docPath = `/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(result.uid)}`;
    const fsCall = (method, path, body) =>
      requestJson({ host, port: firestorePort, method, path, body });
    const current = await fsCall('GET', docPath);
    if (current.status !== 200 && current.status !== 404) {
      throw new Error(describeFailure('Profile read', current));
    }
    const existing = current.status === 200 ? (current.json?.fields ?? {}) : null;
    const plan = planProfileWrite(fixture, result.uid, existing, now);
    if (plan.mask.length > 0) {
      const query = plan.mask.map((name) => `updateMask.fieldPaths=${encodeURIComponent(name)}`).join('&');
      const written = await fsCall('PATCH', `${docPath}?${query}`, { fields: plan.fields });
      if (written.status !== 200) throw new Error(describeFailure('Profile write', written));
      result.profileWritten = true;
    }
    result.ok = true;
  } catch (err) {
    const code = err?.code ? `${err.code}: ` : '';
    warning(`${code}${err instanceof Error ? err.message : String(err)}`);
  }
  const changes = [
    result.accountCreated && 'account created',
    result.accountUpdated && 'account updated',
    result.profileWritten && 'profile written',
  ].filter(Boolean);
  if (result.ok && changes.length > 0) log(`Local profile: ${changes.join(', ')}`);
  return result;
}
