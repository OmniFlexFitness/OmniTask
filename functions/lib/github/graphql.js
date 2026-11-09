"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.githubGraphql = githubGraphql;
exports.addIssueToProjectV2 = addIssueToProjectV2;
exports.createLinkedBranch = createLinkedBranch;
exports.suggestLinkedBranchName = suggestLinkedBranchName;
/**
 * GitHub GraphQL helpers (Phase 3 scaffold — Projects v2, linked branches).
 * Uses the same installation token as REST; no @octokit/graphql dependency.
 */
const app_1 = require("./app");
async function githubGraphql(token, query, variables) {
    const res = await (0, app_1.githubRequest)('/graphql', {
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
async function addIssueToProjectV2(token, projectNodeId, contentNodeId) {
    const data = await githubGraphql(token, `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`, { projectId: projectNodeId, contentId: contentNodeId });
    return data.addProjectV2ItemById.item?.id ?? null;
}
/** Create a linked branch for an issue (Phase 3 — requires Contents RW). */
async function createLinkedBranch(token, issueNodeId, branchName) {
    const data = await githubGraphql(token, `mutation($issueId: ID!, $name: String!) {
      createLinkedBranch(input: { issueId: $issueId, name: $name }) {
        linkedBranch { ref { name } }
      }
    }`, { issueId: issueNodeId, name: branchName });
    return data.createLinkedBranch.linkedBranch?.ref.name ?? null;
}
/** Safe branch name for GitHub linked-branch mutation. */
function suggestLinkedBranchName(taskId, title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    const shortId = taskId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return slug ? `omnitask/${shortId}-${slug}` : `omnitask/${shortId || 'task'}`;
}
//# sourceMappingURL=graphql.js.map