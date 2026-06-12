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
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import {
  exchangeUserCode,
  createAppJwt,
  createInstallationToken,
  findUserInstallation,
} from './app';
import { detectCapabilities } from './capabilities';
import { fetchFieldDefinitionCache } from './field-definitions';
import { mergeLabels, planIssueTypeCreate, planPriorityCreate } from './degradation';
import {
  extractAssigneeLogin,
  extractMilestoneTitle,
  extractRelationshipFromPayload,
  isExtendedIssuesAction,
  isRelationshipAddAction,
  isRelationshipWebhook,
  relationshipDocId,
  shouldRefreshFieldCache,
  type RelationshipWebhookPayload,
} from './inbound-webhooks';
import { applyPriorityFieldValue } from './issue-fields';
import { addIssueToProjectV2, createLinkedBranch, suggestLinkedBranchName } from './graphql';
import {
  getInstallationTokenForUser,
  ConnectionError,
  type AppCredentials,
} from './auth-helper';
import { createIssue, getIssue, setIssueState, parseIssueRef } from './issues';
import {
  decideInbound,
  issueStateToTaskStatus,
  resolveConflict,
  taskStatusToIssueState,
  taskUpdatedAtToMs,
  verifyWebhookSignature,
  parseOmnitaskMarker,
  type TaskStatus,
} from './sync-logic';
import {
  upsertConnection,
  getConnection,
  deleteConnection,
  storeUserToken,
  deleteUserToken,
  createLinkTransactional,
  claimIssueGuard,
  getTaskLink,
  findLinkByIssue,
  updateTaskLink,
  updateFieldDefinitionCache,
  recordOutboundSync,
  updateConnectionSettings,
  deleteTaskLink,
  claimDelivery,
  finishDelivery,
  recordOutboundEvent,
  upsertTaskActor,
  deleteTaskActors,
  upsertTaskFieldValue,
  upsertTaskRelationship,
  deleteTaskRelationship,
  LinkError,
} from './store';
import type { GithubConnection, GithubIssuesWebhook, TaskGithubLink } from './types';

const githubAppId = defineSecret('GITHUB_APP_ID');
const githubAppPrivateKey = defineSecret('GITHUB_APP_PRIVATE_KEY');
const githubClientId = defineSecret('GITHUB_CLIENT_ID');
const githubClientSecret = defineSecret('GITHUB_CLIENT_SECRET');
const githubWebhookSecret = defineSecret('GITHUB_WEBHOOK_SECRET');

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
function isSecretConfigured(value: string | undefined): boolean {
  return !!value && value !== UNCONFIGURED_SECRET_VALUE;
}

/** Bot identity that authors our own outbound writes — used for echo suppression. */
const BOT_LOGIN = 'omnitask-sync[bot]';

function creds(): AppCredentials {
  return {
    appId: githubAppId.value(),
    privateKey: githubAppPrivateKey.value().replace(/\\n/g, '\n'),
    clientId: githubClientId.value(),
    clientSecret: githubClientSecret.value(),
  };
}

function requireAuth(uid: string | undefined): asserts uid is string {
  if (!uid) throw new HttpsError('unauthenticated', 'User must be authenticated');
}

function mapConnectionError(err: unknown): never {
  if (err instanceof ConnectionError) {
    throw new HttpsError(
      'failed-precondition',
      err.code === 'NEEDS_REAUTH' ? 'GitHub access expired. Reconnect your account' : err.message,
    );
  }
  throw err instanceof Error
    ? new HttpsError('internal', err.message)
    : new HttpsError('internal', 'Unexpected error');
}

// --- Connection callables ---

export const getGithubOAuthConfig = onCall<void>(
  { secrets: [githubClientId], memory: '128MiB' },
  async (request) => {
    requireAuth(request.auth?.uid);
    const clientId = githubClientId.value();
    if (!isSecretConfigured(clientId)) {
      throw new HttpsError('failed-precondition', 'GitHub client id not configured');
    }
    return { clientId };
  },
);

export const completeGithubAuth = onCall<{ code: string; redirectUri: string }>(
  { secrets: ALL_SECRETS, memory: '256MiB' },
  async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const { code, redirectUri } = request.data ?? {};
    if (!code || !redirectUri) {
      throw new HttpsError('invalid-argument', 'Missing code or redirectUri');
    }

    const c = creds();
    const tokens = await exchangeUserCode(c.clientId, c.clientSecret, code, redirectUri);

    const installation = await findUserInstallation(tokens.accessToken);
    if (!installation) {
      throw new HttpsError(
        'failed-precondition',
        'No OmniTask Sync installation found. Install the GitHub App on a repo first',
      );
    }

    if (!tokens.refreshToken) {
      throw new HttpsError('failed-precondition', 'GitHub did not return a refresh token');
    }
    await storeUserToken(uid, tokens.refreshToken, installation.installationId);

    // System-token capability probe.
    const appJwt = createAppJwt(c.appId, c.privateKey);
    const installationToken = await createInstallationToken(appJwt, installation.installationId);
    const capabilities = await detectCapabilities(
      installationToken,
      installation.accountLogin,
      installation.accountType,
    );

    const fieldDefinitionCache =
      installation.accountType === 'Organization'
        ? await fetchFieldDefinitionCache(installationToken, installation.accountLogin)
        : null;

    await upsertConnection(uid, {
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      installationId: installation.installationId,
      capabilities,
      fieldDefinitionCache,
      state: 'connected',
    });

    return { accountLogin: installation.accountLogin, capabilities, fieldDefinitionCache };
  },
);

export const getGithubConnection = onCall<void>({ memory: '128MiB' }, async (request) => {
  requireAuth(request.auth?.uid);
  const connection = await getConnection(request.auth.uid);
  if (!connection) return { connected: false };
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

export const updateGithubConnectionSettings = onCall<{
  defaultProjectNodeId?: string | null;
  createLinkedBranchOnLink?: boolean;
}>({ memory: '128MiB' }, async (request) => {
  requireAuth(request.auth?.uid);
  const uid = request.auth.uid;
  const connection = await getConnection(uid);
  if (!connection || connection.state !== 'connected') {
    throw new HttpsError('failed-precondition', 'GitHub not connected');
  }

  const patch: Pick<GithubConnection, 'defaultProjectNodeId' | 'createLinkedBranchOnLink'> = {};
  if (request.data?.defaultProjectNodeId !== undefined) {
    patch.defaultProjectNodeId = request.data.defaultProjectNodeId || null;
  }
  if (request.data?.createLinkedBranchOnLink !== undefined) {
    patch.createLinkedBranchOnLink = Boolean(request.data.createLinkedBranchOnLink);
  }
  if (!Object.keys(patch).length) {
    throw new HttpsError('invalid-argument', 'No settings to update');
  }

  await updateConnectionSettings(uid, patch);
  return { success: true, ...patch };
});

export const refreshGithubFieldConfig = onCall<void>(
  { secrets: ALL_SECRETS, memory: '256MiB' },
  async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const connection = await getConnection(uid);
    if (!connection || connection.state !== 'connected') {
      throw new HttpsError('failed-precondition', 'GitHub not connected');
    }
    if (connection.accountType !== 'Organization') {
      return { refreshed: false, reason: 'personal_account' };
    }

    let token: string;
    try {
      ({ token } = await getInstallationTokenForUser(uid, creds()));
    } catch (err) {
      mapConnectionError(err);
    }

    const cache = await fetchFieldDefinitionCache(token, connection.accountLogin);
    await updateFieldDefinitionCache(uid, cache);
    return { refreshed: true, fieldDefinitionCache: cache };
  },
);

export const disconnectGithub = onCall<void>({ memory: '128MiB' }, async (request) => {
  requireAuth(request.auth?.uid);
  await deleteUserToken(request.auth.uid);
  await deleteConnection(request.auth.uid);
  return { success: true };
});

// --- Linking callables ---

interface LinkInput {
  taskId: string;
  mode: 'create' | 'existing';
  repoOwner?: string;
  repoName?: string;
  title?: string;
  body?: string;
  backlinkUrl?: string;
  issueRef?: string;
  type?: string | null;
  priority?: string | null;
}

export const linkTaskToGithub = onCall<LinkInput>(
  { secrets: ALL_SECRETS, memory: '256MiB' },
  async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const data = request.data;
    if (!data?.taskId) throw new HttpsError('invalid-argument', 'taskId required');

    let token: string;
    try {
      ({ token } = await getInstallationTokenForUser(uid, creds()));
    } catch (err) {
      mapConnectionError(err);
    }

    try {
      if (data.mode === 'existing') {
        return await linkExisting(uid, token, data);
      }
      return await linkCreate(uid, token, data);
    } catch (err) {
      if (err instanceof LinkError) {
        throw new HttpsError(
          'already-exists',
          err.code === 'LINK_EXISTS'
            ? 'This task is already linked to a GitHub issue'
            : 'That GitHub issue is already linked to another task',
        );
      }
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', err instanceof Error ? err.message : 'Link failed');
    }
  },
);

async function linkExisting(uid: string, token: string, data: LinkInput) {
  const ref = data.issueRef ? parseIssueRef(data.issueRef) : null;
  if (!ref) throw new HttpsError('invalid-argument', 'Could not parse issue URL or number');

  const issue = await getIssue(token, ref.owner, ref.repo, ref.number);
  await createLinkTransactional({
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
  await recordOutboundEvent(data.taskId, 'link_existing', 'processed', null);
  return { issueNumber: issue.number, issueUrl: issue.html_url, issueState: issue.state };
}

async function linkCreate(uid: string, token: string, data: LinkInput) {
  if (!data.repoOwner || !data.repoName || !data.title) {
    throw new HttpsError('invalid-argument', 'repoOwner, repoName, and title required');
  }

  const connection = await getConnection(uid);
  const capabilities = connection?.capabilities ?? {
    issueTypes: false,
    issueFields: false,
    projects: false,
  };
  const accountType = connection?.accountType ?? 'User';

  const typePlan = planIssueTypeCreate(accountType, capabilities, data.type ?? null);
  const priorityPlan = planPriorityCreate(capabilities, data.priority ?? null);
  const labels = mergeLabels(typePlan.labels, priorityPlan.priorityLabel ? [priorityPlan.priorityLabel] : []);

  // Reserve the task-side link first (empty issue), so a failed create still leaves a
  // recoverable, retryable record rather than orphaning an issue (spec §11).
  await createLinkTransactional({
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
    const issue = await createIssue(token, {
      owner: data.repoOwner,
      repo: data.repoName,
      title: data.title,
      taskId: data.taskId,
      body: data.body,
      backlinkUrl: data.backlinkUrl,
      type: typePlan.type,
      labels,
    });
    await claimIssueGuard(data.taskId, data.repoOwner, data.repoName, issue.number);
    await updateTaskLink(data.taskId, {
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
        await applyPriorityFieldValue(
          token,
          data.repoOwner,
          data.repoName,
          issue.number,
          connection.fieldDefinitionCache,
          data.priority,
        );
      } catch {
        /* label fallback already applied */
      }
    }
    if (data.priority) {
      await upsertTaskFieldValue(data.taskId, {
        fieldId: -2,
        fieldName: 'priority',
        dataType: 'single_select',
        optionId: null,
        textValue: data.priority,
        numberValue: null,
      });
    }
    await applyPhase3Enrichment(token, connection, data, issue);
    await recordOutboundEvent(data.taskId, 'create_issue', 'processed', null);
    return { issueNumber: issue.number, issueUrl: issue.html_url, issueState: issue.state };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Issue creation failed';
    await updateTaskLink(data.taskId, { syncState: 'error', lastError: message });
    await recordOutboundEvent(data.taskId, 'create_issue', 'failed', message);
    throw new HttpsError('internal', message);
  }
}

async function applyPhase3Enrichment(
  token: string,
  connection: GithubConnection | null,
  data: LinkInput,
  issue: { node_id?: string | null },
): Promise<void> {
  if (!issue.node_id) return;

  if (connection?.defaultProjectNodeId && connection.capabilities?.projects) {
    try {
      await addIssueToProjectV2(token, connection.defaultProjectNodeId, issue.node_id);
    } catch {
      /* non-fatal — project board may be misconfigured */
    }
  }

  if (connection?.createLinkedBranchOnLink) {
    try {
      const branchName = suggestLinkedBranchName(data.taskId, data.title ?? 'task');
      const name = await createLinkedBranch(token, issue.node_id, branchName);
      if (name) {
        await updateTaskLink(data.taskId, { linkedBranchName: name });
      }
    } catch {
      /* requires Contents write permission on the repo */
    }
  }
}

export const resolveGithubConflict = onCall<{
  taskId: string;
  resolution: 'prefer_local' | 'prefer_github';
}>(
  { secrets: ALL_SECRETS, memory: '256MiB' },
  async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const taskId = request.data?.taskId;
    const resolution = request.data?.resolution;
    if (!taskId || !resolution) {
      throw new HttpsError('invalid-argument', 'taskId and resolution required');
    }
    if (resolution !== 'prefer_local' && resolution !== 'prefer_github') {
      throw new HttpsError('invalid-argument', 'resolution must be prefer_local or prefer_github');
    }

    const link = await getTaskLink(taskId);
    if (!link) throw new HttpsError('not-found', 'No link for task');
    if (link.ownerUserId !== uid) throw new HttpsError('permission-denied', 'Not your link');
    if (link.syncState !== 'conflict') {
      throw new HttpsError('failed-precondition', 'Task is not in conflict state');
    }
    if (link.issueNumber == null) {
      throw new HttpsError('failed-precondition', 'Issue not created yet');
    }

    let token: string;
    try {
      ({ token } = await getInstallationTokenForUser(uid, creds()));
    } catch (err) {
      mapConnectionError(err);
    }

    if (resolution === 'prefer_local') {
      const task = await getFirestore().collection('tasks').doc(taskId).get();
      const status = (task.data()?.status as TaskStatus) ?? 'todo';
      await pushStatus(uid, link, status);
      await updateTaskLink(taskId, { syncState: 'synced', lastError: null });
      return { success: true, resolution };
    }

    const issue = await getIssue(token, link.repoOwner, link.repoName, link.issueNumber);
    const taskRef = getFirestore().collection('tasks').doc(taskId);
    const snap = await taskRef.get();
    const currentStatus = (snap.data()?.status as TaskStatus) ?? 'todo';
    const nextStatus = issueStateToTaskStatus(issue.state, currentStatus);
    if (nextStatus !== currentStatus) {
      await taskRef.set(
        { status: nextStatus, ...(nextStatus === 'done' ? { completedAt: new Date() } : {}) },
        { merge: true },
      );
    }
    await updateTaskLink(taskId, {
      issueState: issue.state,
      githubUpdatedAt: issue.updated_at,
      syncState: 'synced',
      lastError: null,
      lastSyncedAt: Timestamp.now(),
      lastOutboundState: issue.state,
    });
    return { success: true, resolution };
  },
);

export const unlinkTaskFromGithub = onCall<{ taskId: string }>(
  { memory: '128MiB' },
  async (request) => {
    requireAuth(request.auth?.uid);
    const taskId = request.data?.taskId;
    if (!taskId) throw new HttpsError('invalid-argument', 'taskId required');
    const link = await getTaskLink(taskId);
    if (link && link.ownerUserId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'Not your link');
    }
    await deleteTaskLink(taskId);
    return { success: true };
  },
);

export const retryGithubSync = onCall<{ taskId: string }>(
  { secrets: ALL_SECRETS, memory: '256MiB' },
  async (request) => {
    requireAuth(request.auth?.uid);
    const uid = request.auth.uid;
    const taskId = request.data?.taskId;
    if (!taskId) throw new HttpsError('invalid-argument', 'taskId required');
    const link = await getTaskLink(taskId);
    if (!link) throw new HttpsError('not-found', 'No link for task');
    if (link.ownerUserId !== uid) throw new HttpsError('permission-denied', 'Not your link');

    const task = await getFirestore().collection('tasks').doc(taskId).get();
    const status = (task.data()?.status as TaskStatus) ?? 'todo';
    try {
      await pushStatus(uid, link, status);
      return { success: true };
    } catch (err) {
      mapConnectionError(err);
    }
  },
);

// --- Outbound trigger: task status → issue state ---

export const syncTaskStatusToGithub = onDocumentWritten(
  { document: 'tasks/{taskId}', secrets: ALL_SECRETS, memory: '256MiB' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // deletion handled elsewhere (unlink is explicit)
    const taskId = event.params.taskId;

    const link = await getTaskLink(taskId);
    if (!link || link.issueNumber == null) return; // unlinked tasks are untouched

    const beforeStatus = event.data?.before?.data()?.status as TaskStatus | undefined;
    const afterStatus = after.data()?.status as TaskStatus | undefined;
    if (!afterStatus || beforeStatus === afterStatus) return;

    const desired = taskStatusToIssueState(afterStatus);
    if (desired === link.issueState) return; // already in the right state — no echo write

    try {
      await pushStatus(link.ownerUserId, link, afterStatus);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      await updateTaskLink(taskId, { syncState: 'error', lastError: message });
      await recordOutboundEvent(taskId, 'status_sync', 'failed', message);
    }
  },
);

async function pushStatus(uid: string, link: TaskGithubLink, status: TaskStatus): Promise<void> {
  if (link.issueNumber == null) return;
  const { token } = await getInstallationTokenForUser(uid, creds());
  const desired = taskStatusToIssueState(status);
  const issue = await setIssueState(token, link.repoOwner, link.repoName, link.issueNumber, desired);
  await recordOutboundSync(link.taskId, issue.state, issue.updated_at);
  await recordOutboundEvent(link.taskId, 'status_sync', 'processed', null);
}

// --- Inbound webhook ---

export const githubWebhook = onRequest(
  { secrets: [githubWebhookSecret], memory: '256MiB' },
  async (req, res) => {
    const signature = req.header('X-Hub-Signature-256') ?? undefined;
    // rawBody is provided by Cloud Functions; fall back to a re-stringify if absent.
    const raw: Buffer | string = req.rawBody ?? JSON.stringify(req.body);

    if (!verifyWebhookSignature(raw, signature, githubWebhookSecret.value())) {
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
    const fresh = await claimDelivery(deliveryId, eventType);
    if (!fresh) {
      res.status(200).send('duplicate');
      return;
    }

    res.status(202).send('accepted');

    try {
      if (shouldRefreshFieldCache(eventType)) {
        await refreshFieldCacheForWebhook(req.body);
      } else if (isRelationshipWebhook(eventType, (req.body as { action?: string }).action ?? '')) {
        await handleRelationshipEvent(
          eventType,
          req.body as RelationshipWebhookPayload,
        );
      } else if (eventType === 'pull_request') {
        await handlePullRequestEvent(req.body as PullRequestWebhookPayload);
      } else if (eventType === 'issues') {
        await handleIssuesEvent(req.body as GithubIssuesWebhook);
      }
      await finishDelivery(deliveryId, { status: 'processed' });
    } catch (err) {
      await finishDelivery(deliveryId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'handler error',
      });
    }
  },
);

async function refreshFieldCacheForWebhook(body: unknown): Promise<void> {
  const payload = body as {
    organization?: { login?: string };
    installation?: { id?: number };
  };
  const orgLogin = payload.organization?.login;
  const installationId = payload.installation?.id;
  if (!orgLogin || !installationId) return;

  const snap = await getFirestore()
    .collection('github_connections')
    .where('accountLogin', '==', orgLogin)
    .limit(10)
    .get();
  if (snap.empty) return;

  const appJwt = createAppJwt(creds().appId, creds().privateKey);
  const installationToken = await createInstallationToken(appJwt, installationId);
  const cache = await fetchFieldDefinitionCache(installationToken, orgLogin);
  await Promise.all(snap.docs.map((doc) => updateFieldDefinitionCache(doc.id, cache)));
}

async function handleIssuesEvent(payload: GithubIssuesWebhook): Promise<void> {
  if (!payload?.issue) return;
  const { action, issue, repository, sender } = payload;

  const owner = repository.owner.login;
  const repo = repository.name;

  // Resolve the link: prefer the issue-keyed guard, fall back to the body marker.
  let link = await findLinkByIssue(owner, repo, issue.number);
  if (!link) {
    const taskId = parseOmnitaskMarker(issue.body);
    if (taskId) link = await getTaskLink(taskId);
  }
  if (!link) return;

  if (action === 'assigned' || action === 'unassigned') {
    const login = extractAssigneeLogin(payload);
    if (login) {
      await upsertTaskActor(link.taskId, login, null);
    } else if (payload.assignee?.login) {
      await deleteTaskActors(link.taskId, payload.assignee.login);
    }
    return;
  }

  if (action === 'typed' || action === 'untyped') {
    await updateTaskLink(link.taskId, {
      issueType: issue.type?.name ?? null,
      githubUpdatedAt: issue.updated_at,
    });
    return;
  }

  if (action === 'milestoned' || action === 'demilestoned') {
    const milestone = extractMilestoneTitle(payload);
    await upsertTaskFieldValue(link.taskId, {
      fieldId: -1,
      fieldName: 'milestone',
      dataType: 'text',
      optionId: null,
      textValue: milestone,
      numberValue: payload.milestone?.number ?? null,
    });
    return;
  }

  if (isExtendedIssuesAction(action) && action !== 'closed' && action !== 'reopened') {
    return;
  }

  if (action !== 'closed' && action !== 'reopened') return;

  const decision = decideInbound({
    incomingUpdatedAt: issue.updated_at,
    storedGithubUpdatedAt: link.githubUpdatedAt,
    lastOutboundState: link.lastOutboundState,
    incomingState: issue.state,
    senderIsBot: sender.type === 'Bot' || sender.login === BOT_LOGIN,
  });
  if (decision.kind === 'ignore') return;

  const taskRef = getFirestore().collection('tasks').doc(link.taskId);
  const snap = await taskRef.get();
  if (!snap.exists) return;
  const taskData = snap.data();
  const currentStatus = (taskData?.status as TaskStatus) ?? 'todo';
  const nextStatus = issueStateToTaskStatus(issue.state, currentStatus);

  const localUpdatedMs = taskUpdatedAtToMs(taskData?.updatedAt);
  const lastSyncedMs =
    link.lastSyncedAt && typeof link.lastSyncedAt === 'object' && 'toMillis' in link.lastSyncedAt
      ? (link.lastSyncedAt as { toMillis: () => number }).toMillis()
      : 0;

  if (localUpdatedMs > lastSyncedMs && nextStatus !== currentStatus) {
    const { winner } = resolveConflict(issue.updated_at, localUpdatedMs);
    if (winner === 'omnitask') {
      await updateTaskLink(link.taskId, {
        syncState: 'conflict',
        githubUpdatedAt: issue.updated_at,
        lastError:
          'Local edits are newer than the last sync — review before accepting GitHub changes.',
      });
      return;
    }
  }

  if (nextStatus !== currentStatus) {
    await taskRef.set(
      { status: nextStatus, ...(nextStatus === 'done' ? { completedAt: new Date() } : {}) },
      { merge: true },
    );
  }
  await updateTaskLink(link.taskId, {
    issueState: issue.state,
    lastOutboundState: issue.state,
    githubUpdatedAt: issue.updated_at,
    syncState: localUpdatedMs > lastSyncedMs ? 'conflict' : 'synced',
    lastError: localUpdatedMs > lastSyncedMs ? 'Applied GitHub change with concurrent local edits' : null,
  });
}

interface PullRequestWebhookPayload {
  action?: string;
  pull_request?: { merged?: boolean; html_url?: string; merged_at?: string | null };
  issue?: { number: number };
  repository?: { owner: { login: string }; name: string };
}

/** Phase 3: record merged PR metadata on the linked issue task. */
async function handlePullRequestEvent(payload: PullRequestWebhookPayload): Promise<void> {
  if (payload.action !== 'closed' || !payload.pull_request?.merged) return;
  const owner = payload.repository?.owner.login;
  const repo = payload.repository?.name;
  const issueNumber = payload.issue?.number;
  if (!owner || !repo || issueNumber == null) return;

  const link = await findLinkByIssue(owner, repo, issueNumber);
  if (!link) return;

  await upsertTaskFieldValue(link.taskId, {
    fieldId: -3,
    fieldName: 'pull_request',
    dataType: 'text',
    optionId: null,
    textValue: payload.pull_request.html_url ?? 'merged',
    numberValue: null,
  });
}

async function handleRelationshipEvent(
  eventType: string,
  payload: RelationshipWebhookPayload,
): Promise<void> {
  const action = payload.action ?? '';
  if (!payload.issue) return;

  const owner =
    payload.repository?.owner.login ?? payload.issue.repository?.owner?.login ?? null;
  const repo = payload.repository?.name ?? payload.issue.repository?.name ?? null;
  if (!owner || !repo) return;

  let link = await findLinkByIssue(owner, repo, payload.issue.number);
  if (!link) {
    const taskId = parseOmnitaskMarker((payload.issue as { body?: string }).body ?? null);
    if (taskId) link = await getTaskLink(taskId);
  }
  if (!link) return;

  const rel = extractRelationshipFromPayload(eventType, payload);
  if (!rel) return;

  const docId = relationshipDocId(
    link.taskId,
    rel.kind,
    rel.relatedRepoOwner,
    rel.relatedRepoName,
    rel.relatedIssueNumber,
  );

  if (isRelationshipAddAction(eventType, action)) {
    await upsertTaskRelationship(link.taskId, rel.kind, {
      relatedIssueNumber: rel.relatedIssueNumber,
      relatedIssueNodeId: rel.relatedIssueNodeId,
      relatedRepoOwner: rel.relatedRepoOwner,
      relatedRepoName: rel.relatedRepoName,
    });
  } else {
    await deleteTaskRelationship(docId);
  }
}
