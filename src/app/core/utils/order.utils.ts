/**
 * Shared helpers for applying a user's drag-and-drop preferred ordering
 * on top of a computed list of groups. Used by the My Tasks list and the
 * Available Tasks panels — wherever project-grouped "sections" are
 * reorderable and the preference is persisted in localStorage.
 */

/**
 * Reorder `groups` so IDs that appear in `preferred` come first in that
 * relative order, followed by any groups the user hasn't yet positioned,
 * sorted by the `fallback` comparator (default: tasks-count descending).
 */
export function applyPreferredOrder<T extends { projectId: string; tasks: readonly unknown[] }>(
  groups: T[],
  preferred: string[],
  fallback: (a: T, b: T) => number = (a, b) => b.tasks.length - a.tasks.length,
): T[] {
  if (preferred.length === 0) {
    return groups.slice().sort(fallback);
  }
  const byId = new Map(groups.map((g) => [g.projectId, g] as const));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of preferred) {
    const g = byId.get(id);
    if (g) {
      ordered.push(g);
      seen.add(id);
    }
  }
  const leftovers = groups.filter((g) => !seen.has(g.projectId)).sort(fallback);
  return ordered.concat(leftovers);
}

/**
 * Fold the user's new visible-groups order into their stored preference
 * without forgetting IDs that aren't currently on screen (e.g. a project
 * the user filtered out). Visible IDs keep their new positions; absent
 * IDs keep their previous relative order appended at the end.
 */
export function mergeOrders(visible: string[], previous: string[]): string[] {
  const visibleSet = new Set(visible);
  const tail = previous.filter((id) => !visibleSet.has(id));
  return visible.concat(tail);
}
