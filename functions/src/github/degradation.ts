/**
 * Graceful degradation when org-gated GitHub features are unavailable (spec §10).
 * Pure helpers — safe to unit test without network or Firestore.
 */
import type { GithubCapabilities } from './types';

export interface IssueTypeCreatePlan {
  /** Issue Type name for org repos with Issue Types enabled. */
  type: string | null;
  /** Label names to apply when type cannot be set (personal repos). */
  labels: string[];
}

export interface PriorityCreatePlan {
  /** When true, write via Issue Fields value API using cached option ids. */
  useIssueFields: boolean;
  /** Label fallback when Issue Fields are unavailable. */
  priorityLabel: string | null;
}

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'priority: urgent',
  high: 'priority: high',
  medium: 'priority: medium',
  low: 'priority: low',
};

/** Map OmniTask priority to a GitHub label when fields are off. */
export function priorityLabelFor(priority: string): string {
  const key = priority.toLowerCase();
  return PRIORITY_LABEL[key] ?? `priority: ${key}`;
}

/**
 * Decide how to represent issue type on create: native `type` vs label fallback.
 */
export function planIssueTypeCreate(
  accountType: 'Organization' | 'User',
  capabilities: GithubCapabilities,
  requestedType: string | null,
): IssueTypeCreatePlan {
  if (
    accountType === 'Organization' &&
    capabilities.issueTypes &&
    requestedType?.trim()
  ) {
    return { type: requestedType.trim(), labels: [] };
  }
  if (requestedType?.trim()) {
    const slug = requestedType.trim().toLowerCase().replace(/\s+/g, '-');
    return { type: null, labels: [`type: ${slug}`] };
  }
  return { type: null, labels: [] };
}

/**
 * Decide whether Priority/Effort go through Issue Fields or label fallback.
 */
export function planPriorityCreate(
  capabilities: GithubCapabilities,
  priority: string | null,
): PriorityCreatePlan {
  if (capabilities.issueFields) {
    return { useIssueFields: true, priorityLabel: null };
  }
  if (!priority) {
    return { useIssueFields: false, priorityLabel: null };
  }
  return { useIssueFields: false, priorityLabel: priorityLabelFor(priority) };
}

/** Merge label arrays without duplicates. */
export function mergeLabels(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const label of group ?? []) {
      const trimmed = label.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}
