/**
 * Capability detection (spec §6). Phase 1 probes and caches; the linking UI
 * reads only from the cached result so it renders instantly and never offers
 * controls the target org/repo can't honor.
 */
import { githubRequest, GithubApiError } from './app';
import type { GithubCapabilities } from './types';

/**
 * Probe org-gated features for a connection. All probes are best-effort: a 404
 * (personal account / feature off) resolves to `false` rather than throwing, so a
 * partial outage never blocks connecting.
 */
export async function detectCapabilities(
  installationToken: string,
  accountLogin: string,
  accountType: 'Organization' | 'User',
): Promise<GithubCapabilities> {
  if (accountType !== 'Organization') {
    // Issue Types and Issue Fields are organization-only (spec §3).
    return { issueTypes: false, issueFields: false, projects: await probeProjects(installationToken, accountLogin) };
  }

  const [issueTypes, issueFields, projects] = await Promise.all([
    probe(() => githubRequest(`/orgs/${accountLogin}/issue-types`, { token: installationToken })),
    probe(() => githubRequest(`/orgs/${accountLogin}/issue-fields`, { token: installationToken })),
    probeProjects(installationToken, accountLogin),
  ]);

  return { issueTypes, issueFields, projects };
}

async function probe(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    if (err instanceof GithubApiError && (err.status === 404 || err.status === 403)) return false;
    // Unknown failures are treated as "unsupported" rather than fatal — capabilities
    // are refreshed daily, so a transient error self-heals.
    return false;
  }
}

function probeProjects(token: string, login: string): Promise<boolean> {
  return probe(() =>
    githubRequest(`/orgs/${login}/projectsV2?per_page=1`, {
      token,
      accept: 'application/vnd.github+json',
    }),
  );
}
