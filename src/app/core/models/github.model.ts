/** Client-side types for the GitHub Issues integration (Phase 1). */

export interface GithubCapabilities {
  issueTypes: boolean;
  issueFields: boolean;
  projects: boolean;
}

export type GithubConnectionState = 'connected' | 'needs_reauth' | 'error';

export interface GithubConnectionStatus {
  connected: boolean;
  state?: GithubConnectionState;
  accountLogin?: string;
  accountType?: 'Organization' | 'User';
  capabilities?: GithubCapabilities;
}

export type GithubLinkSyncState = 'pending' | 'synced' | 'error' | 'conflict';
export type GithubIssueState = 'open' | 'closed';

/** Result returned from a link/create/link-existing call. */
export interface GithubLinkResult {
  issueNumber: number;
  issueUrl: string;
  issueState: GithubIssueState;
}
