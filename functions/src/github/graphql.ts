/**
 * GitHub GraphQL helpers (Phase 3 scaffold — Projects v2, linked branches).
 * Uses the same installation token as REST; no @octokit/graphql dependency.
 */
import { githubRequest } from './app';

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function githubGraphql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await githubRequest<GraphqlResponse<T>>('/graphql', {
    method: 'POST',
    token,
    body: { query, variables },
  });
  if (res.data.errors?.length) {
    throw new Error(res.data.errors.map((e) => e.message).join('; '));
  }
  if (!res.data.data) {
    throw new Error('GraphQL response missing data');
  }
  return res.data.data;
}

/** Add an issue to an org Project v2 board (Phase 3). */
export async function addIssueToProjectV2(
  token: string,
  projectNodeId: string,
  contentNodeId: string,
): Promise<string | null> {
  const data = await githubGraphql<{
    addProjectV2ItemById: { item: { id: string } | null };
  }>(
    token,
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`,
    { projectId: projectNodeId, contentId: contentNodeId },
  );
  return data.addProjectV2ItemById.item?.id ?? null;
}

/** Create a linked branch for an issue (Phase 3 — requires Contents RW). */
export async function createLinkedBranch(
  token: string,
  issueNodeId: string,
  branchName: string,
): Promise<string | null> {
  const data = await githubGraphql<{
    createLinkedBranch: { linkedBranch: { ref: { name: string } } | null };
  }>(
    token,
    `mutation($issueId: ID!, $name: String!) {
      createLinkedBranch(input: { issueId: $issueId, name: $name }) {
        linkedBranch { ref { name } }
      }
    }`,
    { issueId: issueNodeId, name: branchName },
  );
  return data.createLinkedBranch.linkedBranch?.ref.name ?? null;
}

/** Safe branch name for GitHub linked-branch mutation. */
export function suggestLinkedBranchName(taskId: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const shortId = taskId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return slug ? `omnitask/${shortId}-${slug}` : `omnitask/${shortId || 'task'}`;
}
