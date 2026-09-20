/**
 * Offline Admin Privilege Provisioning Script
 *
 * Sets Firebase Auth custom claims { admin: true, role: 'admin' } for a specified UID or Email.
 * Runs completely offline/locally using the service account credentials.
 * NEVER exposed as an HTTP endpoint or web route.
 *
 * Usage:
 *   node scripts/set_admin_claim.mjs <target_uid_or_email>
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const serviceAccountPath = path.resolve(process.cwd(), 'calendarai-f5cd0-firebase-adminsdk-fbsvc-0ae43407dc.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('Error: Service account file not found at:', serviceAccountPath);
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
const projectId = sa.project_id || 'calendarai-f5cd0';
const clientEmail = sa.client_email;
const privateKey = sa.private_key;

const target = process.argv[2]?.trim();
const targetCollege = process.argv[3]?.trim() || 'SIES_GST';
if (!target) {
  console.error('\nUsage: node scripts/set_admin_claim.mjs <target_uid_or_email> [college]\nExample: node scripts/set_admin_claim.mjs admin@vanko.app SIES_GST\n');
  process.exit(1);
}

function base64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/datastore',
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedClaimSet = base64Url(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  const signature = signer.sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const assertion = `${signatureInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth2 token error: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function resolveUid(target, accessToken) {
  if (!target.includes('@')) {
    return target; // Already a UID
  }

  // Lookup UID by email
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: [target] }),
  });

  if (!res.ok) {
    throw new Error(`Account lookup failed for ${target}: ${await res.text()}`);
  }

  const data = await res.json();
  if (!data.users || data.users.length === 0) {
    throw new Error(`No user account found with email: ${target}`);
  }

  return data.users[0].localId;
}

async function main() {
  console.log('Authenticating with Google OAuth2 using service account...');
  const accessToken = await getAccessToken();

  console.log(`Resolving target account: ${target}...`);
  const uid = await resolveUid(target, accessToken);
  console.log(`Found UID: ${uid}`);

  const claimsPayload = { admin: true, role: 'admin', college: targetCollege };
  const serializedClaims = JSON.stringify(claimsPayload);
  const claimsByteLength = Buffer.byteLength(serializedClaims, 'utf8');

  // Architectural Guard: Firebase Auth enforces a hard 1,000-byte ceiling on custom claims.
  // We keep the payload ultra-compact: { admin, role, college }.
  console.log(`Claims payload: ${serializedClaims} (${claimsByteLength} bytes / 1000-byte Firebase limit)`);
  if (claimsByteLength > 1000) {
    throw new Error(
      `Custom claims payload (${claimsByteLength} bytes) exceeds Firebase 1,000-byte limit! ` +
      `Keep claims minimal: only store trust primitives ({ admin, role, college }). Store large arrays or granular permissions in Firestore.`
    );
  }
  if (claimsByteLength > 750) {
    console.warn(`⚠️ Warning: Custom claims size (${claimsByteLength} bytes) is approaching the 1,000-byte ceiling.`);
  }

  console.log(`Setting Firebase Auth custom claims: ${serializedClaims}...`);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:setCustomUserClaims`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      localId: uid,
      customAttributes: serializedClaims,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to set custom claims: ${err}`);
  }

  console.log(`Updating Firestore document /users/${uid} { role: "admin", college: "${targetCollege}" }...`);
  try {
    const fsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=role&updateMask.fieldPaths=college`;
    const fsRes = await fetch(fsUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          role: { stringValue: 'admin' },
          college: { stringValue: targetCollege },
        },
      }),
    });
    if (fsRes.ok) {
      console.log('✅ Firestore /users/' + uid + ' document successfully updated with role: "admin", college: "' + targetCollege + '"');
    } else {
      console.warn('⚠️ Could not patch Firestore user doc (may not exist yet):', await fsRes.text());
    }
  } catch (e) {
    console.warn('⚠️ Firestore role update warning:', e.message);
  }

  console.log('\n✅ Successfully provisioned admin privileges for user:');
  console.log(`- Target: ${target}`);
  console.log(`- UID: ${uid}`);
  console.log(`- Custom Claims: ${JSON.stringify(claimsPayload)}`);
  console.log(`- College: ${targetCollege}`);
  console.log('\n⚠️ Client Token Refresh Requirement:');
  console.log('Firebase ID tokens cache claims on the client until expiration (1 hour).');
  console.log('For newly granted claims to take effect immediately in the Cloudflare Worker,');
  console.log('the mobile client must force-refresh its token via getIdToken(true) or sign out and sign back in.\n');
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
