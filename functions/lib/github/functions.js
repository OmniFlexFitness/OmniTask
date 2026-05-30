"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubWebhook = exports.syncTaskStatusToGithub = exports.retryGithubSync = exports.unlinkTaskFromGithub = exports.linkTaskToGithub = exports.disconnectGithub = exports.getGithubConnection = exports.completeGithubAuth = exports.getGithubOAuthConfig = void 0;
/**
 * Cloud Functions entry points for the GitHub integration.
 *
 * Phase 1 surface:
 *  - getGithubOAuthConfig   — hand the client the public client id + state.
 *  - completeGithubAuth     — exchange the OAuth code, detect capabilities, store connection.
 *  - disconnectGithub       — revoke local connection + token.
 *  - getGithubConnection    — connection status for the UI.
 *  - linkTaskToGithub       — create-new or link-existing, with the reverse-uniqueness guard.
 *  - unlinkTaskFromGithub   — drop the link (does not touch the GitHub issue; spec §11 default).
 *  - retryGithubSync        — re-run outbound status sync for a link in error.
 *  - syncTaskStatusToGithub — Firestore trigger: task status change → issue open/closed.
 *  - githubWebhook          — inbound webhook receiver (verify → dedupe → apply).
 */
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const params_1 = require("firebase-functions/params");
const firestore_2 = require("firebase-admin/firestore");
const app_1 = require("./app");
const capabilities_1 = require("./capabilities");
const auth_helper_1 = require("./auth-helper");
const issues_1 = require("./issues");
const sync_logic_1 = require("./sync-logic");
const store_1 = require("./store");
const githubAppId = (0, params_1.defineSecret)('GITHUB_APP_ID');
const githubAppPrivateKey = (0, params_1.defineSecret)('GITHUB_APP_PRIVATE_KEY');
const githubClientId = (0, params_1.defineSecret)('GITHUB_CLIENT_ID');
const githubClientSecret = (0, params_1.defineSecret)('GITHUB_CLIENT_SECRET');
const githubWebhookSecret = (0, params_1.defineSecret)('GITHUB_WEBHOOK_SECRET');
const ALL_SECRETS = [
    githubAppId,
    githubAppPrivateKey,
    githubClientId,
    githubClientSecret,
    githubWebhookSecret,
];
/** Bot identity that authors our own outbound writes — used for echo suppression. */
const BOT_LOGIN = 'omnitask-sync[bot]';
function creds() {
    return {
        appId: githubAppId.value(),
        privateKey: githubAppPrivateKey.value().replace(/\\n/g, '\n'),
        clientId: githubClientId.value(),
        clientSecret: githubClientSecret.value(),
    };
}
function requireAuth(uid) {
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated');
}
function mapConnectionError(err) {
    if (err instanceof auth_helper_1.ConnectionError) {
        throw new https_1.HttpsError('failed-precondition', err.code === 'NEEDS_REAUTH' ? 'GitHub access expired. Reconnect your account' : err.message);
    }
    throw err instanceof Error
        ? new https_1.HttpsError('internal', err.message)
        : new https_1.HttpsError('internal', 'Unexpected error');
}
// --- Connection callables ---
exports.getGithubOAuthConfig = (0, https_1.onCall)({ secrets: [githubClientId], memory: '128MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const clientId = githubClientId.value();
    if (!clientId)
        throw new https_1.HttpsError('failed-precondition', 'GitHub client id not configured');
    return { clientId };
});
exports.completeGithubAuth = (0, https_1.onCall)({ secrets: ALL_SECRETS, memory: '256MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const { code, redirectUri } = request.data ?? {};
    if (!code || !redirectUri) {
        throw new https_1.HttpsError('invalid-argument', 'Missing code or redirectUri');
    }
    const c = creds();
    const tokens = await (0, app_1.exchangeUserCode)(c.clientId, c.clientSecret, code, redirectUri);
    const installation = await (0, app_1.findUserInstallation)(tokens.accessToken);
    if (!installation) {
        throw new https_1.HttpsError('failed-precondition', 'No OmniTask Sync installation found. Install the GitHub App on a repo first');
    }
    if (!tokens.refreshToken) {
        throw new https_1.HttpsError('failed-precondition', 'GitHub did not return a refresh token');
    }
    await (0, store_1.storeUserToken)(uid, tokens.refreshToken, installation.installationId);
    // System-token capability probe.
    const appJwt = (0, app_1.createAppJwt)(c.appId, c.privateKey);
    const installationToken = await (0, app_1.createInstallationToken)(appJwt, installation.installationId);
    const capabilities = await (0, capabilities_1.detectCapabilities)(installationToken, installation.accountLogin, installation.accountType);
    await (0, store_1.upsertConnection)(uid, {
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        installationId: installation.installationId,
        capabilities,
        state: 'connected',
    });
    return { accountLogin: installation.accountLogin, capabilities };
});
exports.getGithubConnection = (0, https_1.onCall)({ memory: '128MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const connection = await (0, store_1.getConnection)(request.auth.uid);
    if (!connection)
        return { connected: false };
    return {
        connected: connection.state === 'connected',
        state: connection.state,
        accountLogin: connection.accountLogin,
        accountType: connection.accountType,
        capabilities: connection.capabilities,
    };
});
exports.disconnectGithub = (0, https_1.onCall)({ memory: '128MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    await (0, store_1.deleteUserToken)(request.auth.uid);
    await (0, store_1.deleteConnection)(request.auth.uid);
    return { success: true };
});
exports.linkTaskToGithub = (0, https_1.onCall)({ secrets: ALL_SECRETS, memory: '256MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const data = request.data;
    if (!data?.taskId)
        throw new https_1.HttpsError('invalid-argument', 'taskId required');
    let token;
    try {
        ({ token } = await (0, auth_helper_1.getInstallationTokenForUser)(uid, creds()));
    }
    catch (err) {
        mapConnectionError(err);
    }
    try {
        if (data.mode === 'existing') {
            return await linkExisting(uid, token, data);
        }
        return await linkCreate(uid, token, data);
    }
    catch (err) {
        if (err instanceof store_1.LinkError) {
            throw new https_1.HttpsError('already-exists', err.code === 'LINK_EXISTS'
                ? 'This task is already linked to a GitHub issue'
                : 'That GitHub issue is already linked to another task');
        }
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', err instanceof Error ? err.message : 'Link failed');
    }
});
async function linkExisting(uid, token, data) {
    const ref = data.issueRef ? (0, issues_1.parseIssueRef)(data.issueRef) : null;
    if (!ref)
        throw new https_1.HttpsError('invalid-argument', 'Could not parse issue URL or number');
    const issue = await (0, issues_1.getIssue)(token, ref.owner, ref.repo, ref.number);
    await (0, store_1.createLinkTransactional)({
        taskId: data.taskId,
        ownerUserId: uid,
        repoOwner: ref.owner,
        repoName: ref.repo,
        issueNumber: issue.number,
        issueNodeId: issue.node_id,
        issueUrl: issue.html_url,
        issueState: issue.state,
        issueType: issue.type?.name ?? null,
        syncState: 'synced',
        lastError: null,
        lastSyncedAt: null,
        githubUpdatedAt: issue.updated_at,
        lastOutboundState: null,
    });
    await (0, store_1.recordOutboundEvent)(data.taskId, 'link_existing', 'processed', null);
    return { issueNumber: issue.number, issueUrl: issue.html_url, issueState: issue.state };
}
async function linkCreate(uid, token, data) {
    if (!data.repoOwner || !data.repoName || !data.title) {
        throw new https_1.HttpsError('invalid-argument', 'repoOwner, repoName, and title required');
    }
    // Reserve the task-side link first (empty issue), so a failed create still leaves a
    // recoverable, retryable record rather than orphaning an issue (spec §11).
    await (0, store_1.createLinkTransactional)({
        taskId: data.taskId,
        ownerUserId: uid,
        repoOwner: data.repoOwner,
        repoName: data.repoName,
        issueNumber: null,
        issueNodeId: null,
        issueUrl: null,
        issueState: null,
        issueType: data.type ?? null,
        syncState: 'pending',
        lastError: null,
        lastSyncedAt: null,
        githubUpdatedAt: null,
        lastOutboundState: null,
    });
    try {
        const issue = await (0, issues_1.createIssue)(token, {
            owner: data.repoOwner,
            repo: data.repoName,
            title: data.title,
            taskId: data.taskId,
            body: data.body,
            backlinkUrl: data.backlinkUrl,
            type: data.type,
        });
        await (0, store_1.claimIssueGuard)(data.taskId, data.repoOwner, data.repoName, issue.number);
        await (0, store_1.updateTaskLink)(data.taskId, {
            issueNumber: issue.number,
            issueNodeId: issue.node_id,
            issueUrl: issue.html_url,
            issueState: issue.state,
            issueType: issue.type?.name ?? data.type ?? null,
            syncState: 'synced',
            githubUpdatedAt: issue.updated_at,
            lastOutboundState: issue.state,
        });
        await (0, store_1.recordOutboundEvent)(data.taskId, 'create_issue', 'processed', null);
        return { issueNumber: issue.number, issueUrl: issue.html_url, issueState: issue.state };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Issue creation failed';
        await (0, store_1.updateTaskLink)(data.taskId, { syncState: 'error', lastError: message });
        await (0, store_1.recordOutboundEvent)(data.taskId, 'create_issue', 'failed', message);
        throw new https_1.HttpsError('internal', message);
    }
}
exports.unlinkTaskFromGithub = (0, https_1.onCall)({ memory: '128MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const taskId = request.data?.taskId;
    if (!taskId)
        throw new https_1.HttpsError('invalid-argument', 'taskId required');
    const link = await (0, store_1.getTaskLink)(taskId);
    if (link && link.ownerUserId !== request.auth.uid) {
        throw new https_1.HttpsError('permission-denied', 'Not your link');
    }
    await (0, store_1.deleteTaskLink)(taskId);
    return { success: true };
});
exports.retryGithubSync = (0, https_1.onCall)({ secrets: ALL_SECRETS, memory: '256MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const taskId = request.data?.taskId;
    if (!taskId)
        throw new https_1.HttpsError('invalid-argument', 'taskId required');
    const link = await (0, store_1.getTaskLink)(taskId);
    if (!link)
        throw new https_1.HttpsError('not-found', 'No link for task');
    if (link.ownerUserId !== uid)
        throw new https_1.HttpsError('permission-denied', 'Not your link');
    const task = await (0, firestore_2.getFirestore)().collection('tasks').doc(taskId).get();
    const status = task.data()?.status ?? 'todo';
    try {
        await pushStatus(uid, link, status);
        return { success: true };
    }
    catch (err) {
        mapConnectionError(err);
    }
});
// --- Outbound trigger: task status → issue state ---
exports.syncTaskStatusToGithub = (0, firestore_1.onDocumentWritten)({ document: 'tasks/{taskId}', secrets: ALL_SECRETS, memory: '256MiB' }, async (event) => {
    const after = event.data?.after;
    if (!after?.exists)
        return; // deletion handled elsewhere (unlink is explicit)
    const taskId = event.params.taskId;
    const link = await (0, store_1.getTaskLink)(taskId);
    if (!link || link.issueNumber == null)
        return; // unlinked tasks are untouched
    const beforeStatus = event.data?.before?.data()?.status;
    const afterStatus = after.data()?.status;
    if (!afterStatus || beforeStatus === afterStatus)
        return;
    const desired = (0, sync_logic_1.taskStatusToIssueState)(afterStatus);
    if (desired === link.issueState)
        return; // already in the right state — no echo write
    try {
        await pushStatus(link.ownerUserId, link, afterStatus);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        await (0, store_1.updateTaskLink)(taskId, { syncState: 'error', lastError: message });
        await (0, store_1.recordOutboundEvent)(taskId, 'status_sync', 'failed', message);
    }
});
async function pushStatus(uid, link, status) {
    if (link.issueNumber == null)
        return;
    const { token } = await (0, auth_helper_1.getInstallationTokenForUser)(uid, creds());
    const desired = (0, sync_logic_1.taskStatusToIssueState)(status);
    const issue = await (0, issues_1.setIssueState)(token, link.repoOwner, link.repoName, link.issueNumber, desired);
    await (0, store_1.recordOutboundSync)(link.taskId, issue.state, issue.updated_at);
    await (0, store_1.recordOutboundEvent)(link.taskId, 'status_sync', 'processed', null);
}
// --- Inbound webhook ---
exports.githubWebhook = (0, https_1.onRequest)({ secrets: [githubWebhookSecret], memory: '256MiB' }, async (req, res) => {
    const signature = req.header('X-Hub-Signature-256') ?? undefined;
    // rawBody is provided by Cloud Functions; fall back to a re-stringify if absent.
    const raw = req.rawBody ?? JSON.stringify(req.body);
    if (!(0, sync_logic_1.verifyWebhookSignature)(raw, signature, githubWebhookSecret.value())) {
        res.status(401).send('invalid signature');
        return;
    }
    const deliveryId = req.header('X-GitHub-Delivery');
    const eventType = req.header('X-GitHub-Event') ?? 'unknown';
    if (!deliveryId) {
        res.status(400).send('missing delivery id');
        return;
    }
    // Dedupe + return 200 fast. Processing is best-effort within the same invocation
    // (Phase 1 has no separate queue); failures are recorded for retry/observability.
    const fresh = await (0, store_1.claimDelivery)(deliveryId, eventType);
    if (!fresh) {
        res.status(200).send('duplicate');
        return;
    }
    res.status(202).send('accepted');
    try {
        if (eventType === 'issues') {
            await handleIssuesEvent(req.body);
        }
        await (0, store_1.finishDelivery)(deliveryId, { status: 'processed' });
    }
    catch (err) {
        await (0, store_1.finishDelivery)(deliveryId, {
            status: 'failed',
            error: err instanceof Error ? err.message : 'handler error',
        });
    }
});
async function handleIssuesEvent(payload) {
    if (!payload?.issue)
        return;
    const { action, issue, repository, sender } = payload;
    if (action !== 'closed' && action !== 'reopened')
        return; // Phase 1: state only
    const owner = repository.owner.login;
    const repo = repository.name;
    // Resolve the link: prefer the issue-keyed guard, fall back to the body marker.
    let link = await (0, store_1.findLinkByIssue)(owner, repo, issue.number);
    if (!link) {
        const taskId = (0, sync_logic_1.parseOmnitaskMarker)(issue.body);
        if (taskId)
            link = await (0, store_1.getTaskLink)(taskId);
    }
    if (!link)
        return;
    const decision = (0, sync_logic_1.decideInbound)({
        incomingUpdatedAt: issue.updated_at,
        storedGithubUpdatedAt: link.githubUpdatedAt,
        lastOutboundState: link.lastOutboundState,
        incomingState: issue.state,
        senderIsBot: sender.type === 'Bot' || sender.login === BOT_LOGIN,
    });
    if (decision.kind === 'ignore')
        return;
    const taskRef = (0, firestore_2.getFirestore)().collection('tasks').doc(link.taskId);
    const snap = await taskRef.get();
    if (!snap.exists)
        return;
    const currentStatus = snap.data()?.status ?? 'todo';
    const nextStatus = (0, sync_logic_1.issueStateToTaskStatus)(issue.state, currentStatus);
    if (nextStatus !== currentStatus) {
        await taskRef.set({ status: nextStatus, ...(nextStatus === 'done' ? { completedAt: new Date() } : {}) }, { merge: true });
    }
    // Record the remote state so the echo of our own resulting write is suppressed.
    await (0, store_1.updateTaskLink)(link.taskId, {
        issueState: issue.state,
        lastOutboundState: issue.state,
        githubUpdatedAt: issue.updated_at,
        syncState: 'synced',
        lastError: null,
    });
}
//# sourceMappingURL=functions.js.map