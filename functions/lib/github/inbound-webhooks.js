"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRefreshFieldCache = shouldRefreshFieldCache;
exports.isExtendedIssuesAction = isExtendedIssuesAction;
exports.extractAssigneeLogin = extractAssigneeLogin;
exports.extractMilestoneTitle = extractMilestoneTitle;
exports.isRelationshipWebhook = isRelationshipWebhook;
exports.isRelationshipAddAction = isRelationshipAddAction;
exports.extractRelationshipFromPayload = extractRelationshipFromPayload;
exports.relationshipDocId = relationshipDocId;
/** Webhook events that should trigger a field-definition cache refresh. */
const CACHE_REFRESH_EVENTS = new Set([
    'issue_field',
    'issue_field_option',
    'issue_type',
    'organization',
]);
/** Issue actions handled beyond Phase 1 open/closed sync. */
const EXTENDED_ISSUE_ACTIONS = new Set([
    'typed',
    'untyped',
    'assigned',
    'unassigned',
    'milestoned',
    'demilestoned',
    'edited',
]);
function shouldRefreshFieldCache(eventType) {
    return CACHE_REFRESH_EVENTS.has(eventType);
}
function isExtendedIssuesAction(action) {
    return EXTENDED_ISSUE_ACTIONS.has(action);
}
function extractAssigneeLogin(payload) {
    if (payload.action === 'unassigned')
        return null;
    return payload.assignee?.login ?? null;
}
function extractMilestoneTitle(payload) {
    if (payload.action === 'demilestoned')
        return null;
    return payload.milestone?.title ?? null;
}
/** Sub-issue and dependency events share the issues envelope in many cases. */
function isRelationshipWebhook(eventType, action) {
    if (eventType === 'sub_issues')
        return true;
    if (eventType === 'issue_dependencies')
        return true;
    return eventType === 'issues' && (action === 'parent_issue_added' || action === 'parent_issue_removed');
}
/** Whether this relationship event adds (vs removes) a link. */
function isRelationshipAddAction(eventType, action) {
    if (eventType === 'sub_issues')
        return action === 'added';
    if (eventType === 'issue_dependencies')
        return action === 'added' || action === 'blocked_by_added';
    return action === 'parent_issue_added';
}
function extractRelationshipFromPayload(eventType, payload) {
    const owner = payload.repository?.owner.login ?? payload.issue?.repository?.owner?.login;
    const repo = payload.repository?.name ?? payload.issue?.repository?.name;
    if (!owner || !repo)
        return null;
    if (eventType === 'sub_issues' && payload.sub_issue) {
        return {
            kind: 'sub_issue',
            relatedIssueNumber: payload.sub_issue.number,
            relatedIssueNodeId: payload.sub_issue.node_id ?? null,
            relatedRepoOwner: owner,
            relatedRepoName: repo,
        };
    }
    if (eventType === 'issue_dependencies' && payload.dependency) {
        return {
            kind: 'blocked_by',
            relatedIssueNumber: payload.dependency.number,
            relatedIssueNodeId: payload.dependency.node_id ?? null,
            relatedRepoOwner: owner,
            relatedRepoName: repo,
        };
    }
    if (payload.action === 'parent_issue_added' && payload.issue) {
        return {
            kind: 'sub_issue',
            relatedIssueNumber: payload.issue.number,
            relatedIssueNodeId: payload.issue.node_id ?? null,
            relatedRepoOwner: owner,
            relatedRepoName: repo,
        };
    }
    return null;
}
function relationshipDocId(taskId, kind, owner, repo, issueNumber) {
    return `${taskId}__${kind}__${owner}__${repo}__${issueNumber}`;
}
//# sourceMappingURL=inbound-webhooks.js.map