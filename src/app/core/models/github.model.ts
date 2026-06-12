/** Client-side types for the GitHub Issues integration. */

export interface GithubCapabilities {
  issueTypes: boolean;
  issueFields: boolean;
  projects: boolean;
}

export interface GithubIssueTypeDefinition {
  id: number;
  nodeId: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
}

export interface GithubIssueFieldOption {
  id: number;
  name: string;
}

export interface GithubIssueFieldDefinition {
  id: number;
  nodeId: string;
  name: string;
  dataType: string;
  pinnedToIssueTypeIds: number[];
  options: GithubIssueFieldOption[];
}

export interface GithubFieldDefinitionCache {
  issueTypes: GithubIssueTypeDefinition[];
  issueFields: GithubIssueFieldDefinition[];
  fetchedAt: string;
}

export type GithubConnectionState = 'connected' | 'needs_reauth' | 'error';

export interface GithubConnectionStatus {
  connected: boolean;
  state?: GithubConnectionState;
  accountLogin?: string;
  accountType?: 'Organization' | 'User';
  capabilities?: GithubCapabilities;
  fieldDefinitionCache?: GithubFieldDefinitionCache | null;
  /** GitHub Projects v2 node id for auto-adding new issues (Phase 3). */
  defaultProjectNodeId?: string | null;
  /** Create a linked branch when creating a GitHub issue (Phase 3). */
  createLinkedBranchOnLink?: boolean;
}

export type GithubLinkSyncState = 'pending' | 'synced' | 'error' | 'conflict';
export type GithubIssueState = 'open' | 'closed';

/** Result returned from a link/create/link-existing call. */
export interface GithubLinkResult {
  issueNumber: number;
  issueUrl: string;
  issueState: GithubIssueState;
}

/** Firestore mirror of `task_github_links/{taskId}`. */
export interface TaskGithubLink {
  taskId: string;
  ownerUserId: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number | null;
  issueNodeId: string | null;
  issueUrl: string | null;
  issueState: GithubIssueState | null;
  issueType: string | null;
  syncState: GithubLinkSyncState;
  lastError: string | null;
  githubUpdatedAt: string | null;
  linkedBranchName?: string | null;
}

export interface TaskGithubFieldValue {
  id?: string;
  taskId: string;
  fieldId: number;
  fieldName: string;
  dataType: string;
  optionId: number | null;
  textValue: string | null;
  numberValue: number | null;
}

export type GithubRelationshipKind = 'sub_issue' | 'blocked_by' | 'blocking';

export interface TaskGithubRelationship {
  id?: string;
  taskId: string;
  kind: GithubRelationshipKind;
  relatedIssueNumber: number;
  relatedIssueNodeId: string | null;
  relatedRepoOwner: string;
  relatedRepoName: string;
}

export interface TaskGithubActor {
  id?: string;
  taskId: string;
  login: string;
  avatarUrl: string | null;
  role: 'assignee';
}
