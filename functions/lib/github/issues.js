"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIssue = createIssue;
exports.getIssue = getIssue;
exports.setIssueState = setIssueState;
exports.parseIssueRef = parseIssueRef;
/**
 * Issue REST operations (spec §8.1, §8.7, §15). Phase 1: create, patch state,
 * patch title/body, and read a single issue.
 */
const app_1 = require("./app");
const sync_logic_1 = require("./sync-logic");
function composeBody(input) {
    const parts = [input.body?.trim() || ''];
    if (input.backlinkUrl)
        parts.push(`\n\n---\nTracked in OmniTask: ${input.backlinkUrl}`);
    parts.push(`\n\n${(0, sync_logic_1.omnitaskMarker)(input.taskId)}`);
    return parts.join('').trim();
}
async function createIssue(token, input) {
    const body = {
        title: input.title,
        body: composeBody(input),
    };
    if (input.milestone != null)
        body.milestone = input.milestone;
    if (input.assignees?.length)
        body.assignees = input.assignees;
    if (input.type)
        body.type = input.type;
    const res = await (0, app_1.githubRequest)(`/repos/${input.owner}/${input.repo}/issues`, { method: 'POST', token, body });
    return res.data;
}
async function getIssue(token, owner, repo, issueNumber) {
    const res = await (0, app_1.githubRequest)(`/repos/${owner}/${repo}/issues/${issueNumber}`, { token });
    return res.data;
}
/** PATCH only the issue state (close/reopen) — the Phase 1 outbound diff. */
async function setIssueState(token, owner, repo, issueNumber, state) {
    const res = await (0, app_1.githubRequest)(`/repos/${owner}/${repo}/issues/${issueNumber}`, { method: 'PATCH', token, body: { state } });
    return res.data;
}
/** Parse an issue reference from a full URL or `owner/repo#number` shorthand. */
function parseIssueRef(input) {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
    if (urlMatch) {
        return { owner: urlMatch[1], repo: urlMatch[2], number: Number(urlMatch[3]) };
    }
    const shortMatch = trimmed.match(/^([^/\s]+)\/([^/#\s]+)#(\d+)$/);
    if (shortMatch) {
        return { owner: shortMatch[1], repo: shortMatch[2], number: Number(shortMatch[3]) };
    }
    return null;
}
//# sourceMappingURL=issues.js.map