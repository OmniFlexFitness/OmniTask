"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionError = void 0;
exports.getInstallationTokenForUser = getInstallationTokenForUser;
/**
 * Resolves a usable GitHub installation token for a connected user, refreshing
 * the user-to-server token from the stored refresh token as needed and marking
 * the connection `needs_reauth` when the token is revoked (spec §10).
 */
const app_1 = require("./app");
const store_1 = require("./store");
class ConnectionError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
/**
 * Returns a short-lived installation token for the user's connection.
 * Installation tokens authorize system-attributed sync writes (spec §4.1).
 */
async function getInstallationTokenForUser(uid, creds) {
    const connection = await (0, store_1.getConnection)(uid);
    if (!connection)
        throw new ConnectionError('No GitHub connection', 'NOT_CONNECTED');
    // Validate the user token is still good by refreshing it; revocation surfaces here.
    const refreshToken = await (0, store_1.getUserRefreshToken)(uid);
    if (!refreshToken)
        throw new ConnectionError('No stored token', 'NEEDS_REAUTH');
    try {
        const refreshed = await (0, app_1.refreshUserToken)(creds.clientId, creds.clientSecret, refreshToken);
        if (refreshed.refreshToken) {
            await (0, store_1.storeUserToken)(uid, refreshed.refreshToken, connection.installationId);
        }
    }
    catch {
        await (0, store_1.setConnectionState)(uid, 'needs_reauth');
        throw new ConnectionError('GitHub token revoked', 'NEEDS_REAUTH');
    }
    try {
        const appJwt = (0, app_1.createAppJwt)(creds.appId, creds.privateKey);
        const token = await (0, app_1.createInstallationToken)(appJwt, connection.installationId);
        return { token, owner: connection.accountLogin };
    }
    catch (err) {
        if (err instanceof app_1.GithubApiError && (err.status === 401 || err.status === 404)) {
            await (0, store_1.setConnectionState)(uid, 'needs_reauth');
            throw new ConnectionError('Installation unavailable', 'NEEDS_REAUTH');
        }
        throw err;
    }
}
//# sourceMappingURL=auth-helper.js.map