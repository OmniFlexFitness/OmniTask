/**
 * Firestore access for the GitHub integration. Centralizes collection names and
 * the transactional reverse-uniqueness guard so the rest of the code never
 * touches raw collection strings.
 */
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { issueLinkKey } from './sync-logic';
import type {
  GithubConnection,
  GithubTokenDoc,
  TaskGithubLink,
  GithubSyncEvent,
  IssueState,
} from './types';

const db = () => getFirestore();

export const COLLECTIONS = {
  connections: 'github_connections',
  taskLinks: 'task_github_links',
  issueLinks: 'github_issue_links',
  syncEvents: 'github_sync_events',
} as const;

const tokenDocRef = (uid: string) =>
  db().collection('users').doc(uid).collection('private').doc('githubOAuth');

// --- Tokens (admin-only; never client-readable) ---

export async function storeUserToken(
  uid: string,
  refreshToken: string,
  installationId: number,
): Promise<void> {
  const payload: GithubTokenDoc = {
    refreshToken,
    installationId,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await tokenDocRef(uid).set(payload, { merge: true });
}

export async function getUserRefreshToken(uid: string): Promise<string | null> {
  const snap = await tokenDocRef(uid).get();
  const token = snap.data()?.refreshToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

export async function deleteUserToken(uid: string): Promise<void> {
  await tokenDocRef(uid).delete();
}

// --- Connection ---

export async function upsertConnection(
  uid: string,
  data: Pick<
    GithubConnection,
    'accountLogin' | 'accountType' | 'installationId' | 'capabilities' | 'state'
  >,
): Promise<void> {
  await db()
    .collection(COLLECTIONS.connections)
    .doc(uid)
    .set(
      {
        omnitaskUserId: uid,
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function setConnectionState(
  uid: string,
  state: GithubConnection['state'],
): Promise<void> {
  await db()
    .collection(COLLECTIONS.connections)
    .doc(uid)
    .set({ state, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function getConnection(uid: string): Promise<GithubConnection | null> {
  const snap = await db().collection(COLLECTIONS.connections).doc(uid).get();
  return snap.exists ? (snap.data() as GithubConnection) : null;
}

export async function deleteConnection(uid: string): Promise<void> {
  await db().collection(COLLECTIONS.connections).doc(uid).delete();
}

// --- Task links ---

export function taskLinkRef(taskId: string) {
  return db().collection(COLLECTIONS.taskLinks).doc(taskId);
}

export async function getTaskLink(taskId: string): Promise<TaskGithubLink | null> {
  const snap = await taskLinkRef(taskId).get();
  return snap.exists ? (snap.data() as TaskGithubLink) : null;
}

export async function findLinkByIssue(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<TaskGithubLink | null> {
  const guard = await db()
    .collection(COLLECTIONS.issueLinks)
    .doc(issueLinkKey(owner, repo, issueNumber))
    .get();
  const taskId = guard.data()?.taskId;
  return typeof taskId === 'string' ? getTaskLink(taskId) : null;
}

/**
 * Create a task↔issue link inside a transaction that also claims the issue-side
 * uniqueness guard (spec data-model §5 + plan). Throws `LINK_EXISTS` if the task is
 * already linked, or `ISSUE_TAKEN` if the issue is bound to a different task.
 */
export async function createLinkTransactional(
  link: Omit<TaskGithubLink, 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const taskRef = taskLinkRef(link.taskId);
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(taskRef);
    if (existing.exists) throw new LinkError('LINK_EXISTS');

    let guardRef: FirebaseFirestore.DocumentReference | null = null;
    if (link.issueNumber !== null) {
      guardRef = db()
        .collection(COLLECTIONS.issueLinks)
        .doc(issueLinkKey(link.repoOwner, link.repoName, link.issueNumber));
      const guard = await tx.get(guardRef);
      if (guard.exists && guard.data()?.taskId !== link.taskId) throw new LinkError('ISSUE_TAKEN');
    }

    tx.set(taskRef, {
      ...link,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (guardRef && link.issueNumber !== null) {
      tx.set(guardRef, {
        taskId: link.taskId,
        repoOwner: link.repoOwner,
        repoName: link.repoName,
        issueNumber: link.issueNumber,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

/** Claim the issue-side guard after an issue number is known (create-new path). */
export async function claimIssueGuard(
  taskId: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<void> {
  await db()
    .collection(COLLECTIONS.issueLinks)
    .doc(issueLinkKey(owner, repo, issueNumber))
    .set(
      { taskId, repoOwner: owner, repoName: repo, issueNumber, createdAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
}

export async function updateTaskLink(
  taskId: string,
  patch: Partial<TaskGithubLink>,
): Promise<void> {
  await taskLinkRef(taskId).set(
    { ...patch, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export async function recordOutboundSync(
  taskId: string,
  issueState: IssueState,
  githubUpdatedAt: string | null,
): Promise<void> {
  await updateTaskLink(taskId, {
    issueState,
    lastOutboundState: issueState,
    syncState: 'synced',
    lastError: null,
    lastSyncedAt: Timestamp.now(),
    githubUpdatedAt,
  });
}

export async function deleteTaskLink(taskId: string): Promise<void> {
  const link = await getTaskLink(taskId);
  const batch = db().batch();
  batch.delete(taskLinkRef(taskId));
  if (link?.issueNumber != null) {
    batch.delete(
      db()
        .collection(COLLECTIONS.issueLinks)
        .doc(issueLinkKey(link.repoOwner, link.repoName, link.issueNumber)),
    );
  }
  await batch.commit();
}

// --- Sync events (idempotency + audit) ---

/**
 * Claim an inbound delivery id. Returns false if already seen (dedupe), true if
 * this call is the first to record it. `github_sync_events/{deliveryId}`.
 */
export async function claimDelivery(deliveryId: string, eventType: string): Promise<boolean> {
  const ref = db().collection(COLLECTIONS.syncEvents).doc(deliveryId);
  try {
    await ref.create({
      deliveryId,
      direction: 'inbound',
      taskId: null,
      eventType,
      action: null,
      status: 'received',
      error: null,
      createdAt: FieldValue.serverTimestamp(),
    } satisfies GithubSyncEvent);
    return true;
  } catch {
    // `create` throws ALREADY_EXISTS on a duplicate delivery — that's the dedupe.
    return false;
  }
}

export async function finishDelivery(
  deliveryId: string,
  patch: Partial<GithubSyncEvent>,
): Promise<void> {
  await db().collection(COLLECTIONS.syncEvents).doc(deliveryId).set(patch, { merge: true });
}

export async function recordOutboundEvent(
  taskId: string | null,
  eventType: string,
  status: GithubSyncEvent['status'],
  error: string | null,
): Promise<void> {
  await db().collection(COLLECTIONS.syncEvents).add({
    deliveryId: null,
    direction: 'outbound',
    taskId,
    eventType,
    action: null,
    status,
    error,
    createdAt: FieldValue.serverTimestamp(),
  } satisfies GithubSyncEvent);
}

export class LinkError extends Error {
  constructor(readonly code: 'LINK_EXISTS' | 'ISSUE_TAKEN') {
    super(code);
    this.name = 'LinkError';
  }
}
