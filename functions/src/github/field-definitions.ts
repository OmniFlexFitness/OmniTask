/**
 * Org Issue Type + Issue Field definition cache (spec §6).
 * Fetched after connect and refreshed when org config webhooks fire.
 */
import { githubRequest, GithubApiError } from './app';
import type {
  GithubFieldDefinitionCache,
  GithubIssueFieldDefinition,
  GithubIssueTypeDefinition,
} from './types';

interface RawIssueType {
  id: number;
  node_id: string;
  name: string;
  description?: string | null;
  is_enabled?: boolean;
}

interface RawIssueField {
  id: number;
  node_id: string;
  name: string;
  data_type: string;
  options?: Array<{ id: number; name: string }>;
  issue_type_ids?: number[];
}

/**
 * Fetch and normalize org issue types + fields. Returns empty arrays when the
 * org lacks the feature or the token cannot read it — never throws for 404/403.
 */
export async function fetchFieldDefinitionCache(
  installationToken: string,
  orgLogin: string,
): Promise<GithubFieldDefinitionCache> {
  const [issueTypes, issueFields] = await Promise.all([
    fetchIssueTypes(installationToken, orgLogin),
    fetchIssueFields(installationToken, orgLogin),
  ]);
  return {
    issueTypes,
    issueFields,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchIssueTypes(
  token: string,
  orgLogin: string,
): Promise<GithubIssueTypeDefinition[]> {
  try {
    const res = await githubRequest<RawIssueType[]>(`/orgs/${orgLogin}/issue-types`, { token });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows
      .filter((row) => row.is_enabled !== false)
      .map((row) => ({
        id: row.id,
        nodeId: row.node_id,
        name: row.name,
        description: row.description ?? null,
        isEnabled: row.is_enabled !== false,
      }));
  } catch (err) {
    if (err instanceof GithubApiError && (err.status === 404 || err.status === 403)) {
      return [];
    }
    return [];
  }
}

async function fetchIssueFields(
  token: string,
  orgLogin: string,
): Promise<GithubIssueFieldDefinition[]> {
  try {
    const res = await githubRequest<RawIssueField[]>(`/orgs/${orgLogin}/issue-fields`, {
      token,
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map((row) => ({
      id: row.id,
      nodeId: row.node_id,
      name: row.name,
      dataType: row.data_type,
      pinnedToIssueTypeIds: row.issue_type_ids ?? [],
      options: (row.options ?? []).map((opt) => ({ id: opt.id, name: opt.name })),
    }));
  } catch (err) {
    if (err instanceof GithubApiError && (err.status === 404 || err.status === 403)) {
      return [];
    }
    return [];
  }
}
