/**
 * Unit tests for GitHub Phase 2 inbound webhook routing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAssigneeLogin,
  extractMilestoneTitle,
  isExtendedIssuesAction,
  shouldRefreshFieldCache,
} from '../lib/github/inbound-webhooks.js';

test('shouldRefreshFieldCache recognizes org config events', () => {
  assert.equal(shouldRefreshFieldCache('issue_type'), true);
  assert.equal(shouldRefreshFieldCache('issue_field_option'), true);
  assert.equal(shouldRefreshFieldCache('issues'), false);
});

test('isExtendedIssuesAction includes typed and assignee actions', () => {
  assert.equal(isExtendedIssuesAction('typed'), true);
  assert.equal(isExtendedIssuesAction('assigned'), true);
  assert.equal(isExtendedIssuesAction('closed'), false);
});

test('extractAssigneeLogin respects unassigned', () => {
  assert.equal(
    extractAssigneeLogin({ action: 'unassigned', assignee: { login: 'alice' } }),
    null,
  );
  assert.equal(
    extractAssigneeLogin({ action: 'assigned', assignee: { login: 'bob' } }),
    'bob',
  );
});

test('extractMilestoneTitle respects demilestoned', () => {
  assert.equal(
    extractMilestoneTitle({ action: 'demilestoned', milestone: { title: 'v1', number: 1 } }),
    null,
  );
  assert.equal(
    extractMilestoneTitle({ action: 'milestoned', milestone: { title: 'v2', number: 2 } }),
    'v2',
  );
});
