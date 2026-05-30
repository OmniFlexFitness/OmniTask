/**
 * Unit tests for the pure GitHub sync logic (spec Definition of Done):
 * signature verification, idempotency-relevant keys, conflict resolution,
 * echo suppression, and status mapping.
 *
 * Runs against the compiled output in ../lib (no extra test deps), via the
 * built-in node:test runner. Build first: `npm run build`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  taskStatusToIssueState,
  issueStateToTaskStatus,
  issueLinkKey,
  decideInbound,
  resolveConflict,
  verifyWebhookSignature,
  omnitaskMarker,
  parseOmnitaskMarker,
} from '../lib/github/sync-logic.js';

// --- Status mapping ---

test('taskStatusToIssueState: done closes, others stay open', () => {
  assert.equal(taskStatusToIssueState('done'), 'closed');
  assert.equal(taskStatusToIssueState('todo'), 'open');
  assert.equal(taskStatusToIssueState('in-progress'), 'open');
});

test('issueStateToTaskStatus: closed -> done', () => {
  assert.equal(issueStateToTaskStatus('closed', 'todo'), 'done');
  assert.equal(issueStateToTaskStatus('closed', 'in-progress'), 'done');
});

test('issueStateToTaskStatus: reopen from done -> todo', () => {
  assert.equal(issueStateToTaskStatus('open', 'done'), 'todo');
});

test('issueStateToTaskStatus: open does not clobber in-progress', () => {
  assert.equal(issueStateToTaskStatus('open', 'in-progress'), 'in-progress');
  assert.equal(issueStateToTaskStatus('open', 'todo'), 'todo');
});

// --- Issue-link key (reverse-uniqueness guard / idempotency) ---

test('issueLinkKey is deterministic and case-insensitive', () => {
  assert.equal(issueLinkKey('OmniFlexFitness', 'OmniTask', 42), 'omniflexfitness__omnitask__42');
  assert.equal(
    issueLinkKey('omniflexfitness', 'omnitask', 42),
    issueLinkKey('OmniFlexFitness', 'OmniTask', 42),
  );
});

// --- Signature verification ---

const SECRET = 'shhh-webhook-secret';
function sign(body, secret = SECRET) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

test('verifyWebhookSignature accepts a valid signature', () => {
  const body = JSON.stringify({ action: 'closed' });
  assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
});

test('verifyWebhookSignature rejects a tampered body', () => {
  const body = JSON.stringify({ action: 'closed' });
  const sig = sign(body);
  assert.equal(verifyWebhookSignature(JSON.stringify({ action: 'reopened' }), sig, SECRET), false);
});

test('verifyWebhookSignature rejects a wrong secret', () => {
  const body = JSON.stringify({ action: 'closed' });
  assert.equal(verifyWebhookSignature(body, sign(body, 'other'), SECRET), false);
});

test('verifyWebhookSignature rejects missing header or secret', () => {
  const body = 'x';
  assert.equal(verifyWebhookSignature(body, undefined, SECRET), false);
  assert.equal(verifyWebhookSignature(body, sign(body), ''), false);
});

test('verifyWebhookSignature works on Buffer bodies', () => {
  const body = Buffer.from(JSON.stringify({ a: 1 }));
  assert.equal(verifyWebhookSignature(body, sign(body), SECRET), true);
});

// --- Conflict resolution / inbound decisions ---

test('decideInbound: echo from our own bot write is ignored', () => {
  const d = decideInbound({
    incomingUpdatedAt: '2026-05-30T10:00:00Z',
    storedGithubUpdatedAt: '2026-05-30T09:00:00Z',
    lastOutboundState: 'closed',
    incomingState: 'closed',
    senderIsBot: true,
  });
  assert.deepEqual(d, { kind: 'ignore', reason: 'echo' });
});

test('decideInbound: a bot write to a DIFFERENT state is not an echo', () => {
  const d = decideInbound({
    incomingUpdatedAt: '2026-05-30T10:00:00Z',
    storedGithubUpdatedAt: '2026-05-30T09:00:00Z',
    lastOutboundState: 'closed',
    incomingState: 'open',
    senderIsBot: true,
  });
  assert.equal(d.kind, 'apply');
});

test('decideInbound: out-of-order (older) delivery is ignored as stale', () => {
  const d = decideInbound({
    incomingUpdatedAt: '2026-05-30T08:00:00Z',
    storedGithubUpdatedAt: '2026-05-30T09:00:00Z',
    lastOutboundState: null,
    incomingState: 'closed',
    senderIsBot: false,
  });
  assert.deepEqual(d, { kind: 'ignore', reason: 'stale' });
});

test('decideInbound: newer human change applies', () => {
  const d = decideInbound({
    incomingUpdatedAt: '2026-05-30T10:00:00Z',
    storedGithubUpdatedAt: '2026-05-30T09:00:00Z',
    lastOutboundState: 'open',
    incomingState: 'closed',
    senderIsBot: false,
  });
  assert.equal(d.kind, 'apply');
});

test('decideInbound: first-ever event (no stored timestamp) applies', () => {
  const d = decideInbound({
    incomingUpdatedAt: '2026-05-30T10:00:00Z',
    storedGithubUpdatedAt: null,
    lastOutboundState: null,
    incomingState: 'closed',
    senderIsBot: false,
  });
  assert.equal(d.kind, 'apply');
});

test('resolveConflict: last-writer-wins by timestamp, always flagged', () => {
  const localMs = Date.parse('2026-05-30T09:00:00Z');
  assert.deepEqual(resolveConflict('2026-05-30T10:00:00Z', localMs), {
    winner: 'github',
    flagConflict: true,
  });
  assert.deepEqual(resolveConflict('2026-05-30T08:00:00Z', localMs), {
    winner: 'omnitask',
    flagConflict: true,
  });
});

test('resolveConflict: unparseable remote timestamp favors github', () => {
  assert.deepEqual(resolveConflict('not-a-date', Date.now()), {
    winner: 'github',
    flagConflict: true,
  });
});

// --- Body marker ---

test('omnitaskMarker round-trips through parseOmnitaskMarker', () => {
  const marker = omnitaskMarker('abc123_DEF');
  assert.equal(parseOmnitaskMarker(`Some body\n\n${marker}`), 'abc123_DEF');
  assert.equal(parseOmnitaskMarker('no marker here'), null);
  assert.equal(parseOmnitaskMarker(null), null);
});
