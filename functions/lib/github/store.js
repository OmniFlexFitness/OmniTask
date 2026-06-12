"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkError = exports.deleteTaskRelationship = exports.upsertTaskRelationship = exports.upsertTaskFieldValue = exports.deleteTaskActors = exports.upsertTaskActor = exports.recordOutboundEvent = exports.finishDelivery = exports.claimDelivery = exports.deleteTaskLink = exports.recordOutboundSync = exports.updateTaskLink = exports.claimIssueGuard = exports.createLinkTransactional = exports.findLinkByIssue = exports.getTaskLink = exports.taskLinkRef = exports.deleteConnection = exports.updateConnectionSettings = exports.getConnection = exports.setConnectionState = exports.updateFieldDefinitionCache = exports.upsertConnection = exports.deleteUserToken = exports.getUserRefreshToken = exports.storeUserToken = exports.COLLECTIONS = void 0;
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
    fieldValues: 'task_github_field_values',
    relationships: 'task_github_relationships',
    actors: 'task_github_actors',
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
exports.storeUserToken = storeUserToken;
async function getUserRefreshToken(uid) {
    const snap = await tokenDocRef(uid).get();
    const token = snap.data()?.refreshToken;
    return typeof token === 'string' && token.length > 0 ? token : null;
}
exports.getUserRefreshToken = getUserRefreshToken;
async function deleteUserToken(uid) {
    await tokenDocRef(uid).delete();
}
exports.deleteUserToken = deleteUserToken;
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
exports.upsertConnection = upsertConnection;
async function updateFieldDefinitionCache(uid, cache) {
    await db()
        .collection(exports.COLLECTIONS.connections)
        .doc(uid)
        .set({ fieldDefinitionCache: cache, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
}
exports.updateFieldDefinitionCache = updateFieldDefinitionCache;
async function setConnectionState(uid, state) {
    await db()
        .collection(exports.COLLECTIONS.connections)
        .doc(uid)
        .set({ state, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
}
exports.setConnectionState = setConnectionState;
async function getConnection(uid) {
    const snap = await db().collection(exports.COLLECTIONS.connections).doc(uid).get();
    return snap.exists ? snap.data() : null;
}
exports.getConnection = getConnection;
async function updateConnectionSettings(uid, settings) {
    await db()
        .collection(exports.COLLECTIONS.connections)
        .doc(uid)
        .set({ ...settings, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
}
exports.updateConnectionSettings = updateConnectionSettings;
async function deleteConnection(uid) {
    await db().collection(exports.COLLECTIONS.connections).doc(uid).delete();
}
exports.deleteConnection = deleteConnection;
// --- Task links ---
function taskLinkRef(taskId) {
    return db().collection(exports.COLLECTIONS.taskLinks).doc(taskId);
}
exports.taskLinkRef = taskLinkRef;
async function getTaskLink(taskId) {
    const snap = await taskLinkRef(taskId).get();
    return snap.exists ? snap.data() : null;
}
exports.getTaskLink = getTaskLink;
async function findLinkByIssue(owner, repo, issueNumber) {
    const guard = await db()
        .collection(exports.COLLECTIONS.issueLinks)
        .doc((0, sync_logic_1.issueLinkKey)(owner, repo, issueNumber))
        .get();
    const taskId = guard.data()?.taskId;
    return typeof taskId === 'string' ? getTaskLink(taskId) : null;
}
exports.findLinkByIssue = findLinkByIssue;
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
exports.createLinkTransactional = createLinkTransactional;
/** Claim the issue-side guard after an issue number is known (create-new path). */
async function claimIssueGuard(taskId, owner, repo, issueNumber) {
    await db()
        .collection(exports.COLLECTIONS.issueLinks)
        .doc((0, sync_logic_1.issueLinkKey)(owner, repo, issueNumber))
        .set({ taskId, repoOwner: owner, repoName: repo, issueNumber, createdAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
}
exports.claimIssueGuard = claimIssueGuard;
async function updateTaskLink(taskId, patch) {
    await taskLinkRef(taskId).set({ ...patch, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
}
exports.updateTaskLink = updateTaskLink;
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
exports.recordOutboundSync = recordOutboundSync;
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
exports.deleteTaskLink = deleteTaskLink;
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
exports.claimDelivery = claimDelivery;
async function finishDelivery(deliveryId, patch) {
    await db().collection(exports.COLLECTIONS.syncEvents).doc(deliveryId).set(patch, { merge: true });
}
exports.finishDelivery = finishDelivery;
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
exports.recordOutboundEvent = recordOutboundEvent;
// --- Phase 2 metadata (field values, relationships, assignees) ---
async function upsertTaskActor(taskId, login, avatarUrl) {
    const docId = `${taskId}__${login.toLowerCase()}`;
    const payload = {
        taskId,
        login,
        avatarUrl,
        role: 'assignee',
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await db().collection(exports.COLLECTIONS.actors).doc(docId).set(payload, { merge: true });
}
exports.upsertTaskActor = upsertTaskActor;
async function deleteTaskActors(taskId, login) {
    await db()
        .collection(exports.COLLECTIONS.actors)
        .doc(`${taskId}__${login.toLowerCase()}`)
        .delete();
}
exports.deleteTaskActors = deleteTaskActors;
async function upsertTaskFieldValue(taskId, field) {
    const docId = `${taskId}__${field.fieldId}`;
    const payload = {
        taskId,
        ...field,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await db().collection(exports.COLLECTIONS.fieldValues).doc(docId).set(payload, { merge: true });
}
exports.upsertTaskFieldValue = upsertTaskFieldValue;
async function upsertTaskRelationship(taskId, kind, related) {
    const docId = `${taskId}__${kind}__${related.relatedRepoOwner}__${related.relatedRepoName}__${related.relatedIssueNumber}`;
    const payload = {
        taskId,
        kind,
        ...related,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    };
    await db().collection(exports.COLLECTIONS.relationships).doc(docId).set(payload, { merge: true });
}
exports.upsertTaskRelationship = upsertTaskRelationship;
async function deleteTaskRelationship(docId) {
    await db().collection(exports.COLLECTIONS.relationships).doc(docId).delete();
}
exports.deleteTaskRelationship = deleteTaskRelationship;
class LinkError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'LinkError';
    }
}
exports.LinkError = LinkError;
//# sourceMappingURL=store.js.map