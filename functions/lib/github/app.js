"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findUserInstallation = exports.refreshUserToken = exports.exchangeUserCode = exports.createInstallationToken = exports.GithubApiError = exports.githubRequest = exports.createAppJwt = void 0;
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
const crypto_1 = require("crypto");
const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com/login/oauth/access_token';
function base64Url(input) {
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
function createAppJwt(appId, privateKeyPem, now = Date.now()) {
    const iat = Math.floor(now / 1000) - 60;
    const exp = iat + 600;
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64Url(JSON.stringify({ iat, exp, iss: appId }));
    const signingInput = `${header}.${payload}`;
    const signer = (0, crypto_1.createSign)('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    // GitHub private keys are PKCS#1 PEM ("BEGIN RSA PRIVATE KEY"); createSign handles both.
    const signature = base64Url(signer.sign(privateKeyPem));
    return `${signingInput}.${signature}`;
}
exports.createAppJwt = createAppJwt;
/** Thin typed wrapper over fetch against the GitHub REST API. */
async function githubRequest(path, init) {
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
    let data;
    const text = await res.text();
    try {
        data = text ? JSON.parse(text) : {};
    }
    catch {
        data = {};
    }
    if (!res.ok) {
        const message = data?.message ?? `GitHub API ${res.status}`;
        throw new GithubApiError(message, res.status, res.headers);
    }
    return { status: res.status, data, headers: res.headers };
}
exports.githubRequest = githubRequest;
class GithubApiError extends Error {
    constructor(message, status, headers) {
        super(message);
        this.status = status;
        this.headers = headers;
        this.name = 'GithubApiError';
    }
    /** True when this is a rate-limit rejection we should back off from (spec §10). */
    get isRateLimited() {
        return this.status === 403 && this.headers?.get('x-ratelimit-remaining') === '0';
    }
}
exports.GithubApiError = GithubApiError;
/** Exchange an installation id for a short-lived installation access token. */
async function createInstallationToken(appJwt, installationId) {
    const res = await githubRequest(`/app/installations/${installationId}/access_tokens`, { method: 'POST', token: appJwt });
    return res.data.token;
}
exports.createInstallationToken = createInstallationToken;
async function postOAuth(params) {
    const res = await fetch(GITHUB_OAUTH, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    const data = (await res.json());
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
function exchangeUserCode(clientId, clientSecret, code, redirectUri) {
    return postOAuth({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
    });
}
exports.exchangeUserCode = exchangeUserCode;
/** Refresh a user-to-server token from a stored refresh token. */
function refreshUserToken(clientId, clientSecret, refreshToken) {
    return postOAuth({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });
}
exports.refreshUserToken = refreshUserToken;
/**
 * Find the installation accessible to a user token. Phase 1 assumes a single
 * installation per user; if several exist we take the first and let the user
 * re-scope later (multi-connection UI is a later-phase concern).
 */
async function findUserInstallation(userToken) {
    const res = await githubRequest(`/user/installations`, { token: userToken });
    const first = res.data.installations?.[0];
    if (!first)
        return null;
    return {
        installationId: first.id,
        accountLogin: first.account.login,
        accountType: first.account.type === 'Organization' ? 'Organization' : 'User',
    };
}
exports.findUserInstallation = findUserInstallation;
//# sourceMappingURL=app.js.map