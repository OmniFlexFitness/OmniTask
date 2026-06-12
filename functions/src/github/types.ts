/**
 * GitHub Issues integration — shared types.
 *
 * Phase 1 covers connection, issue create/link, and open/closed status sync.
 * Later-phase shapes (fields, relationships, actors) are intentionally omitted.
 */

/** Per-user GitHub App connection. Stored at `github_connections/{uid}`. */
/** Cached org issue-type + issue-field definitions (Phase 2, spec §6). */
export interface GithubFieldDefinitionCache {
  issueTypes: GithubIssueTypeDefinition[];
  issueFields: GithubIssueFieldDefinition[];
  /** ISO-8601 timestamp of the last successful fetch. */
  fetchedAt: string;
}

export interface GithubIssueTypeDefinition {
  id: number;
  nodeId: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
}

/** Single-select option on an org Issue Field. */
export interface GithubIssueFieldOption {
  id: number;
  name: string;
}

export type GithubIssueFieldDataType =
  | 'single_select'
  | 'text'
  | 'number'
  | 'date'
  | 'iteration'
  | string;

export interface GithubIssueFieldDefinition {
  id: number;
  nodeId: string;
  name: string;
  dataType: GithubIssueFieldDataType;
  /** Issue type IDs this field is pinned to (empty = all types). */
  pinnedToIssueTypeIds: number[];
  options: GithubIssueFieldOption[];
}

export interface GithubConnection {
  omnitaskUserId: string;
  accountLogin: string;
  accountType: 'Organization' | 'User';
  installationId: number;
  /** Detected org-gated features. Phase 1 only probes; Phase 2 consumes. */
  capabilities: GithubCapabilities;
  /** Org issue-type/field metadata for progressive linking UI (Phase 2). */
  fieldDefinitionCache?: GithubFieldDefinitionCache | null;
  /** GitHub Projects v2 node id — new issues are added to this board (Phase 3). */
  defaultProjectNodeId?: string | null;
  /** When true, create a linked branch on issue create (Phase 3; needs Contents RW). */
  createLinkedBranchOnLink?: boolean;
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
  /** Linked branch name when createLinkedBranchOnLink succeeded (Phase 3). */
  linkedBranchName?: string | null;
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
  repository: { name: string; owner: { login: string; type?: string } };
  sender: { login: string; type: string };
  assignee?: { login: string } | null;
  milestone?: { title: string; number: number } | null;
}

/** Flexible Issue Field value stored per linked task (Phase 2). */
export interface TaskGithubFieldValue {
  taskId: string;
  fieldId: number;
  fieldName: string;
  dataType: GithubIssueFieldDataType;
  /** Single-select option id, when applicable. */
  optionId: number | null;
  textValue: string | null;
  numberValue: number | null;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export type GithubRelationshipKind = 'sub_issue' | 'blocked_by' | 'blocking';

export interface TaskGithubRelationship {
  taskId: string;
  kind: GithubRelationshipKind;
  relatedIssueNumber: number;
  relatedIssueNodeId: string | null;
  relatedRepoOwner: string;
  relatedRepoName: string;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface TaskGithubActor {
  taskId: string;
  login: string;
  avatarUrl: string | null;
  role: 'assignee';
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}
