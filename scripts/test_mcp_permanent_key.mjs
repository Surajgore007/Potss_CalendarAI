import assert from 'node:assert/strict';

function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

function base64UrlToBytes(str) {
  const binary = base64UrlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function signPermanentMcpKey(uid, email, secret) {
  const enc = new TextEncoder();
  const payload = JSON.stringify({ uid, email: email || '', iat: Date.now(), v: 1 });
  const payloadB64 = base64UrlEncode(payload);

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sigB64 = bytesToBase64Url(new Uint8Array(signature));

  return `vnk_live_${payloadB64}.${sigB64}`;
}

export async function verifyPermanentMcpKey(token, secret) {
  if (!token || typeof token !== 'string' || !token.startsWith('vnk_live_')) return null;
  const parts = token.substring('vnk_live_'.length).split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = base64UrlToBytes(sigB64);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payloadB64));
  if (!valid) return null;

  try {
    const payloadStr = base64UrlDecode(payloadB64);
    const data = JSON.parse(payloadStr);
    return data && data.uid ? { uid: data.uid, email: data.email } : null;
  } catch {
    return null;
  }
}

// Test
const secret = 'test-secret-cloud-flare';
const token = await signPermanentMcpKey('user_abc', 'suraj@sies.edu.in', secret);
console.log('Worker token:', token);
assert(token.startsWith('vnk_live_'));

const verified = await verifyPermanentMcpKey(token, secret);
console.log('Worker verified:', verified);
assert.equal(verified?.uid, 'user_abc');
assert.equal(verified?.email, 'suraj@sies.edu.in');
console.log('✔ Pure WebCrypto passed!');
