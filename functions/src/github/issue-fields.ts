/**
 * Org Issue Field writes after issue create (Phase 2, spec §8).
 * Best-effort — label fallbacks from degradation.ts already applied on failure.
 */
import { githubRequest, GithubApiError } from './app';
import type { GithubFieldDefinitionCache } from './types';

/** Find a single-select field by name (case-insensitive). */
export function findFieldByName(
  cache: GithubFieldDefinitionCache,
  name: string,
): GithubFieldDefinitionCache['issueFields'][number] | null {
  const needle = name.trim().toLowerCase();
  return cache.issueFields.find((f) => f.name.trim().toLowerCase() === needle) ?? null;
}

/** Map OmniTask priority to a field option id when names align. */
export function priorityOptionId(
  field: GithubFieldDefinitionCache['issueFields'][number],
  priority: string,
): number | null {
  const needle = priority.trim().toLowerCase();
  const match = field.options.find((o) => o.name.trim().toLowerCase() === needle);
  return match?.id ?? null;
}

/**
 * Set Priority on an issue via org Issue Fields API when capabilities allow.
 * Silently no-ops when the field or option is missing.
 */
export async function applyPriorityFieldValue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  cache: GithubFieldDefinitionCache,
  priority: string,
): Promise<void> {
  const field = findFieldByName(cache, 'Priority') ?? findFieldByName(cache, 'priority');
  if (!field) return;

  const optionId = priorityOptionId(field, priority);
  if (field.dataType === 'single_select' && optionId == null) return;

  const body =
    field.dataType === 'single_select' && optionId != null
      ? { value: { single_select_option_id: optionId } }
      : { value: { text: priority } };

  try {
    await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/fields/${field.id}`, {
      method: 'PUT',
      token,
      body,
    });
  } catch (err) {
    if (err instanceof GithubApiError && (err.status === 404 || err.status === 403 || err.status === 422)) {
      return;
    }
    throw err;
  }
}
