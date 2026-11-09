"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPriorityFieldValue = exports.priorityOptionId = exports.findFieldByName = void 0;
/**
 * Org Issue Field writes after issue create (Phase 2, spec §8).
 * Best-effort — label fallbacks from degradation.ts already applied on failure.
 */
const app_1 = require("./app");
/** Find a single-select field by name (case-insensitive). */
function findFieldByName(cache, name) {
    const needle = name.trim().toLowerCase();
    return cache.issueFields.find((f) => f.name.trim().toLowerCase() === needle) ?? null;
}
exports.findFieldByName = findFieldByName;
/** Map OmniTask priority to a field option id when names align. */
function priorityOptionId(field, priority) {
    const needle = priority.trim().toLowerCase();
    const match = field.options.find((o) => o.name.trim().toLowerCase() === needle);
    return match?.id ?? null;
}
exports.priorityOptionId = priorityOptionId;
/**
 * Set Priority on an issue via org Issue Fields API when capabilities allow.
 * Silently no-ops when the field or option is missing.
 */
async function applyPriorityFieldValue(token, owner, repo, issueNumber, cache, priority) {
    const field = findFieldByName(cache, 'Priority') ?? findFieldByName(cache, 'priority');
    if (!field)
        return;
    const optionId = priorityOptionId(field, priority);
    if (field.dataType === 'single_select' && optionId == null)
        return;
    const body = field.dataType === 'single_select' && optionId != null
        ? { value: { single_select_option_id: optionId } }
        : { value: { text: priority } };
    try {
        await (0, app_1.githubRequest)(`/repos/${owner}/${repo}/issues/${issueNumber}/fields/${field.id}`, {
            method: 'PUT',
            token,
            body,
        });
    }
    catch (err) {
        if (err instanceof app_1.GithubApiError && (err.status === 404 || err.status === 403 || err.status === 422)) {
            return;
        }
        throw err;
    }
}
exports.applyPriorityFieldValue = applyPriorityFieldValue;
//# sourceMappingURL=issue-fields.js.map