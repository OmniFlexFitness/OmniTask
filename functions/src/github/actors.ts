/**
 * Mirror GitHub issue assignees and participants onto task_github_actors.
 */
import { githubGraphql } from './graphql';
import { replaceTaskActorsForIssue, type GithubActorRole } from './store';

interface IssueActorNode {
  login: string;
  avatarUrl: string | null;
  role: GithubActorRole;
}

export async function fetchIssueActorsFromGraphql(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueActorNode[]> {
  const data = await githubGraphql<{
    repository: {
      issue: {
        assignees: { nodes: Array<{ login: string; avatarUrl: string }> };
        participants: { nodes: Array<{ login: string; avatarUrl: string }> };
      } | null;
    } | null;
  }>(
    token,
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          assignees(first: 20) { nodes { login avatarUrl } }
          participants(first: 30) { nodes { login avatarUrl } }
        }
      }
    }`,
    { owner, repo, number: issueNumber },
  );

  const issue = data.repository?.issue;
  if (!issue) return [];

  const assigneeLogins = new Set(issue.assignees.nodes.map((n) => n.login.toLowerCase()));
  const actors: IssueActorNode[] = [];

  for (const assignee of issue.assignees.nodes) {
    actors.push({ login: assignee.login, avatarUrl: assignee.avatarUrl, role: 'assignee' });
  }
  for (const participant of issue.participants.nodes) {
    if (assigneeLogins.has(participant.login.toLowerCase())) continue;
    actors.push({
      login: participant.login,
      avatarUrl: participant.avatarUrl,
      role: 'participant',
    });
  }
  return actors;
}

export async function mirrorIssueActorsToTask(
  token: string,
  taskId: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<void> {
  const actors = await fetchIssueActorsFromGraphql(token, owner, repo, issueNumber);
  await replaceTaskActorsForIssue(taskId, actors);
}
