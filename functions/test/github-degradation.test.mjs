/**
 * Unit tests for GitHub Phase 2 degradation helpers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeLabels,
  planIssueTypeCreate,
  planPriorityCreate,
  priorityLabelFor,
} from '../lib/github/degradation.js';

test('planIssueTypeCreate uses native type on org with issue types', () => {
  const plan = planIssueTypeCreate(
    'Organization',
    { issueTypes: true, issueFields: true, projects: false },
    'Bug',
  );
  assert.deepEqual(plan, { type: 'Bug', labels: [] });
});

test('planIssueTypeCreate falls back to label on personal repo', () => {
  const plan = planIssueTypeCreate(
    'User',
    { issueTypes: false, issueFields: false, projects: false },
    'Feature Request',
  );
  assert.deepEqual(plan, { type: null, labels: ['type: feature-request'] });
});

test('planPriorityCreate uses fields when capability enabled', () => {
  const plan = planPriorityCreate({ issueTypes: true, issueFields: true, projects: false }, 'high');
  assert.deepEqual(plan, { useIssueFields: true, priorityLabel: null });
});

test('planPriorityCreate falls back to priority label', () => {
  const plan = planPriorityCreate({ issueTypes: false, issueFields: false, projects: false }, 'urgent');
  assert.equal(plan.useIssueFields, false);
  assert.equal(plan.priorityLabel, priorityLabelFor('urgent'));
});

test('mergeLabels deduplicates', () => {
  assert.deepEqual(mergeLabels(['a', 'b'], ['b', 'c'], undefined), ['a', 'b', 'c']);
});
