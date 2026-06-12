"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubWebhook = exports.syncTaskStatusToGithub = exports.retryGithubSync = exports.unlinkTaskFromGithub = exports.resolveGithubConflict = exports.linkTaskToGithub = exports.disconnectGithub = exports.refreshGithubFieldConfig = exports.updateGithubConnectionSettings = exports.getGithubConnection = exports.completeGithubAuth = exports.getGithubOAuthConfig = void 0;
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
const field_definitions_1 = require("./field-definitions");
const degradation_1 = require("./degradation");
const inbound_webhooks_1 = require("./inbound-webhooks");
const issue_fields_1 = require("./issue-fields");
const graphql_1 = require("./graphql");
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
/**
 * Value the deploy workflow (.github/workflows/deploy-cloudrun.yml) seeds for
 * any GITHUB_* secret that hasn't been configured yet, so a non-interactive
 * `firebase deploy` doesn't fail on a missing secret. Treat it as "not
 * configured" so the connect flow surfaces a clear error instead of redirecting
 * to GitHub with a bogus client id. Keep in sync with that workflow.
 */
const UNCONFIGURED_SECRET_VALUE = 'placeholder';
/** A secret is usable only when it's set and not the deploy placeholder. */
function isSecretConfigured(value) {
    return !!value && value !== UNCONFIGURED_SECRET_VALUE;
}
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
    if (!isSecretConfigured(clientId)) {
        throw new https_1.HttpsError('failed-precondition', 'GitHub client id not configured');
    }
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
    const fieldDefinitionCache = installation.accountType === 'Organization'
        ? await (0, field_definitions_1.fetchFieldDefinitionCache)(installationToken, installation.accountLogin)
        : null;
    await (0, store_1.upsertConnection)(uid, {
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        installationId: installation.installationId,
        capabilities,
        fieldDefinitionCache,
        state: 'connected',
    });
    return { accountLogin: installation.accountLogin, capabilities, fieldDefinitionCache };
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
        fieldDefinitionCache: connection.fieldDefinitionCache ?? null,
        defaultProjectNodeId: connection.defaultProjectNodeId ?? null,
        createLinkedBranchOnLink: connection.createLinkedBranchOnLink ?? false,
    };
});
exports.updateGithubConnectionSettings = (0, https_1.onCall)({ memory: '128MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const connection = await (0, store_1.getConnection)(uid);
    if (!connection || connection.state !== 'connected') {
        throw new https_1.HttpsError('failed-precondition', 'GitHub not connected');
    }
    const patch = {};
    if (request.data?.defaultProjectNodeId !== undefined) {
        patch.defaultProjectNodeId = request.data.defaultProjectNodeId || null;
    }
    if (request.data?.createLinkedBranchOnLink !== undefined) {
        patch.createLinkedBranchOnLink = Boolean(request.data.createLinkedBranchOnLink);
    }
    if (!Object.keys(patch).length) {
        throw new https_1.HttpsError('invalid-argument', 'No settings to update');
    }
    await (0, store_1.updateConnectionSettings)(uid, patch);
    return { success: true, ...patch };
});
exports.refreshGithubFieldConfig = (0, https_1.onCall)({ secrets: ALL_SECRETS, memory: '256MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const connection = await (0, store_1.getConnection)(uid);
    if (!connection || connection.state !== 'connected') {
        throw new https_1.HttpsError('failed-precondition', 'GitHub not connected');
    }
    if (connection.accountType !== 'Organization') {
        return { refreshed: false, reason: 'personal_account' };
    }
    let token;
    try {
        ({ token } = await (0, auth_helper_1.getInstallationTokenForUser)(uid, creds()));
    }
    catch (err) {
        mapConnectionError(err);
    }
    const cache = await (0, field_definitions_1.fetchFieldDefinitionCache)(token, connection.accountLogin);
    await (0, store_1.updateFieldDefinitionCache)(uid, cache);
    return { refreshed: true, fieldDefinitionCache: cache };
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
    const connection = await (0, store_1.getConnection)(uid);
    const capabilities = connection?.capabilities ?? {
        issueTypes: false,
        issueFields: false,
        projects: false,
    };
    const accountType = connection?.accountType ?? 'User';
    const typePlan = (0, degradation_1.planIssueTypeCreate)(accountType, capabilities, data.type ?? null);
    const priorityPlan = (0, degradation_1.planPriorityCreate)(capabilities, data.priority ?? null);
    const labels = (0, degradation_1.mergeLabels)(typePlan.labels, priorityPlan.priorityLabel ? [priorityPlan.priorityLabel] : []);
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
        issueType: typePlan.type ?? data.type ?? null,
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
            type: typePlan.type,
            labels,
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
        if (priorityPlan.useIssueFields && data.priority && connection?.fieldDefinitionCache) {
            try {
                await (0, issue_fields_1.applyPriorityFieldValue)(token, data.repoOwner, data.repoName, issue.number, connection.fieldDefinitionCache, data.priority);
            }
            catch {
                /* label fallback already applied */
            }
        }
        if (data.priority) {
            await (0, store_1.upsertTaskFieldValue)(data.taskId, {
                fieldId: -2,
                fieldName: 'priority',
                dataType: 'single_select',
                optionId: null,
                textValue: data.priority,
                numberValue: null,
            });
        }
        await applyPhase3Enrichment(token, connection, data, issue);
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
async function applyPhase3Enrichment(token, connection, data, issue) {
    if (!issue.node_id)
        return;
    if (connection?.defaultProjectNodeId && connection.capabilities?.projects) {
        try {
            await (0, graphql_1.addIssueToProjectV2)(token, connection.defaultProjectNodeId, issue.node_id);
        }
        catch {
            /* non-fatal — project board may be misconfigured */
        }
    }
    if (connection?.createLinkedBranchOnLink) {
        try {
            const branchName = (0, graphql_1.suggestLinkedBranchName)(data.taskId, data.title ?? 'task');
            const name = await (0, graphql_1.createLinkedBranch)(token, issue.node_id, branchName);
            if (name) {
                await (0, store_1.updateTaskLink)(data.taskId, { linkedBranchName: name });
            }
        }
        catch {
            /* requires Contents write permission on the repo */
        }
    }
}
exports.resolveGithubConflict = (0, https_1.onCall)({ secrets: ALL_SECRETS, memory: '256MiB' }, async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const taskId = request.data?.taskId;
    const resolution = request.data?.resolution;
    if (!taskId || !resolution) {
        throw new https_1.HttpsError('invalid-argument', 'taskId and resolution required');
    }
    if (resolution !== 'prefer_local' && resolution !== 'prefer_github') {
        throw new https_1.HttpsError('invalid-argument', 'resolution must be prefer_local or prefer_github');
    }
    const link = await (0, store_1.getTaskLink)(taskId);
    if (!link)
        throw new https_1.HttpsError('not-found', 'No link for task');
    if (link.ownerUserId !== uid)
        throw new https_1.HttpsError('permission-denied', 'Not your link');
    if (link.syncState !== 'conflict') {
        throw new https_1.HttpsError('failed-precondition', 'Task is not in conflict state');
    }
    if (link.issueNumber == null) {
        throw new https_1.HttpsError('failed-precondition', 'Issue not created yet');
    }
    let token;
    try {
        ({ token } = await (0, auth_helper_1.getInstallationTokenForUser)(uid, creds()));
    }
    catch (err) {
        mapConnectionError(err);
    }
    if (resolution === 'prefer_local') {
        const task = await (0, firestore_2.getFirestore)().collection('tasks').doc(taskId).get();
        const status = task.data()?.status ?? 'todo';
        await pushStatus(uid, link, status);
        await (0, store_1.updateTaskLink)(taskId, { syncState: 'synced', lastError: null });
        return { success: true, resolution };
    }
    const issue = await (0, issues_1.getIssue)(token, link.repoOwner, link.repoName, link.issueNumber);
    const taskRef = (0, firestore_2.getFirestore)().collection('tasks').doc(taskId);
    const snap = await taskRef.get();
    const currentStatus = snap.data()?.status ?? 'todo';
    const nextStatus = (0, sync_logic_1.issueStateToTaskStatus)(issue.state, currentStatus);
    if (nextStatus !== currentStatus) {
        await taskRef.set({ status: nextStatus, ...(nextStatus === 'done' ? { completedAt: new Date() } : {}) }, { merge: true });
    }
    await (0, store_1.updateTaskLink)(taskId, {
        issueState: issue.state,
        githubUpdatedAt: issue.updated_at,
        syncState: 'synced',
        lastError: null,
        lastSyncedAt: firestore_2.Timestamp.now(),
        lastOutboundState: issue.state,
    });
    return { success: true, resolution };
});
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
        if ((0, inbound_webhooks_1.shouldRefreshFieldCache)(eventType)) {
            await refreshFieldCacheForWebhook(req.body);
        }
        else if ((0, inbound_webhooks_1.isRelationshipWebhook)(eventType, req.body.action ?? '')) {
            await handleRelationshipEvent(eventType, req.body);
        }
        else if (eventType === 'pull_request') {
            await handlePullRequestEvent(req.body);
        }
        else if (eventType === 'issues') {
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
async function refreshFieldCacheForWebhook(body) {
    const payload = body;
    const orgLogin = payload.organization?.login;
    const installationId = payload.installation?.id;
    if (!orgLogin || !installationId)
        return;
    const snap = await (0, firestore_2.getFirestore)()
        .collection('github_connections')
        .where('accountLogin', '==', orgLogin)
        .limit(10)
        .get();
    if (snap.empty)
        return;
    const appJwt = (0, app_1.createAppJwt)(creds().appId, creds().privateKey);
    const installationToken = await (0, app_1.createInstallationToken)(appJwt, installationId);
    const cache = await (0, field_definitions_1.fetchFieldDefinitionCache)(installationToken, orgLogin);
    await Promise.all(snap.docs.map((doc) => (0, store_1.updateFieldDefinitionCache)(doc.id, cache)));
}
async function handleIssuesEvent(payload) {
    if (!payload?.issue)
        return;
    const { action, issue, repository, sender } = payload;
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
    if (action === 'assigned' || action === 'unassigned') {
        const login = (0, inbound_webhooks_1.extractAssigneeLogin)(payload);
        if (login) {
            await (0, store_1.upsertTaskActor)(link.taskId, login, null);
        }
        else if (payload.assignee?.login) {
            await (0, store_1.deleteTaskActors)(link.taskId, payload.assignee.login);
        }
        return;
    }
    if (action === 'typed' || action === 'untyped') {
        await (0, store_1.updateTaskLink)(link.taskId, {
            issueType: issue.type?.name ?? null,
            githubUpdatedAt: issue.updated_at,
        });
        return;
    }
    if (action === 'milestoned' || action === 'demilestoned') {
        const milestone = (0, inbound_webhooks_1.extractMilestoneTitle)(payload);
        await (0, store_1.upsertTaskFieldValue)(link.taskId, {
            fieldId: -1,
            fieldName: 'milestone',
            dataType: 'text',
            optionId: null,
            textValue: milestone,
            numberValue: payload.milestone?.number ?? null,
        });
        return;
    }
    if ((0, inbound_webhooks_1.isExtendedIssuesAction)(action) && action !== 'closed' && action !== 'reopened') {
        return;
    }
    if (action !== 'closed' && action !== 'reopened')
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
    const taskData = snap.data();
    const currentStatus = taskData?.status ?? 'todo';
    const nextStatus = (0, sync_logic_1.issueStateToTaskStatus)(issue.state, currentStatus);
    const localUpdatedMs = (0, sync_logic_1.taskUpdatedAtToMs)(taskData?.updatedAt);
    const lastSyncedMs = link.lastSyncedAt && typeof link.lastSyncedAt === 'object' && 'toMillis' in link.lastSyncedAt
        ? link.lastSyncedAt.toMillis()
        : 0;
    if (localUpdatedMs > lastSyncedMs && nextStatus !== currentStatus) {
        const { winner } = (0, sync_logic_1.resolveConflict)(issue.updated_at, localUpdatedMs);
        if (winner === 'omnitask') {
            await (0, store_1.updateTaskLink)(link.taskId, {
                syncState: 'conflict',
                githubUpdatedAt: issue.updated_at,
                lastError: 'Local edits are newer than the last sync — review before accepting GitHub changes.',
            });
            return;
        }
    }
    if (nextStatus !== currentStatus) {
        await taskRef.set({ status: nextStatus, ...(nextStatus === 'done' ? { completedAt: new Date() } : {}) }, { merge: true });
    }
    await (0, store_1.updateTaskLink)(link.taskId, {
        issueState: issue.state,
        lastOutboundState: issue.state,
        githubUpdatedAt: issue.updated_at,
        syncState: localUpdatedMs > lastSyncedMs ? 'conflict' : 'synced',
        lastError: localUpdatedMs > lastSyncedMs ? 'Applied GitHub change with concurrent local edits' : null,
    });
}
/** Phase 3: record merged PR metadata on the linked issue task. */
async function handlePullRequestEvent(payload) {
    if (payload.action !== 'closed' || !payload.pull_request?.merged)
        return;
    const owner = payload.repository?.owner.login;
    const repo = payload.repository?.name;
    const issueNumber = payload.issue?.number;
    if (!owner || !repo || issueNumber == null)
        return;
    const link = await (0, store_1.findLinkByIssue)(owner, repo, issueNumber);
    if (!link)
        return;
    await (0, store_1.upsertTaskFieldValue)(link.taskId, {
        fieldId: -3,
        fieldName: 'pull_request',
        dataType: 'text',
        optionId: null,
        textValue: payload.pull_request.html_url ?? 'merged',
        numberValue: null,
    });
}
async function handleRelationshipEvent(eventType, payload) {
    const action = payload.action ?? '';
    if (!payload.issue)
        return;
    const owner = payload.repository?.owner.login ?? payload.issue.repository?.owner?.login ?? null;
    const repo = payload.repository?.name ?? payload.issue.repository?.name ?? null;
    if (!owner || !repo)
        return;
    let link = await (0, store_1.findLinkByIssue)(owner, repo, payload.issue.number);
    if (!link) {
        const taskId = (0, sync_logic_1.parseOmnitaskMarker)(payload.issue.body ?? null);
        if (taskId)
            link = await (0, store_1.getTaskLink)(taskId);
    }
    if (!link)
        return;
    const rel = (0, inbound_webhooks_1.extractRelationshipFromPayload)(eventType, payload);
    if (!rel)
        return;
    const docId = (0, inbound_webhooks_1.relationshipDocId)(link.taskId, rel.kind, rel.relatedRepoOwner, rel.relatedRepoName, rel.relatedIssueNumber);
    if ((0, inbound_webhooks_1.isRelationshipAddAction)(eventType, action)) {
        await (0, store_1.upsertTaskRelationship)(link.taskId, rel.kind, {
            relatedIssueNumber: rel.relatedIssueNumber,
            relatedIssueNodeId: rel.relatedIssueNodeId,
            relatedRepoOwner: rel.relatedRepoOwner,
            relatedRepoName: rel.relatedRepoName,
        });
    }
    else {
        await (0, store_1.deleteTaskRelationship)(docId);
    }
}
//# sourceMappingURL=functions.js.map