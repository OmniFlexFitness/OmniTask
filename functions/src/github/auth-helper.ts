/**
 * Resolves a usable GitHub installation token for a connected user, refreshing
 * the user-to-server token from the stored refresh token as needed and marking
 * the connection `needs_reauth` when the token is revoked (spec §10).
 */
import { createAppJwt, createInstallationToken, refreshUserToken, GithubApiError } from './app';
import { getConnection, getUserRefreshToken, storeUserToken, setConnectionState } from './store';

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

  // Validate the user token is still good by refreshing it; revocation surfaces here.
  const refreshToken = await getUserRefreshToken(uid);
  if (!refreshToken) throw new ConnectionError('No stored token', 'NEEDS_REAUTH');

  try {
    const refreshed = await refreshUserToken(creds.clientId, creds.clientSecret, refreshToken);
    if (refreshed.refreshToken) {
      await storeUserToken(uid, refreshed.refreshToken, connection.installationId);
    }
  } catch {
    await setConnectionState(uid, 'needs_reauth');
    throw new ConnectionError('GitHub token revoked', 'NEEDS_REAUTH');
  }

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
