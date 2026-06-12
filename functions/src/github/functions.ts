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
import { getFirestore } from 'firebase-admin/firestore';

import {
  exchangeUserCode,
  createAppJwt,
  createInstallationToken,
  findUserInstallation,
} from './app';
import { detectCapabilities } from './capabilities';
import {
  getInstallationTokenForUser,
  ConnectionError,
  type AppCredentials,
} from './auth-helper';
import { createIssue, getIssue, setIssueState, parseIssueRef } from './issues';
import {
  decideInbound,
  issueStateToTaskStatus,
  taskStatusToIssueState,
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
  recordOutboundSync,
  deleteTaskLink,
  claimDelivery,
  finishDelivery,
  recordOutboundEvent,
  LinkError,
} from './store';
import type { GithubIssuesWebhook, TaskGithubLink } from './types';

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
  { secrets: [githubClientId], memory: '256MiB' },
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

    await upsertConnection(uid, {
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      installationId: installation.installationId,
      capabilities,
      state: 'connected',
    });

    return { accountLogin: installation.accountLogin, capabilities };
  },
);

export const getGithubConnection = onCall<void>({ memory: '256MiB' }, async (request) => {
  requireAuth(request.auth?.uid);
  const connection = await getConnection(request.auth.uid);
  if (!connection) return { connected: false };
  return {
    connected: connection.state === 'connected',
    state: connection.state,
    accountLogin: connection.accountLogin,
    accountType: connection.accountType,
    capabilities: connection.capabilities,
  };
});

export const disconnectGithub = onCall<void>({ memory: '256MiB' }, async (request) => {
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
    issueType: data.type ?? null,
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
      type: data.type,
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
    await recordOutboundEvent(data.taskId, 'create_issue', 'processed', null);
    return { issueNumber: issue.number, issueUrl: issue.html_url, issueState: issue.state };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Issue creation failed';
    await updateTaskLink(data.taskId, { syncState: 'error', lastError: message });
    await recordOutboundEvent(data.taskId, 'create_issue', 'failed', message);
    throw new HttpsError('internal', message);
  }
}

export const unlinkTaskFromGithub = onCall<{ taskId: string }>(
  { memory: '256MiB' },
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
      if (eventType === 'issues') {
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

async function handleIssuesEvent(payload: GithubIssuesWebhook): Promise<void> {
  if (!payload?.issue) return;
  const { action, issue, repository, sender } = payload;
  if (action !== 'closed' && action !== 'reopened') return; // Phase 1: state only

  const owner = repository.owner.login;
  const repo = repository.name;

  // Resolve the link: prefer the issue-keyed guard, fall back to the body marker.
  let link = await findLinkByIssue(owner, repo, issue.number);
  if (!link) {
    const taskId = parseOmnitaskMarker(issue.body);
    if (taskId) link = await getTaskLink(taskId);
  }
  if (!link) return;

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
  const currentStatus = (snap.data()?.status as TaskStatus) ?? 'todo';
  const nextStatus = issueStateToTaskStatus(issue.state, currentStatus);

  if (nextStatus !== currentStatus) {
    await taskRef.set(
      { status: nextStatus, ...(nextStatus === 'done' ? { completedAt: new Date() } : {}) },
      { merge: true },
    );
  }
  // Record the remote state so the echo of our own resulting write is suppressed.
  await updateTaskLink(link.taskId, {
    issueState: issue.state,
    lastOutboundState: issue.state,
    githubUpdatedAt: issue.updated_at,
    syncState: 'synced',
    lastError: null,
  });
}
