/**
 * Inbound webhook routing helpers (Phase 2, spec §9.2).
 * Handlers stay thin; this module decides what to process vs refresh-only.
 */
import type { GithubIssuesWebhook } from './types';

/** Webhook events that should trigger a field-definition cache refresh. */
const CACHE_REFRESH_EVENTS = new Set([
  'issue_field',
  'issue_field_option',
  'issue_type',
  'organization',
]);

/** Issue actions handled beyond Phase 1 open/closed sync. */
const EXTENDED_ISSUE_ACTIONS = new Set([
  'typed',
  'untyped',
  'assigned',
  'unassigned',
  'milestoned',
  'demilestoned',
  'edited',
]);

export function shouldRefreshFieldCache(eventType: string): boolean {
  return CACHE_REFRESH_EVENTS.has(eventType);
}

export function isExtendedIssuesAction(action: string): boolean {
  return EXTENDED_ISSUE_ACTIONS.has(action);
}

export function extractAssigneeLogin(payload: GithubIssuesWebhook): string | null {
  if (payload.action === 'unassigned') return null;
  return payload.assignee?.login ?? null;
}

export function extractMilestoneTitle(payload: GithubIssuesWebhook): string | null {
  if (payload.action === 'demilestoned') return null;
  return payload.milestone?.title ?? null;
}

/** Sub-issue and dependency events share the issues envelope in many cases. */
export function isRelationshipWebhook(eventType: string, action: string): boolean {
  if (eventType === 'sub_issues') return true;
  if (eventType === 'issue_dependencies') return true;
  return eventType === 'issues' && (action === 'parent_issue_added' || action === 'parent_issue_removed');
}

export interface RelationshipWebhookPayload {
  action: string;
  issue?: { number: number; node_id?: string; repository?: { owner?: { login: string }; name: string } };
  sub_issue?: { number: number; node_id?: string };
  dependency?: { number: number; node_id?: string };
  repository?: { name: string; owner: { login: string } };
}

/** Whether this relationship event adds (vs removes) a link. */
export function isRelationshipAddAction(eventType: string, action: string): boolean {
  if (eventType === 'sub_issues') return action === 'added';
  if (eventType === 'issue_dependencies') return action === 'added' || action === 'blocked_by_added';
  return action === 'parent_issue_added';
}

export function extractRelationshipFromPayload(
  eventType: string,
  payload: RelationshipWebhookPayload,
): {
  kind: 'sub_issue' | 'blocked_by' | 'blocking';
  relatedIssueNumber: number;
  relatedIssueNodeId: string | null;
  relatedRepoOwner: string;
  relatedRepoName: string;
} | null {
  const owner = payload.repository?.owner.login ?? payload.issue?.repository?.owner?.login;
  const repo = payload.repository?.name ?? payload.issue?.repository?.name;
  if (!owner || !repo) return null;

  if (eventType === 'sub_issues' && payload.sub_issue) {
    return {
      kind: 'sub_issue',
      relatedIssueNumber: payload.sub_issue.number,
      relatedIssueNodeId: payload.sub_issue.node_id ?? null,
      relatedRepoOwner: owner,
      relatedRepoName: repo,
    };
  }

  if (eventType === 'issue_dependencies' && payload.dependency) {
    return {
      kind: 'blocked_by',
      relatedIssueNumber: payload.dependency.number,
      relatedIssueNodeId: payload.dependency.node_id ?? null,
      relatedRepoOwner: owner,
      relatedRepoName: repo,
    };
  }

  if (payload.action === 'parent_issue_added' && payload.issue) {
    return {
      kind: 'sub_issue',
      relatedIssueNumber: payload.issue.number,
      relatedIssueNodeId: payload.issue.node_id ?? null,
      relatedRepoOwner: owner,
      relatedRepoName: repo,
    };
  }

  return null;
}

export function relationshipDocId(
  taskId: string,
  kind: string,
  owner: string,
  repo: string,
  issueNumber: number,
): string {
  return `${taskId}__${kind}__${owner}__${repo}__${issueNumber}`;
}
