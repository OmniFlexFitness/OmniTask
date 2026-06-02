"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectCapabilities = detectCapabilities;
/**
 * Capability detection (spec §6). Phase 1 probes and caches; the linking UI
 * reads only from the cached result so it renders instantly and never offers
 * controls the target org/repo can't honor.
 */
const app_1 = require("./app");
/**
 * Probe org-gated features for a connection. All probes are best-effort: a 404
 * (personal account / feature off) resolves to `false` rather than throwing, so a
 * partial outage never blocks connecting.
 */
async function detectCapabilities(installationToken, accountLogin, accountType) {
    if (accountType !== 'Organization') {
        // Issue Types and Issue Fields are organization-only (spec §3).
        return { issueTypes: false, issueFields: false, projects: await probeProjects(installationToken, accountLogin) };
    }
    const [issueTypes, projects] = await Promise.all([
        probe(() => (0, app_1.githubRequest)(`/orgs/${accountLogin}/issue-types`, { token: installationToken })),
        probeProjects(installationToken, accountLogin),
    ]);
    // Issue Fields shares org-settings access with Issue Types in Phase 1's coarse probe;
    // the fine-grained field-definition cache lands in Phase 2.
    return { issueTypes, issueFields: issueTypes, projects };
}
async function probe(fn) {
    try {
        await fn();
        return true;
    }
    catch (err) {
        if (err instanceof app_1.GithubApiError && (err.status === 404 || err.status === 403))
            return false;
        // Unknown failures are treated as "unsupported" rather than fatal — capabilities
        // are refreshed daily, so a transient error self-heals.
        return false;
    }
}
function probeProjects(token, login) {
    return probe(() => (0, app_1.githubRequest)(`/orgs/${login}/projectsV2?per_page=1`, {
        token,
        accept: 'application/vnd.github+json',
    }));
}
//# sourceMappingURL=capabilities.js.map