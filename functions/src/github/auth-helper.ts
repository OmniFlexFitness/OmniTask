/**
 * Resolves a GitHub installation token for a connected user and marks the
 * connection `needs_reauth` when the App access is no longer valid (spec §10).
 */
import { createAppJwt, createInstallationToken, GithubApiError } from './app';
import { getConnection, setConnectionState } from './store';

export interface AppCredentials {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
}

export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_CONNECTED' | 'NEEDS_REAUTH',
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

/**
 * Returns a short-lived installation token for the user's connection.
 * Installation tokens authorize system-attributed sync writes (spec §4.1).
 */
export async function getInstallationTokenForUser(
  uid: string,
  creds: AppCredentials,
): Promise<{ token: string; owner: string }> {
  const connection = await getConnection(uid);
  if (!connection) throw new ConnectionError('No GitHub connection', 'NOT_CONNECTED');

  // Phase 1 sync writes use an *installation* token minted from the App JWT +
  // installationId — the user-to-server token is not needed here. We deliberately
  // do NOT refresh the stored user token on this hot path: GitHub rotates
  // refresh tokens single-use, so refreshing on every sync would race concurrent
  // syncs and self-revoke. A revoked App / removed installation surfaces below as
  // a 401/404 on installation-token creation.
  try {
    const appJwt = createAppJwt(creds.appId, creds.privateKey);
    const token = await createInstallationToken(appJwt, connection.installationId);
    return { token, owner: connection.accountLogin };
  } catch (err) {
    if (err instanceof GithubApiError && (err.status === 401 || err.status === 404)) {
      await setConnectionState(uid, 'needs_reauth');
      throw new ConnectionError('Installation unavailable', 'NEEDS_REAUTH');
    }
    throw err;
  }
}
