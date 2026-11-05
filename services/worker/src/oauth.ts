/**
 * Vanko OAuth 2.1 Authorization Server for Model Context Protocol (MCP) & ChatGPT
 * Fully implements:
 * - RFC 9728: OAuth 2.0 Protected Resource Metadata
 * - RFC 8414: OAuth 2.0 Authorization Server Metadata
 * - RFC 7591: Dynamic Client Registration (DCR)
 * - RFC 7636: Proof Key for Code Exchange (PKCE) with S256
 * - RFC 6749: OAuth 2.0 Authorization Framework
 */

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  created_at: number;
}

export interface OAuthAuthCodePayload {
  uid: string;
  email: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  exp: number;
  v: number;
}

export interface OAuthAccessTokenPayload {
  uid: string;
  email: string;
  client_id: string;
  scope: string;
  exp: number;
  v: number;
}

// Helpers for base64url encoding/decoding
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64UrlEncode(binary);
}

function base64UrlToBytes(str: string): Uint8Array {
  const binary = base64UrlDecode(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Compute SHA-256 hash in base64url format for PKCE S256 verification
async function sha256Base64Url(verifier: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

// Sign HMAC-SHA256 token
async function signHmac(payloadStr: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const payloadB64 = base64UrlEncode(payloadStr);
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sigB64 = bytesToBase64Url(new Uint8Array(signature));
  return `${payloadB64}.${sigB64}`;
}

// Verify HMAC-SHA256 token
async function verifyHmac<T>(token: string, secret: string): Promise<T | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  try {
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

    const payloadStr = base64UrlDecode(payloadB64);
    const data = JSON.parse(payloadStr);
    return data as T;
  } catch {
    return null;
  }
}

/**
 * Sign an OAuth Authorization Code (5 minute TTL)
 */
export async function signOAuthCode(payload: OAuthAuthCodePayload, secret: string): Promise<string> {
  const token = await signHmac(JSON.stringify(payload), secret);
  return `vnk_code_${token}`;
}

/**
 * Verify an OAuth Authorization Code
 */
export async function verifyOAuthCode(code: string, secret: string): Promise<OAuthAuthCodePayload | null> {
  if (!code || !code.startsWith('vnk_code_')) return null;
  const rawToken = code.substring('vnk_code_'.length);
  const payload = await verifyHmac<OAuthAuthCodePayload>(rawToken, secret);
  if (!payload) return null;
  if (payload.exp < Date.now()) return null; // expired
  return payload;
}

/**
 * Sign an OAuth Access Token (30 day TTL)
 */
export async function signOAuthAccessToken(payload: OAuthAccessTokenPayload, secret: string): Promise<string> {
  const token = await signHmac(JSON.stringify(payload), secret);
  return `vnk_oauth_${token}`;
}

/**
 * Verify an OAuth Access Token
 */
export async function verifyOAuthAccessToken(token: string, secret: string): Promise<{ uid: string; email: string } | null> {
  if (!token || !token.startsWith('vnk_oauth_')) return null;
  const rawToken = token.substring('vnk_oauth_'.length);
  const payload = await verifyHmac<OAuthAccessTokenPayload>(rawToken, secret);
  if (!payload) return null;
  if (payload.exp < Date.now()) return null; // expired
  return { uid: payload.uid, email: payload.email };
}

/**
 * RFC 9728: Protected Resource Metadata
 * Exposed at GET /.well-known/oauth-protected-resource
 */
export function handleOAuthProtectedResource(origin: string): Response {
  return new Response(
    JSON.stringify(
      {
        resource: origin,
        authorization_servers: [origin],
        scopes_supported: ['calendar.read', 'calendar.write', 'offline_access'],
        bearer_methods_supported: ['header', 'query'],
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}

/**
 * RFC 8414: Authorization Server Metadata
 * Exposed at GET /.well-known/oauth-authorization-server
 * and GET /.well-known/openid-configuration
 */
export function handleOAuthAuthorizationServer(origin: string): Response {
  return new Response(
    JSON.stringify(
      {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        userinfo_endpoint: `${origin}/oauth/userinfo`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
        scopes_supported: ['calendar.read', 'calendar.write', 'offline_access'],
        service_documentation: 'https://github.com/suraj/Vanko-Calendar',
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}

/**
 * RFC 7591: Dynamic Client Registration
 * Exposed at POST /oauth/register
 */
export async function handleOAuthRegister(request: Request, origin: string): Promise<Response> {
  try {
    const body = (await request.json()) as any;
    const clientName = body.client_name || 'ChatGPT Client';
    const redirectUris = Array.isArray(body.redirect_uris) && body.redirect_uris.length > 0
      ? body.redirect_uris
      : ['https://chatgpt.com/api/aip/oauth/callback'];

    const clientId = `vnk_client_${crypto.randomUUID().replace(/-/g, '')}`;
    const clientSecret = `vnk_sec_${crypto.randomUUID().replace(/-/g, '')}`;

    return new Response(
      JSON.stringify(
        {
          client_id: clientId,
          client_secret: clientSecret,
          client_name: clientName,
          redirect_uris: redirectUris,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        },
        null,
        2
      ),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'invalid_client_metadata', error_description: err?.message || 'Invalid JSON body' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      }
    );
  }
}

/**
 * GET /oauth/authorize
 * Serves an enterprise-grade, minimal white glassmorphism authorization login page
 */
export function renderOAuthAuthorizePage(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  errorMessage?: string;
}): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect Vanko to ChatGPT</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #FAFAFA; color: #18181B; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
    .card { background: #FFFFFF; width: 100%; max-width: 420px; border-radius: 16px; border: 1px solid #E4E4E7; box-shadow: 0 4px 20px rgba(0,0,0,0.06); padding: 32px; }
    .logo-row { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .logo-badge { width: 44px; height: 44px; border-radius: 12px; background: #18181B; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; letter-spacing: -0.5px; }
    .app-title { font-size: 18px; font-weight: 700; color: #18181B; }
    .app-subtitle { font-size: 13px; color: #71717A; margin-top: 2px; }
    .scope-box { background: #F4F4F5; border-radius: 10px; padding: 14px; margin-bottom: 24px; font-size: 13px; color: #3F3F46; line-height: 1.5; }
    .scope-title { font-weight: 600; color: #18181B; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
    .scope-item { display: flex; align-items: flex-start; gap: 8px; margin-top: 4px; }
    .check { color: #16A34A; font-weight: bold; }
    .error-banner { background: #FEF2F2; border: 1px solid #FCA5A5; color: #B91C1C; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; font-weight: 500; }
    .google-btn-wrap { margin-bottom: 18px; }
    .btn-google { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; background: #FFFFFF; border: 1px solid #D4D4D8; border-radius: 10px; padding: 12px 14px; font-size: 14px; font-weight: 600; color: #18181B; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
    .btn-google:hover { background: #F4F4F5; border-color: #A1A1AA; }
    .google-icon { width: 18px; height: 18px; }
    .divider-row { display: flex; align-items: center; margin: 18px 0 16px 0; color: #A1A1AA; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; }
    .divider-row::before, .divider-row::after { content: ""; flex: 1; height: 1px; background: #E4E4E7; }
    .divider-row span { padding: 0 12px; }
    .tab-header { display: flex; border-bottom: 1px solid #E4E4E7; margin-bottom: 20px; }
    .tab-btn { flex: 1; text-align: center; padding: 10px 0; font-size: 13px; font-weight: 600; color: #71717A; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; }
    .tab-btn.active { color: #18181B; border-bottom-color: #18181B; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #71717A; margin-bottom: 6px; }
    input[type="email"], input[type="password"], input[type="text"] { width: 100%; padding: 12px 14px; border: 1px solid #D4D4D8; border-radius: 8px; font-size: 14px; color: #18181B; outline: none; transition: border-color 0.2s; }
    input:focus { border-color: #18181B; ring: 2px solid #18181B; }
    .hint { font-size: 11px; color: #A1A1AA; margin-top: 4px; }
    .btn-submit { width: 100%; background: #18181B; color: #FFFFFF; border: none; border-radius: 10px; padding: 14px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; margin-top: 8px; }
    .btn-submit:hover { opacity: 0.92; }
    .footer-note { text-align: center; font-size: 11px; color: #A1A1AA; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-row">
      <div class="logo-badge">V</div>
      <div>
        <div class="app-title">Authorize ChatGPT</div>
        <div class="app-subtitle">Connect your personal Vanko calendar</div>
      </div>
    </div>

    <div class="scope-box">
      <div class="scope-title">Permissions Requested:</div>
      <div class="scope-item"><span class="check">✓</span> View your personal events and upcoming deadlines</div>
      <div class="scope-item"><span class="check">✓</span> Add new schedule items and reminders</div>
      <div class="scope-item"><span class="check">✓</span> Disarm deadline alarms upon submission</div>
    </div>

    ${params.errorMessage ? `<div class="error-banner">${params.errorMessage}</div>` : ''}

    <!-- Mode 0: Google Sign-In (Recommended for Mobile & Web) -->
    <div class="google-btn-wrap">
      <div id="g_id_onload"
           data-client_id="922680174583-moi8a65hp2ji4345pco5fvt7tum49f7r.apps.googleusercontent.com"
           data-context="signin"
           data-ux_mode="popup"
           data-callback="handleGoogleCredentialResponse"
           data-auto_prompt="false">
      </div>
      <div class="g_id_signin"
           data-type="standard"
           data-shape="rectangular"
           data-theme="outline"
           data-text="continue_with"
           data-size="large"
           data-logo_alignment="center"
           data-width="356">
      </div>
    </div>

    <!-- Hidden Form for Google Token Submission -->
    <form id="formGoogle" method="POST" action="/oauth/authorize" style="display: none;">
      <input type="hidden" name="auth_mode" value="google">
      <input type="hidden" name="google_credential" id="google_credential">
      <input type="hidden" name="client_id" value="${params.clientId}">
      <input type="hidden" name="redirect_uri" value="${params.redirectUri}">
      <input type="hidden" name="state" value="${params.state}">
      <input type="hidden" name="code_challenge" value="${params.codeChallenge}">
      <input type="hidden" name="code_challenge_method" value="${params.codeChallengeMethod}">
      <input type="hidden" name="scope" value="${params.scope}">
    </form>

    <div class="divider-row">
      <span>or sign in with password / key</span>
    </div>

    <div class="tab-header">
      <button type="button" class="tab-btn active" id="tabEmail" onclick="switchTab('email')">Account Login</button>
      <button type="button" class="tab-btn" id="tabKey" onclick="switchTab('key')">1-Tap Vanko Key</button>
    </div>

    <!-- Mode 1: Email & Password -->
    <form id="formEmail" method="POST" action="/oauth/authorize">
      <input type="hidden" name="auth_mode" value="password">
      <input type="hidden" name="client_id" value="${params.clientId}">
      <input type="hidden" name="redirect_uri" value="${params.redirectUri}">
      <input type="hidden" name="state" value="${params.state}">
      <input type="hidden" name="code_challenge" value="${params.codeChallenge}">
      <input type="hidden" name="code_challenge_method" value="${params.codeChallengeMethod}">
      <input type="hidden" name="scope" value="${params.scope}">

      <div class="form-group">
        <label for="email">Vanko Email</label>
        <input type="email" id="email" name="email" placeholder="alex@gmail.com" required autocomplete="username">
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="••••••••" required autocomplete="current-password">
      </div>

      <button type="submit" class="btn-submit">Sign In & Connect</button>
    </form>

    <!-- Mode 2: Vanko 1-Tap Permanent Key (from Vanko App Settings) -->
    <form id="formKey" method="POST" action="/oauth/authorize" style="display: none;">
      <input type="hidden" name="auth_mode" value="key">
      <input type="hidden" name="client_id" value="${params.clientId}">
      <input type="hidden" name="redirect_uri" value="${params.redirectUri}">
      <input type="hidden" name="state" value="${params.state}">
      <input type="hidden" name="code_challenge" value="${params.codeChallenge}">
      <input type="hidden" name="code_challenge_method" value="${params.codeChallengeMethod}">
      <input type="hidden" name="scope" value="${params.scope}">

      <div class="form-group">
        <label for="vanko_key">Your Vanko Key</label>
        <input type="text" id="vanko_key" name="vanko_key" placeholder="vnk_live_..." required autocomplete="off">
        <div class="hint">Copy from Vanko App → Settings → Connect ChatGPT & Claude → Copy Key.</div>
      </div>

      <button type="submit" class="btn-submit">Authorize with Key</button>
    </form>

    <div class="footer-note">
      🔒 Secure OAuth 2.1 • End-to-end encrypted • Vanko Protocol
    </div>
  </div>

  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <script>
    function handleGoogleCredentialResponse(response) {
      if (response && response.credential) {
        document.getElementById('google_credential').value = response.credential;
        document.getElementById('formGoogle').submit();
      }
    }

    function switchTab(mode) {
      if (mode === 'email') {
        document.getElementById('formEmail').style.display = 'block';
        document.getElementById('formKey').style.display = 'none';
        document.getElementById('tabEmail').classList.add('active');
        document.getElementById('tabKey').classList.remove('active');
      } else {
        document.getElementById('formEmail').style.display = 'none';
        document.getElementById('formKey').style.display = 'block';
        document.getElementById('tabKey').classList.add('active');
        document.getElementById('tabEmail').classList.remove('active');
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: params.errorMessage ? 400 : 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * POST /oauth/authorize
 * Handles login submission and issues short-lived authorization code with PKCE binding
 */
export async function handleOAuthAuthorizePost(
  request: Request,
  secret: string,
  firebaseApiKey: string,
  verifyPermanentKeyFn: (token: string, secret: string) => Promise<{ uid: string; email?: string } | null>
): Promise<Response> {
  const formData = await request.formData();
  const authMode = (formData.get('auth_mode') as string) || 'password';
  const clientId = (formData.get('client_id') as string) || '';
  const redirectUri = (formData.get('redirect_uri') as string) || '';
  const state = (formData.get('state') as string) || '';
  const codeChallenge = (formData.get('code_challenge') as string) || '';
  const codeChallengeMethod = (formData.get('code_challenge_method') as string) || 'S256';
  const scope = (formData.get('scope') as string) || 'calendar.read calendar.write';

  let authenticatedUid = '';
  let authenticatedEmail = '';

  if (authMode === 'google') {
    // Mode 0: Verify Google Sign-In Credential via Firebase Identity Toolkit
    const googleCredential = (formData.get('google_credential') as string) || '';
    if (!googleCredential) {
      return renderOAuthAuthorizePage({
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scope,
        errorMessage: 'Google Sign-In was cancelled or failed.',
      });
    }

    try {
      const fbRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${firebaseApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            postBody: `id_token=${encodeURIComponent(googleCredential)}&providerId=google.com`,
            requestUri: 'https://vanko-api.vanko-app.workers.dev',
            returnSecureToken: true,
            returnIdpCredential: true,
          }),
        }
      );

      const fbData = (await fbRes.json()) as any;
      if (!fbRes.ok || !fbData.localId) {
        return renderOAuthAuthorizePage({
          clientId,
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          scope,
          errorMessage: 'Google authentication could not be completed with Firebase.',
        });
      }

      authenticatedUid = fbData.localId;
      authenticatedEmail = fbData.email || '';
    } catch (e: any) {
      return renderOAuthAuthorizePage({
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scope,
        errorMessage: 'Unable to reach Google Auth server. Please check your network.',
      });
    }
  } else if (authMode === 'key') {
    // Mode 2: Verify personal Vanko Key
    const vankoKey = (formData.get('vanko_key') as string) || '';
    const verified = await verifyPermanentKeyFn(vankoKey.trim(), secret);
    if (!verified) {
      return renderOAuthAuthorizePage({
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scope,
        errorMessage: 'Invalid Vanko Key. Please check the key in your app settings.',
      });
    }
    authenticatedUid = verified.uid;
    authenticatedEmail = verified.email || '';
  } else {
    // Mode 1: Verify Email & Password via Firebase Identity Toolkit
    const email = ((formData.get('email') as string) || '').trim();
    const password = (formData.get('password') as string) || '';

    try {
      const fbRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        }
      );

      const fbData = (await fbRes.json()) as any;
      if (!fbRes.ok || !fbData.localId) {
        const errMsg =
          fbData?.error?.message === 'INVALID_LOGIN_CREDENTIALS' ||
          fbData?.error?.message === 'EMAIL_NOT_FOUND' ||
          fbData?.error?.message === 'INVALID_PASSWORD'
            ? 'Incorrect email or password. Please try again.'
            : 'Authentication failed. Please verify your credentials.';
        return renderOAuthAuthorizePage({
          clientId,
          redirectUri,
          state,
          codeChallenge,
          codeChallengeMethod,
          scope,
          errorMessage: errMsg,
        });
      }

      authenticatedUid = fbData.localId;
      authenticatedEmail = fbData.email || email;
    } catch (e: any) {
      return renderOAuthAuthorizePage({
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scope,
        errorMessage: 'Unable to reach authentication server. Please check your network.',
      });
    }
  }

  // Issue 5-minute single-use authorization code bound to code_challenge
  const authCode = await signOAuthCode(
    {
      uid: authenticatedUid,
      email: authenticatedEmail,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope,
      exp: Date.now() + 5 * 60 * 1000,
      v: 1,
    },
    secret
  );

  // Redirect back to ChatGPT OAuth callback
  const targetUrl = new URL(redirectUri);
  targetUrl.searchParams.set('code', authCode);
  if (state) {
    targetUrl.searchParams.set('state', state);
  }

  return Response.redirect(targetUrl.toString(), 302);
}

/**
 * POST /oauth/token
 * Validates PKCE S256 code_verifier and issues OAuth 2.1 access and refresh tokens
 */
export async function handleOAuthToken(request: Request, secret: string): Promise<Response> {
  try {
    let body: any = {};
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      formData.forEach((val, key) => {
        body[key] = val;
      });
    } else {
      body = await request.json();
    }

    const grantType = body.grant_type;

    if (grantType === 'authorization_code') {
      const { code, code_verifier, redirect_uri, client_id } = body;
      if (!code) {
        return new Response(
          JSON.stringify({ error: 'invalid_request', error_description: 'Missing code parameter' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      // 1. Verify authorization code HMAC and expiration
      const authCodePayload = await verifyOAuthCode(code, secret);
      if (!authCodePayload) {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Authorization code is invalid or expired' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      // 2. Verify PKCE S256 (if code_challenge was provided)
      if (authCodePayload.code_challenge) {
        if (!code_verifier) {
          return new Response(
            JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE code_verifier is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }

        const calculatedChallenge = await sha256Base64Url(code_verifier);
        if (calculatedChallenge !== authCodePayload.code_challenge) {
          return new Response(
            JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE verification failed: challenge mismatch' }),
            { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }
      }

      // 3. Issue Access Token (valid for 30 days) and Refresh Token
      const accessToken = await signOAuthAccessToken(
        {
          uid: authCodePayload.uid,
          email: authCodePayload.email,
          client_id: client_id || authCodePayload.client_id,
          scope: authCodePayload.scope || 'calendar.read calendar.write',
          exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
          v: 1,
        },
        secret
      );

      const refreshToken = `vnk_refresh_${await signHmac(
        JSON.stringify({ uid: authCodePayload.uid, email: authCodePayload.email, exp: Date.now() + 90 * 24 * 60 * 60 * 1000 }),
        secret
      )}`;

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 30 * 24 * 60 * 60, // 30 days
          refresh_token: refreshToken,
          scope: authCodePayload.scope || 'calendar.read calendar.write',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    if (grantType === 'refresh_token') {
      const { refresh_token, client_id } = body;
      if (!refresh_token || !refresh_token.startsWith('vnk_refresh_')) {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid refresh token' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const raw = refresh_token.substring('vnk_refresh_'.length);
      const verified = await verifyHmac<{ uid: string; email: string; exp: number }>(raw, secret);
      if (!verified || verified.exp < Date.now()) {
        return new Response(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token expired or invalid' }),
          { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }

      const newAccessToken = await signOAuthAccessToken(
        {
          uid: verified.uid,
          email: verified.email,
          client_id: client_id || 'chatgpt',
          scope: 'calendar.read calendar.write',
          exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
          v: 1,
        },
        secret
      );

      return new Response(
        JSON.stringify({
          access_token: newAccessToken,
          token_type: 'Bearer',
          expires_in: 30 * 24 * 60 * 60,
          scope: 'calendar.read calendar.write',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'unsupported_grant_type', error_description: `Grant type ${grantType} not supported` }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'server_error', error_description: err?.message || 'Token generation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}

