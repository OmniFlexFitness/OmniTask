"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchFieldDefinitionCache = void 0;
/**
 * Org Issue Type + Issue Field definition cache (spec §6).
 * Fetched after connect and refreshed when org config webhooks fire.
 */
const app_1 = require("./app");
/**
 * Fetch and normalize org issue types + fields. Returns empty arrays when the
 * org lacks the feature or the token cannot read it — never throws for 404/403.
 */
async function fetchFieldDefinitionCache(installationToken, orgLogin) {
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
exports.fetchFieldDefinitionCache = fetchFieldDefinitionCache;
async function fetchIssueTypes(token, orgLogin) {
    try {
        const res = await (0, app_1.githubRequest)(`/orgs/${orgLogin}/issue-types`, { token });
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
    }
    catch (err) {
        if (err instanceof app_1.GithubApiError && (err.status === 404 || err.status === 403)) {
            return [];
        }
        return [];
    }
}
async function fetchIssueFields(token, orgLogin) {
    try {
        const res = await (0, app_1.githubRequest)(`/orgs/${orgLogin}/issue-fields`, {
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
    }
    catch (err) {
        if (err instanceof app_1.GithubApiError && (err.status === 404 || err.status === 403)) {
            return [];
        }
        return [];
    }
}
//# sourceMappingURL=field-definitions.js.map