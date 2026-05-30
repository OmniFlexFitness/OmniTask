/**
 * Issue REST operations (spec §8.1, §8.7, §15). Phase 1: create, patch state,
 * patch title/body, and read a single issue.
 */
import { githubRequest } from './app';
import { omnitaskMarker } from './sync-logic';
import type { GithubIssuePayload, IssueState } from './types';

export interface CreateIssueInput {
  owner: string;
  repo: string;
  title: string;
  /** OmniTask task id — appended as a hidden marker for traceability. */
  taskId: string;
  body?: string;
  backlinkUrl?: string;
  milestone?: number | null;
  assignees?: string[];
  /** Issue Type name (org-only); silently ignored by GitHub on personal repos. */
  type?: string | null;
}

function composeBody(input: CreateIssueInput): string {
  const parts = [input.body?.trim() || ''];
  if (input.backlinkUrl) parts.push(`\n\n---\nTracked in OmniTask: ${input.backlinkUrl}`);
  parts.push(`\n\n${omnitaskMarker(input.taskId)}`);
  return parts.join('').trim();
}

export async function createIssue(
  token: string,
  input: CreateIssueInput,
): Promise<GithubIssuePayload> {
  const body: Record<string, unknown> = {
    title: input.title,
    body: composeBody(input),
  };
  if (input.milestone != null) body.milestone = input.milestone;
  if (input.assignees?.length) body.assignees = input.assignees;
  if (input.type) body.type = input.type;

  const res = await githubRequest<GithubIssuePayload>(
    `/repos/${input.owner}/${input.repo}/issues`,
    { method: 'POST', token, body },
  );
  return res.data;
}

export async function getIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GithubIssuePayload> {
  const res = await githubRequest<GithubIssuePayload>(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    { token },
  );
  return res.data;
}

/** PATCH only the issue state (close/reopen) — the Phase 1 outbound diff. */
export async function setIssueState(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  state: IssueState,
): Promise<GithubIssuePayload> {
  const res = await githubRequest<GithubIssuePayload>(
    `/repos/${owner}/${repo}/issues/${issueNumber}`,
    { method: 'PATCH', token, body: { state } },
  );
  return res.data;
}

export interface IssueRef {
  owner: string;
  repo: string;
  number: number;
}

/** Parse an issue reference from a full URL or `owner/repo#number` shorthand. */
export function parseIssueRef(input: string): IssueRef | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(
    /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i,
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2], number: Number(urlMatch[3]) };
  }
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/#\s]+)#(\d+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2], number: Number(shortMatch[3]) };
  }
  return null;
}
