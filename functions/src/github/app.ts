/**
 * GitHub App authentication (spec §4).
 *
 * Uses Node 20 built-ins (crypto + global fetch) rather than @octokit/* to keep the
 * Functions bundle lean and the deploy surface small. The spec explicitly allows
 * swapping equivalents — only the data model and flows are fixed.
 *
 * Three token kinds, per the spec:
 *  - App JWT (RS256, short-lived) — to mint installation tokens and read App metadata.
 *  - Installation token — system-attributed sync writes.
 *  - User-to-server token — user-attributed actions (exchanged from the OAuth code,
 *    refreshed from the stored refresh token).
 */
import { createSign } from 'crypto';

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com/login/oauth/access_token';

export interface GithubRequestInit {
  method?: string;
  token: string;
  body?: unknown;
  /** Accept header override (e.g. for preview APIs). */
  accept?: string;
}

export interface GithubResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Mint a short-lived (10 min) App JWT signed RS256 with the App private key.
 * `iat` is backdated 60s to tolerate clock drift, per GitHub guidance.
 */
export function createAppJwt(appId: string, privateKeyPem: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000) - 60;
  const exp = iat + 600;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat, exp, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  // GitHub private keys are PKCS#1 PEM ("BEGIN RSA PRIVATE KEY"); createSign handles both.
  const signature = base64Url(signer.sign(privateKeyPem));
  return `${signingInput}.${signature}`;
}

/** Thin typed wrapper over fetch against the GitHub REST API. */
export async function githubRequest<T>(
  path: string,
  init: GithubRequestInit,
): Promise<GithubResponse<T>> {
  const url = path.startsWith('http') ? path : `${GITHUB_API}${path}`;
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${init.token}`,
      Accept: init.accept ?? 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'omnitask-sync',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  let data: T;
  const text = await res.text();
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = {} as T;
  }

  if (!res.ok) {
    const message =
      (data as { message?: string } | undefined)?.message ?? `GitHub API ${res.status}`;
    throw new GithubApiError(message, res.status, res.headers);
  }
  return { status: res.status, data, headers: res.headers };
}

export class GithubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly headers?: Headers,
  ) {
    super(message);
    this.name = 'GithubApiError';
  }

  /** True when this is a rate-limit rejection we should back off from (spec §10). */
  get isRateLimited(): boolean {
    return this.status === 403 && this.headers?.get('x-ratelimit-remaining') === '0';
  }
}

/** Exchange an installation id for a short-lived installation access token. */
export async function createInstallationToken(
  appJwt: string,
  installationId: number,
): Promise<string> {
  const res = await githubRequest<{ token: string }>(
    `/app/installations/${installationId}/access_tokens`,
    { method: 'POST', token: appJwt },
  );
  return res.data.token;
}

export interface UserTokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
}

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function postOAuth(params: Record<string, string>): Promise<UserTokenResult> {
  const res = await fetch(GITHUB_OAUTH, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as OAuthTokenResponse;
  if (data.error || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'GitHub OAuth exchange failed');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
  };
}

/** Exchange an authorization code for a user-to-server token. */
export function exchangeUserCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<UserTokenResult> {
  return postOAuth({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
}

/** Refresh a user-to-server token from a stored refresh token. */
export function refreshUserToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<UserTokenResult> {
  return postOAuth({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export interface InstallationInfo {
  installationId: number;
  accountLogin: string;
  accountType: 'Organization' | 'User';
}

/**
 * Find the installation accessible to a user token. Phase 1 assumes a single
 * installation per user; if several exist we take the first and let the user
 * re-scope later (multi-connection UI is a later-phase concern).
 */
export async function findUserInstallation(userToken: string): Promise<InstallationInfo | null> {
  const res = await githubRequest<{
    installations: { id: number; account: { login: string; type: string } }[];
  }>(`/user/installations`, { token: userToken });
  const first = res.data.installations?.[0];
  if (!first) return null;
  return {
    installationId: first.id,
    accountLogin: first.account.login,
    accountType: first.account.type === 'Organization' ? 'Organization' : 'User',
  };
}
