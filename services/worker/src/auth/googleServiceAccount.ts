import { importPKCS8, SignJWT } from 'jose';
import { Env } from '../index';

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Mint a Google Cloud OAuth2 Access Token using Firebase Service Account credentials.
 * Works natively in Cloudflare Workers using WebCrypto (jose) without Node.js APIs.
 * Scoped to https://www.googleapis.com/auth/datastore for Firestore REST API access.
 */
export async function getGoogleFirestoreAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if valid for at least 5 more minutes (per-isolate caching)
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 300) {
    return cachedAccessToken.token;
  }

  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error('MISSING_FIREBASE_SERVICE_ACCOUNT_SECRETS: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be configured.');
  }

  // Format private key handling escaped newlines (\n) commonly found in env secrets
  const formattedKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const privateKey = await importPKCS8(formattedKey, 'RS256');

  // Sign OAuth2 JWT bearer assertion
  const jwt = await new SignJWT({
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/devstorage.read_write',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth2 token exchange failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };

  return data.access_token;
}
