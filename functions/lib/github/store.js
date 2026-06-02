"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkError = exports.COLLECTIONS = void 0;
exports.storeUserToken = storeUserToken;
exports.getUserRefreshToken = getUserRefreshToken;
exports.deleteUserToken = deleteUserToken;
exports.upsertConnection = upsertConnection;
exports.setConnectionState = setConnectionState;
exports.getConnection = getConnection;
exports.deleteConnection = deleteConnection;
exports.taskLinkRef = taskLinkRef;
exports.getTaskLink = getTaskLink;
exports.findLinkByIssue = findLinkByIssue;
exports.createLinkTransactional = createLinkTransactional;
exports.claimIssueGuard = claimIssueGuard;
exports.updateTaskLink = updateTaskLink;
exports.recordOutboundSync = recordOutboundSync;
exports.deleteTaskLink = deleteTaskLink;
exports.claimDelivery = claimDelivery;
exports.finishDelivery = finishDelivery;
exports.recordOutboundEvent = recordOutboundEvent;
/**
 * Firestore access for the GitHub integration. Centralizes collection names and
 * the transactional reverse-uniqueness guard so the rest of the code never
 * touches raw collection strings.
 */
const firestore_1 = require("firebase-admin/firestore");
const sync_logic_1 = require("./sync-logic");
const db = () => (0, firestore_1.getFirestore)();
exports.COLLECTIONS = {
    connections: 'github_connections',
    taskLinks: 'task_github_links',
    issueLinks: 'github_issue_links',
    syncEvents: 'github_sync_events',
};
const tokenDocRef = (uid) => db().collection('users').doc(uid).collection('private').doc('githubOAuth');
// --- Tokens (admin-only; never client-readable) ---
async function storeUserToken(uid, refreshToken, installationId) {
    const payload = {
        refreshToken,
        installationId,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await tokenDocRef(uid).set(payload, { merge: true });
}
async function getUserRefreshToken(uid) {
    const snap = await tokenDocRef(uid).get();
    const token = snap.data()?.refreshToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
}
async function deleteUserToken(uid) {
    await tokenDocRef(uid).delete();
}
// --- Connection ---
async function upsertConnection(uid, data) {
    await db()
        .collection(exports.COLLECTIONS.connections)
        .doc(uid)
        .set({
        omnitaskUserId: uid,
        ...data,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
async function setConnectionState(uid, state) {
    await db()
        .collection(exports.COLLECTIONS.connections)
        .doc(uid)
        .set({ state, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
}
async function getConnection(uid) {
    const snap = await db().collection(exports.COLLECTIONS.connections).doc(uid).get();
    return snap.exists ? snap.data() : null;
}
async function deleteConnection(uid) {
    await db().collection(exports.COLLECTIONS.connections).doc(uid).delete();
}
// --- Task links ---
function taskLinkRef(taskId) {
    return db().collection(exports.COLLECTIONS.taskLinks).doc(taskId);
}
async function getTaskLink(taskId) {
    const snap = await taskLinkRef(taskId).get();
    return snap.exists ? snap.data() : null;
}
async function findLinkByIssue(owner, repo, issueNumber) {
    const guard = await db()
        .collection(exports.COLLECTIONS.issueLinks)
        .doc((0, sync_logic_1.issueLinkKey)(owner, repo, issueNumber))
        .get();
    const taskId = guard.data()?.taskId;
    return typeof taskId === 'string' ? getTaskLink(taskId) : null;
}
/**
 * Create a task↔issue link inside a transaction that also claims the issue-side
 * uniqueness guard (spec data-model §5 + plan). Throws `LINK_EXISTS` if the task is
 * already linked, or `ISSUE_TAKEN` if the issue is bound to a different task.
 */
async function createLinkTransactional(link) {
    const taskRef = taskLinkRef(link.taskId);
    await db().runTransaction(async (tx) => {
        const existing = await tx.get(taskRef);
        if (existing.exists)
            throw new LinkError('LINK_EXISTS');
        let guardRef = null;
        if (link.issueNumber !== null) {
            guardRef = db()
                .collection(exports.COLLECTIONS.issueLinks)
                .doc((0, sync_logic_1.issueLinkKey)(link.repoOwner, link.repoName, link.issueNumber));
            const guard = await tx.get(guardRef);
            if (guard.exists && guard.data()?.taskId !== link.taskId)
                throw new LinkError('ISSUE_TAKEN');
        }
        tx.set(taskRef, {
            ...link,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        if (guardRef && link.issueNumber !== null) {
            tx.set(guardRef, {
                taskId: link.taskId,
                repoOwner: link.repoOwner,
                repoName: link.repoName,
                issueNumber: link.issueNumber,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
    });
}
/** Claim the issue-side guard after an issue number is known (create-new path). */
async function claimIssueGuard(taskId, owner, repo, issueNumber) {
    await db()
        .collection(exports.COLLECTIONS.issueLinks)
        .doc((0, sync_logic_1.issueLinkKey)(owner, repo, issueNumber))
        .set({ taskId, repoOwner: owner, repoName: repo, issueNumber, createdAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
}
async function updateTaskLink(taskId, patch) {
    await taskLinkRef(taskId).set({ ...patch, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
}
async function recordOutboundSync(taskId, issueState, githubUpdatedAt) {
    await updateTaskLink(taskId, {
        issueState,
        lastOutboundState: issueState,
        syncState: 'synced',
        lastError: null,
        lastSyncedAt: firestore_1.Timestamp.now(),
        githubUpdatedAt,
    });
}
async function deleteTaskLink(taskId) {
    const link = await getTaskLink(taskId);
    const batch = db().batch();
    batch.delete(taskLinkRef(taskId));
    if (link?.issueNumber != null) {
        batch.delete(db()
            .collection(exports.COLLECTIONS.issueLinks)
            .doc((0, sync_logic_1.issueLinkKey)(link.repoOwner, link.repoName, link.issueNumber)));
    }
    await batch.commit();
}
// --- Sync events (idempotency + audit) ---
/**
 * Claim an inbound delivery id. Returns false if already seen (dedupe), true if
 * this call is the first to record it. `github_sync_events/{deliveryId}`.
 */
/**
 * Claim an inbound delivery for processing. Returns true if this call should
 * process the event, false if it's a duplicate of an already-handled delivery.
 *
 * Uses a transaction so the claim is atomic. A delivery that previously *failed*
 * is reclaimable: GitHub re-delivers on our non-2xx/timeout, and a prior failed
 * attempt must not permanently suppress the retry (otherwise a transient error
 * during processing loses the event for good). Only `received`/`processed`
 * states block reprocessing.
 */
async function claimDelivery(deliveryId, eventType) {
    const ref = db().collection(exports.COLLECTIONS.syncEvents).doc(deliveryId);
    return db().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.data()?.status !== 'failed') {
            return false; // already received or processed — true duplicate
        }
        tx.set(ref, {
            deliveryId,
            direction: 'inbound',
            taskId: null,
            eventType,
            action: null,
            status: 'received',
            error: null,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        return true;
    });
}
async function finishDelivery(deliveryId, patch) {
    await db().collection(exports.COLLECTIONS.syncEvents).doc(deliveryId).set(patch, { merge: true });
}
async function recordOutboundEvent(taskId, eventType, status, error) {
    await db().collection(exports.COLLECTIONS.syncEvents).add({
        deliveryId: null,
        direction: 'outbound',
        taskId,
        eventType,
        action: null,
        status,
        error,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
class LinkError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'LinkError';
    }
}
exports.LinkError = LinkError;
//# sourceMappingURL=store.js.map