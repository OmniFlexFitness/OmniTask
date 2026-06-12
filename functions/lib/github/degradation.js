"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeLabels = exports.planPriorityCreate = exports.planIssueTypeCreate = exports.priorityLabelFor = void 0;
const PRIORITY_LABEL = {
    urgent: 'priority: urgent',
    high: 'priority: high',
    medium: 'priority: medium',
    low: 'priority: low',
};
/** Map OmniTask priority to a GitHub label when fields are off. */
function priorityLabelFor(priority) {
    const key = priority.toLowerCase();
    return PRIORITY_LABEL[key] ?? `priority: ${key}`;
}
exports.priorityLabelFor = priorityLabelFor;
/**
 * Decide how to represent issue type on create: native `type` vs label fallback.
 */
function planIssueTypeCreate(accountType, capabilities, requestedType) {
    if (accountType === 'Organization' &&
        capabilities.issueTypes &&
        requestedType?.trim()) {
        return { type: requestedType.trim(), labels: [] };
    }
    if (requestedType?.trim()) {
        const slug = requestedType.trim().toLowerCase().replace(/\s+/g, '-');
        return { type: null, labels: [`type: ${slug}`] };
    }
    return { type: null, labels: [] };
}
exports.planIssueTypeCreate = planIssueTypeCreate;
/**
 * Decide whether Priority/Effort go through Issue Fields or label fallback.
 */
function planPriorityCreate(capabilities, priority) {
    if (capabilities.issueFields) {
        return { useIssueFields: true, priorityLabel: null };
    }
    if (!priority) {
        return { useIssueFields: false, priorityLabel: null };
    }
    return { useIssueFields: false, priorityLabel: priorityLabelFor(priority) };
}
exports.planPriorityCreate = planPriorityCreate;
/** Merge label arrays without duplicates. */
function mergeLabels(...groups) {
    const seen = new Set();
    const out = [];
    for (const group of groups) {
        for (const label of group ?? []) {
            const trimmed = label.trim();
            if (!trimmed || seen.has(trimmed))
                continue;
            seen.add(trimmed);
            out.push(trimmed);
        }
    }
    return out;
}
exports.mergeLabels = mergeLabels;
//# sourceMappingURL=degradation.js.map