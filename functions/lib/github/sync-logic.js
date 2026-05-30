"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskStatusToIssueState = taskStatusToIssueState;
exports.issueStateToTaskStatus = issueStateToTaskStatus;
exports.issueLinkKey = issueLinkKey;
exports.decideInbound = decideInbound;
exports.resolveConflict = resolveConflict;
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.omnitaskMarker = omnitaskMarker;
exports.parseOmnitaskMarker = parseOmnitaskMarker;
/**
 * Pure sync logic — no Firestore, no network. Unit-tested in isolation.
 *
 * Covers the deterministic decisions the spec calls out: status mapping
 * (§13 Phase 1 / §14 Q4), conflict resolution (§9.3), echo-loop suppression,
 * and the deterministic issue-key used for the reverse-uniqueness guard.
 */
const crypto_1 = require("crypto");
/** OmniTask status → GitHub issue state. Only open/closed sync (spec §14 Q4). */
function taskStatusToIssueState(status) {
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
function issueStateToTaskStatus(state, current) {
    if (state === 'closed')
        return 'done';
    return current === 'done' ? 'todo' : current;
}
/** Deterministic doc id for the issue-side uniqueness guard. */
function issueLinkKey(owner, repo, issueNumber) {
    return `${owner.toLowerCase()}__${repo.toLowerCase()}__${issueNumber}`;
}
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
function decideInbound(input) {
    if (input.senderIsBot &&
        input.lastOutboundState !== null &&
        input.lastOutboundState === input.incomingState) {
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
function resolveConflict(incomingUpdatedAt, localUpdatedAtMs) {
    const incoming = Date.parse(incomingUpdatedAt);
    if (Number.isNaN(incoming))
        return { winner: 'github', flagConflict: true };
    return { winner: incoming >= localUpdatedAtMs ? 'github' : 'omnitask', flagConflict: true };
}
/**
 * Verify a GitHub webhook signature (spec §9.1 / §12).
 * Constant-time compare of HMAC-SHA256(rawBody, secret) against `X-Hub-Signature-256`.
 */
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
    if (!signatureHeader || !secret)
        return false;
    const expected = 'sha256=' + (0, crypto_1.createHmac)('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    // timingSafeEqual throws on length mismatch — guard first to keep it constant-time-ish.
    if (a.length !== b.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(a, b);
}
/** Hidden body marker so inbound webhooks and humans can trace origin (spec §8.1). */
function omnitaskMarker(taskId) {
    return `<!-- omnitask:task:${taskId} -->`;
}
/** Extract a task id from an issue body marker, if present. */
function parseOmnitaskMarker(body) {
    if (!body)
        return null;
    const match = body.match(/<!-- omnitask:task:([A-Za-z0-9_-]+) -->/);
    return match ? match[1] : null;
}
//# sourceMappingURL=sync-logic.js.map