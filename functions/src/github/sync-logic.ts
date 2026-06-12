/**
 * Pure sync logic — no Firestore, no network. Unit-tested in isolation.
 *
 * Covers the deterministic decisions the spec calls out: status mapping
 * (§13 Phase 1 / §14 Q4), conflict resolution (§9.3), echo-loop suppression,
 * and the deterministic issue-key used for the reverse-uniqueness guard.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { IssueState } from './types';

export type TaskStatus = 'todo' | 'in-progress' | 'done';

/** OmniTask status → GitHub issue state. Only open/closed sync (spec §14 Q4). */
export function taskStatusToIssueState(status: TaskStatus): IssueState {
  return status === 'done' ? 'closed' : 'open';
}

/**
 * GitHub issue state → OmniTask status, given the current local status.
 *
 * - `closed` → `done`.
 * - `open` while local is `done` → `todo` (a genuine reopen).
 * - `open` while local is already open (`todo`/`in-progress`) → unchanged,
 *   so an inbound `open` echo never clobbers an `in-progress` task.
 */
export function issueStateToTaskStatus(state: IssueState, current: TaskStatus): TaskStatus {
  if (state === 'closed') return 'done';
  return current === 'done' ? 'todo' : current;
}

/** Deterministic doc id for the issue-side uniqueness guard. */
export function issueLinkKey(owner: string, repo: string, issueNumber: number): string {
  return `${owner.toLowerCase()}__${repo.toLowerCase()}__${issueNumber}`;
}

export interface ConflictInput {
  /** Remote `updated_at` from the incoming webhook. */
  incomingUpdatedAt: string;
  /** Remote `updated_at` we recorded at our last reconcile (or null if never). */
  storedGithubUpdatedAt: string | null;
  /** The state we last wrote outbound, for echo detection (or null). */
  lastOutboundState: IssueState | null;
  /** The state carried by this webhook. */
  incomingState: IssueState;
  /** Whether the webhook sender is our own bot identity. */
  senderIsBot: boolean;
}

export type ConflictDecision =
  | { kind: 'apply' }
  | { kind: 'ignore'; reason: 'stale' | 'echo' }
  | { kind: 'conflict' };

/**
 * Decide what to do with an inbound webhook (spec §9.3).
 *
 * Order matters:
 * 1. Echo suppression — our own bot write matching our last outbound state is a no-op.
 * 2. Staleness — out-of-order delivery older than what we already have is ignored.
 * 3. Otherwise apply. (Phase 1 syncs only state, so divergent-but-newer is still a safe
 *    last-writer-wins apply; the `conflict` arm is reserved for callers that detect a
 *    concurrent local edit and pass it through — see resolveConflict's local-dirty path.)
 */
export function decideInbound(input: ConflictInput): ConflictDecision {
  if (
    input.senderIsBot &&
    input.lastOutboundState !== null &&
    input.lastOutboundState === input.incomingState
  ) {
    return { kind: 'ignore', reason: 'echo' };
  }

  if (input.storedGithubUpdatedAt !== null) {
    const incoming = Date.parse(input.incomingUpdatedAt);
    const stored = Date.parse(input.storedGithubUpdatedAt);
    if (!Number.isNaN(incoming) && !Number.isNaN(stored) && incoming < stored) {
      return { kind: 'ignore', reason: 'stale' };
    }
  }

  return { kind: 'apply' };
}

/**
 * Resolve a true conflict: both GitHub and OmniTask changed since last sync.
 * Last-writer-wins by timestamp; ties and unparseable timestamps favor the remote
 * (GitHub is the system of record for issue state) but flag for review.
 */
export function resolveConflict(
  incomingUpdatedAt: string,
  localUpdatedAtMs: number,
): { winner: 'github' | 'omnitask'; flagConflict: true } {
  const incoming = Date.parse(incomingUpdatedAt);
  if (Number.isNaN(incoming)) return { winner: 'github', flagConflict: true };
  return { winner: incoming >= localUpdatedAtMs ? 'github' : 'omnitask', flagConflict: true };
}

/**
 * Verify a GitHub webhook signature (spec §9.1 / §12).
 * Constant-time compare of HMAC-SHA256(rawBody, secret) against `X-Hub-Signature-256`.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard first to keep it constant-time-ish.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Hidden body marker so inbound webhooks and humans can trace origin (spec §8.1). */
export function omnitaskMarker(taskId: string): string {
  return `<!-- omnitask:task:${taskId} -->`;
}

/** Extract a task id from an issue body marker, if present. */
export function parseOmnitaskMarker(body: string | null): string | null {
  if (!body) return null;
  const match = body.match(/<!-- omnitask:task:([A-Za-z0-9_-]+) -->/);
  return match ? match[1] : null;
}

/** Normalize Firestore Timestamp / Date / ISO string to epoch ms for conflict checks. */
export function taskUpdatedAtToMs(updatedAt: unknown): number {
  if (!updatedAt) return 0;
  if (updatedAt instanceof Date) return updatedAt.getTime();
  if (typeof updatedAt === 'object' && updatedAt !== null && 'toMillis' in updatedAt) {
    const ms = (updatedAt as { toMillis: () => number }).toMillis();
    return typeof ms === 'number' ? ms : 0;
  }
  if (typeof updatedAt === 'object' && updatedAt !== null && 'toDate' in updatedAt) {
    const d = (updatedAt as { toDate: () => Date }).toDate();
    return d instanceof Date ? d.getTime() : 0;
  }
  if (typeof updatedAt === 'string') {
    const ms = Date.parse(updatedAt);
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}
