"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionError = void 0;
exports.getInstallationTokenForUser = getInstallationTokenForUser;
/**
 * Resolves a GitHub installation token for a connected user and marks the
 * connection `needs_reauth` when the App access is no longer valid (spec §10).
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
    // Phase 1 sync writes use an *installation* token minted from the App JWT +
    // installationId — the user-to-server token is not needed here. We deliberately
    // do NOT refresh the stored user token on this hot path: GitHub rotates
    // refresh tokens single-use, so refreshing on every sync would race concurrent
    // syncs and self-revoke. A revoked App / removed installation surfaces below as
    // a 401/404 on installation-token creation.
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