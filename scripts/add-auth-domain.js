#!/usr/bin/env node
/**
 * Script to add a domain to Firebase Auth authorized domains.
 * Used in CI to allow preview channel deployments to authenticate.
 *
 * Usage: node scripts/add-auth-domain.js <domain>
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS environment variable set to
 * the path of a service account JSON key file.
 */

const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const PROJECT_ID = 'omnitask-475422';
const API_BASE = 'identitytoolkit.googleapis.com';
const CONFIG_PATH = `/admin/v2/projects/${PROJECT_ID}/config`;

/**
 * Create a JWT signed with the service account private key
 */
function createJWT(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: serviceAccount.private_key_id,
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signatureInput = `${base64Header}.${base64Payload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');

  return `${signatureInput}.${signature}`;
}

/**
 * Exchange JWT for access token
 */
function getAccessToken(serviceAccount) {
  return new Promise((resolve, reject) => {
    const jwt = createJWT(serviceAccount);
    const postData = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString();

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(data);
          resolve(response.access_token);
        } else {
          reject(new Error(`Token exchange failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function makeRequest(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      path: path,
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`API Error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function getCurrentConfig(token) {
  console.log('Fetching current Firebase Auth config...');
  return makeRequest('GET', CONFIG_PATH, token);
}

async function addAuthorizedDomain(token, domain, currentDomains) {
  // Check if domain already exists
  if (currentDomains.includes(domain)) {
    console.log(`Domain ${domain} is already authorized.`);
    return;
  }

  const updatedDomains = [...currentDomains, domain];

  console.log(`Adding domain: ${domain}`);
  const result = await makeRequest('PATCH', `${CONFIG_PATH}?updateMask=authorizedDomains`, token, {
    authorizedDomains: updatedDomains,
  });

  console.log('Successfully added authorized domain!');
  return result;
}

async function main() {
  const domain = process.argv[2];

  if (!domain) {
    console.error('Usage: node add-auth-domain.js <domain>');
    console.error('Example: node add-auth-domain.js omnitask-475422--pr-68-xyz.web.app');
    process.exit(1);
  }

  // Load service account credentials
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    console.error('Error: GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
    process.exit(1);
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    console.log(`Using service account: ${serviceAccount.client_email}`);

    const token = await getAccessToken(serviceAccount);
    const config = await getCurrentConfig(token);
    const currentDomains = config.authorizedDomains || [];

    console.log('Current authorized domains:', currentDomains);

    await addAuthorizedDomain(token, domain, currentDomains);

    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
