"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchIssueActorsFromGraphql = fetchIssueActorsFromGraphql;
exports.mirrorIssueActorsToTask = mirrorIssueActorsToTask;
/**
 * Mirror GitHub issue assignees and participants onto task_github_actors.
 */
const graphql_1 = require("./graphql");
const store_1 = require("./store");
async function fetchIssueActorsFromGraphql(token, owner, repo, issueNumber) {
    const data = await (0, graphql_1.githubGraphql)(token, `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          assignees(first: 20) { nodes { login avatarUrl } }
          participants(first: 30) { nodes { login avatarUrl } }
        }
      }
    }`, { owner, repo, number: issueNumber });
    const issue = data.repository?.issue;
    if (!issue)
        return [];
    const assigneeLogins = new Set(issue.assignees.nodes.map((n) => n.login.toLowerCase()));
    const actors = [];
    for (const assignee of issue.assignees.nodes) {
        actors.push({ login: assignee.login, avatarUrl: assignee.avatarUrl, role: 'assignee' });
    }
    for (const participant of issue.participants.nodes) {
        if (assigneeLogins.has(participant.login.toLowerCase()))
            continue;
        actors.push({
            login: participant.login,
            avatarUrl: participant.avatarUrl,
            role: 'participant',
        });
    }
    return actors;
}
async function mirrorIssueActorsToTask(token, taskId, owner, repo, issueNumber) {
    const actors = await fetchIssueActorsFromGraphql(token, owner, repo, issueNumber);
    await (0, store_1.replaceTaskActorsForIssue)(taskId, actors);
}
//# sourceMappingURL=actors.js.map