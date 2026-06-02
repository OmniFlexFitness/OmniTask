/**
 * GitHub Issues integration — shared types.
 *
 * Phase 1 covers connection, issue create/link, and open/closed status sync.
 * Later-phase shapes (fields, relationships, actors) are intentionally omitted.
 */

/** Per-user GitHub App connection. Stored at `github_connections/{uid}`. */
export interface GithubConnection {
  omnitaskUserId: string;
  accountLogin: string;
  accountType: 'Organization' | 'User';
  installationId: number;
  /** Detected org-gated features. Phase 1 only probes; Phase 2 consumes. */
  capabilities: GithubCapabilities;
  state: 'connected' | 'needs_reauth' | 'error';
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface GithubCapabilities {
  issueTypes: boolean;
  issueFields: boolean;
  projects: boolean;
}

/** Token material, stored separately at `users/{uid}/private/githubOAuth` (admin-only). */
export interface GithubTokenDoc {
  /** User-to-server refresh token (long-lived). */
  refreshToken: string;
  installationId: number;
  updatedAt: FirebaseFirestore.FieldValue;
}

export type SyncState = 'pending' | 'synced' | 'error' | 'conflict';
export type IssueState = 'open' | 'closed';

/** The link between an OmniTask task and a GitHub issue (1:1). `task_github_links/{taskId}`. */
export interface TaskGithubLink {
  taskId: string;
  ownerUserId: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number | null;
  issueNodeId: string | null;
  issueUrl: string | null;
  issueState: IssueState | null;
  issueType: string | null;
  syncState: SyncState;
  lastError: string | null;
  lastSyncedAt: FirebaseFirestore.Timestamp | null;
  /** Remote `updated_at` at the time of our last reconcile — drives conflict detection. */
  githubUpdatedAt: string | null;
  /** Echo-loop guard: the value we last wrote outbound, so its echo webhook no-ops. */
  lastOutboundState: IssueState | null;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

/** Issue-side uniqueness guard. `github_issue_links/{owner}__{repo}__{number}`. */
export interface GithubIssueLink {
  taskId: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
  createdAt: FirebaseFirestore.FieldValue;
}

/** Audit + idempotency record. `github_sync_events/{deliveryId}` (inbound) or auto-id (outbound). */
export interface GithubSyncEvent {
  deliveryId: string | null;
  direction: 'inbound' | 'outbound';
  taskId: string | null;
  eventType: string;
  action: string | null;
  status: 'received' | 'processed' | 'failed' | 'ignored';
  error: string | null;
  createdAt: FirebaseFirestore.FieldValue;
}

/** Minimal GitHub issue payload fields Phase 1 reads (no `any`). */
export interface GithubIssuePayload {
  number: number;
  node_id: string;
  html_url: string;
  state: IssueState;
  title: string;
  body: string | null;
  updated_at: string;
  type?: { name: string } | null;
}

/** The `issues` webhook event envelope (subset). */
export interface GithubIssuesWebhook {
  action: string;
  issue: GithubIssuePayload;
  repository: { name: string; owner: { login: string } };
  sender: { login: string; type: string };
}
