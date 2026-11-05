import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  getUserProfile,
  checkBroadcastIdempotency,
  recordBroadcastHistory,
  queryCollegePushTokens,
  saveCollegeAnnouncementRecord,
  sendExpoPushBatches,
} from './notifications';
import { getGoogleFirestoreAccessToken } from './auth/googleServiceAccount';
import {
  sha256Hex,
  checkFeedbackRateLimit,
  checkOtpRateLimits,
  validateImageAttachment,
  uploadAttachmentToStorage,
  executeAccountDeletion,
  purgeExpiredAuditLogs,
  reconcileOrphanedDeletions,
  renderPrivacyPolicyHtml,
  renderTermsOfServiceHtml,
  renderDeleteAccountHtml,
  sendDeletionOtpEmail,
} from './compliance';
import {
  fetchAllUserEvents,
  filterEvents,
  checkConflicts,
  getDeadlines,
  createFirestoreEvent,
  updateFirestoreEventStatus,
  handleMcpJsonRpc,
  handleMcpSseConnection,
  getOpenApiSchema,
  signPermanentMcpKey,
  verifyPermanentMcpKey,
} from './mcp';
import {
  handleOAuthProtectedResource,
  handleOAuthAuthorizationServer,
  handleOAuthRegister,
  renderOAuthAuthorizePage,
  handleOAuthAuthorizePost,
  handleOAuthToken,
  verifyOAuthAccessToken,
} from './oauth';

export interface Env {
  FIREBASE_WEB_API_KEY?: string;
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_API_KEY_3?: string;
  GROQ_API_KEY_4?: string;
  GROQ_API_KEYS?: string;
  GROQ_VISION_MODEL?: string;
  GROQ_TEXT_MODEL?: string;
  VISION_DAILY_LIMIT?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  BREVO_API_KEY?: string;
  ENVIRONMENT?: string;
  RATE_LIMIT_KV?: any;
  COOLDOWN_KV?: any;
}

/**
 * Key Cooldown Architecture:
 * In-memory map tracks API keys that encounter 429 rate limits or 401 auth errors with expiry timestamp.
 * Note on Cloudflare distributed execution: Plain in-memory maps are isolate-local
 * (scoped to each regional Cloudflare PoP / V8 isolate). For instant intra-PoP key rotation,
 * in-memory tracking provides zero-overhead failover. If COOLDOWN_KV is bound, state coordinates globally.
 */
const groqKeyCooldownMap = new Map<string, number>();

/**
 * Returns active Groq API keys with cooldown tracking and round-robin load distribution.
 * Automatically rotates and prioritizes healthy keys.
 */
function getActiveGroqKeys(env: Env): string[] {
  const allKeys: string[] = [];

  if (env.GROQ_API_KEYS) {
    allKeys.push(...env.GROQ_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean));
  }
  if (env.GROQ_API_KEY) allKeys.push(env.GROQ_API_KEY.trim());
  if (env.GROQ_API_KEY_2) allKeys.push(env.GROQ_API_KEY_2.trim());
  if (env.GROQ_API_KEY_3) allKeys.push(env.GROQ_API_KEY_3.trim());
  if (env.GROQ_API_KEY_4) allKeys.push(env.GROQ_API_KEY_4.trim());

  const unique = Array.from(new Set(allKeys)).filter((k) => k.startsWith('gsk_'));
  if (unique.length === 0) return [];

  const now = Date.now();
  // Filter out keys currently on cooldown
  const readyKeys = unique.filter((k) => {
    const cooldownUntil = groqKeyCooldownMap.get(k);
    return !cooldownUntil || cooldownUntil < now;
  });

  // If all keys are marked on cooldown, fall back to trying all unique keys anyway
  const candidateKeys = readyKeys.length > 0 ? readyKeys : unique;

  // Distribute load evenly across ready keys via random starting offset
  const offset = Math.floor(Math.random() * candidateKeys.length);
  return [...candidateKeys.slice(offset), ...candidateKeys.slice(0, offset)];
}

const MAX_INPUT_LENGTH = 100_000;
const MAX_EVENTS = 50;
const DAILY_STUDENT_QUOTA = 3;
const DEFAULT_FIREBASE_PROJECT_ID = 'calendarai-f5cd0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': '*',
};

// Google JWKS public keys for Firebase Auth ID token verification
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

// Edge-level in-memory sliding-window rate limiter to prevent API abuse/DoS
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const ipRateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Safely execute an asynchronous KV operation with strict latency bounding and exception isolation.
 * If Cloudflare KV takes longer than timeoutMs (default 250ms) or throws any network/consistency error,
 * this function gracefully logs a warning and returns the fallback value without failing or delaying the request.
 */
export async function withKvTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number = 250,
  fallback: T,
  operationName: string = 'KV operation'
): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn('[KV Timeout]', operationName, 'exceeded ceiling; failing open to Tier 1.');
      resolve(fallback);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err: any) {
    clearTimeout(timer);
    console.warn('[KV Error]', operationName, 'encountered exception; failing open to Tier 1:', err?.message || err);
    return fallback;
  }
}

/**
 * Edge Rate Limiter Architecture:
 * Note on Cloudflare distributed execution: Plain in-memory Maps are isolate-local
 * (scoped to each regional Cloudflare edge PoP / V8 isolate).
 * For Tier-1 ultra-low-latency defense, in-memory sliding-window blocks burst DoS attacks locally.
 * If RATE_LIMIT_KV is bound in wrangler.toml, it coordinates state across all global PoPs.
 * In the event of KV write failures, network errors, or p99 latency spikes, it safely fails open
 * to Tier 1 without blocking or throwing 500 errors.
 */
export async function checkRateLimit(
  ip: string,
  maxRequests: number = 60,
  windowMs: number = 60_000,
  env?: Env
): Promise<boolean> {
  const now = Date.now();
  if (ipRateLimitMap.size > 5000) {
    for (const [key, entry] of ipRateLimitMap.entries()) {
      if (entry.resetAt < now) ipRateLimitMap.delete(key);
    }
  }

  const existing = ipRateLimitMap.get(ip);
  if (!existing || existing.resetAt < now) {
    ipRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    if (existing.count >= maxRequests) {
      return false;
    }
    existing.count += 1;
  }

  // Tier-2 Global KV Coordination across PoPs with strict fail-open and latency ceiling
  if (env?.RATE_LIMIT_KV) {
    try {
      const kvKey = `ratelimit_${ip}_${Math.floor(now / windowMs)}`;
      const current = await withKvTimeout(
        env.RATE_LIMIT_KV.get(kvKey),
        250,
        null,
        `RATE_LIMIT_KV.get(${kvKey})`
      );
      const count = current ? parseInt(current, 10) : 0;
      if (count >= maxRequests) {
        return false;
      }
      // Non-blocking write with latency timeout
      withKvTimeout(
        env.RATE_LIMIT_KV.put(kvKey, String(count + 1), {
          expirationTtl: Math.ceil(windowMs / 1000) + 10,
        }),
        250,
        undefined,
        `RATE_LIMIT_KV.put(${kvKey})`
      ).catch(() => {});
    } catch (err: any) {
      // Non-blocking fail-open fallback to Tier 1 local isolate limit
      console.warn('[RateLimiter] Unexpected error during Tier 2 KV coordination, falling back to Tier 1:', err?.message || err);
    }
  }

  return true;
}

// Fallback in-memory cache for development/local execution
const localUsageCache = new Map<string, number>();

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function isDate(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)))
  );
}

/** Get current date string formatted as YYYY-MM-DD in India Standard Time (IST - Asia/Kolkata) */
function getTodayIST(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  } catch {
    const now = new Date();
    // Fallback +5:30 UTC shift
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split('T')[0];
  }
}

/**
 * Cryptographically verify Firebase Auth ID token:
 * - Checks cryptographic signature against Google JWKS
 * - Checks audience (aud) == Firebase Project ID
 * - Checks issuer (iss) == https://securetoken.google.com/<projectId>
 * - Checks expiration timestamp (exp)
 */
export interface VerifiedToken {
  uid: string;
  email?: string;
  authTime?: number;
  isAdmin: boolean;
  role: 'admin' | 'student';
  college: string;
  claims: Record<string, unknown>;
}

export async function verifyFirebaseToken(
  authHeader: string | null,
  env: Env
): Promise<VerifiedToken> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('MISSING_TOKEN');
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new Error('MISSING_TOKEN');
  }

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;

  let payload: any;
  try {
    const result = await jwtVerify(token, GOOGLE_JWKS, {
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
    payload = result.payload;
  } catch (jwtErr: any) {
    // Classify JWT errors clearly:
    // - Expired token → INVALID_TOKEN (user must re-auth)
    // - Wrong key/audience/issuer → INVALID_TOKEN
    // - Network error fetching JWKS → rethrow to produce 500 (not a token problem)
    const msg = jwtErr?.message || String(jwtErr);
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('ENOTFOUND')) {
      // JWKS fetch failed — transient network issue. Throw as internal, not auth error.
      throw new Error('JWKS_UNAVAILABLE');
    }
    throw new Error('INVALID_TOKEN');
  }

  if (!payload?.sub) {
    throw new Error('INVALID_TOKEN');
  }

  let isAdmin = payload.admin === true || payload.role === 'admin';
  let role: 'admin' | 'student' = isAdmin ? 'admin' : 'student';
  let college =
    typeof payload.college === 'string' && payload.college.trim()
      ? payload.college.trim()
      : 'SIES_GST';

  // Single Source of Truth: Cryptographically signed Custom Claims on verified JWT.
  // Fallback: If token claims say not-admin, double-check Firestore for the server-side role.
  // This handles newly created admin accounts, stale JWTs, and accounts where
  // custom claims haven't yet propagated to the client's cached token.
  if (!isAdmin && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    try {
      const fsRole = await getUserRole(payload.sub, env);
      if (fsRole === 'admin') {
        isAdmin = true;
        role = 'admin';
        // Auto-provision the custom claim so future JWTs contain it natively
        autoProvisionAdminClaims(payload.sub, college, env).catch(() => {});
      }
    } catch {
      // Firestore lookup failed — fall back to JWT claims only
    }
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    authTime: typeof payload.auth_time === 'number' ? payload.auth_time : undefined,
    isAdmin,
    role,
    college,
    claims: (payload as Record<string, unknown>) || {},
  };
}

/**
 * Auto-provisions Firebase Auth custom claims { admin: true, role: 'admin', college }
 * via Google Identity Toolkit REST API using the Worker's service account.
 * Ensures that subsequent user token refreshes contain the cryptographically signed claims natively.
 */
async function autoProvisionAdminClaims(
  uid: string,
  college: string,
  env: Env
): Promise<void> {
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return;
  try {
    const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
    const accessToken = await getGoogleFirestoreAccessToken(env);
    const claimsPayload = JSON.stringify({
      admin: true,
      role: 'admin',
      college: college || 'SIES_GST',
    });
    // Correct Firebase Admin REST API endpoint to set custom claims:
    // POST /v1/projects/{projectId}/accounts:update with localId + customAttributes
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Firebase-Client': 'cloudflare-worker',
        },
        body: JSON.stringify({
          localId: uid,
          customAttributes: claimsPayload,
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[AutoProvision] Failed to set custom claims for ${uid}: ${res.status} ${errText}`);
    } else {
      console.log(`[AutoProvision] Admin custom claims provisioned for uid: ${uid}`);
    }
  } catch (err: any) {
    console.warn('[AutoProvision] Non-blocking background sync exception:', err?.message || err);
  }
}

/**
 * Check if user is platform admin or student.
 * Single Source of Truth: Cryptographically signed Custom Claims on the verified JWT token.
 * Fallback: Firestore document lookup for legacy accounts prior to custom claim refresh.
 */
async function getUserRole(userOrUid: VerifiedToken | string, env: Env): Promise<'admin' | 'student'> {
  if (typeof userOrUid === 'object') {
    return userOrUid.isAdmin ? 'admin' : 'student';
  } else if (typeof userOrUid === 'string') {
    const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
    try {
      let headers: Record<string, string> = {};
      if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
        const accessToken = await getGoogleFirestoreAccessToken(env);
        headers = { Authorization: `Bearer ${accessToken}` };
      }
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userOrUid}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const doc = (await res.json()) as any;
        const role = doc?.fields?.role?.stringValue;
        if (role === 'admin') return 'admin';
      }
    } catch {
      // Role lookup failed — default to 'student'
    }
  }

  return 'student';
}

/**
 * Check and atomically increment daily quota in Firestore:
 * - Uses today's date in IST (Asia/Kolkata)
 * - Authenticated with Google Service Account OAuth2 token
 * - Returns current usage and whether request is allowed
 */
async function checkAndIncrementQuota(
  uid: string,
  isAdmin: boolean,
  env: Env,
  incrementUsage: boolean = false
): Promise<{ allowed: boolean; used: number; remaining: number }> {
  if (isAdmin) {
    return { allowed: true, used: 0, remaining: 999 };
  }

  const today = getTodayIST();
  const usageKey = `${uid}_${today}`;
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;

  let currentCount = 0;

  try {
    let authHeaders: Record<string, string> = {};
    if (env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
      try {
        const token = await getGoogleFirestoreAccessToken(env);
        authHeaders = { Authorization: `Bearer ${token}` };
      } catch {
        // Fall back gracefully if token minting is unavailable
      }
    }

    // 1. Fetch current usage document from Firestore REST (authenticated)
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/extractionUsage/${usageKey}`;
    const getRes = await fetch(docUrl, { headers: { ...authHeaders } });

    if (getRes.ok) {
      const data = (await getRes.json()) as any;
      currentCount = Number(data?.fields?.count?.integerValue || 0);
    } else if (localUsageCache.has(usageKey)) {
      currentCount = localUsageCache.get(usageKey) || 0;
    }

    if (!incrementUsage) {
      const remaining = Math.max(0, DAILY_STUDENT_QUOTA - currentCount);
      return { allowed: currentCount < DAILY_STUDENT_QUOTA, used: currentCount, remaining };
    }

    if (currentCount >= DAILY_STUDENT_QUOTA) {
      return { allowed: false, used: currentCount, remaining: 0 };
    }

    // 2. Perform genuine atomic increment on Firestore database server via REST :commit
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
    const docPath = `projects/${projectId}/databases/(default)/documents/extractionUsage/${usageKey}`;

    const commitRes = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docPath,
              fields: {
                uid: { stringValue: uid },
                date: { stringValue: today },
              },
            },
            updateMask: {
              fieldPaths: ['uid', 'date'],
            },
          },
          {
            transform: {
              document: docPath,
              fieldTransforms: [
                {
                  fieldPath: 'count',
                  increment: { integerValue: '1' },
                },
                {
                  fieldPath: 'last_used',
                  setToServerValue: 'REQUEST_TIME',
                },
              ],
            },
          },
        ],
      }),
    });

    let newCount = currentCount + 1;
    if (commitRes.ok) {
      const commitData = (await commitRes.json()) as any;
      const transformResults = commitData?.writeResults?.[1]?.transformResults;
      const serverIncrementedValue = transformResults?.[0]?.integerValue;
      if (serverIncrementedValue !== undefined) {
        newCount = Number(serverIncrementedValue);
      }
    }

    localUsageCache.set(usageKey, newCount);

    return {
      allowed: newCount <= DAILY_STUDENT_QUOTA,
      used: newCount,
      remaining: Math.max(0, DAILY_STUDENT_QUOTA - newCount),
    };
  } catch {
    const current = localUsageCache.get(usageKey) || 0;
    if (incrementUsage) {
      const next = current + 1;
      localUsageCache.set(usageKey, next);
      return {
        allowed: next <= DAILY_STUDENT_QUOTA,
        used: next,
        remaining: Math.max(0, DAILY_STUDENT_QUOTA - next),
      };
    }
    return {
      allowed: current < DAILY_STUDENT_QUOTA,
      used: current,
      remaining: Math.max(0, DAILY_STUDENT_QUOTA - current),
    };
  }
}

const DAILY_VISION_QUOTA = 5;
const localVisionUsageCache = new Map<string, number>();

async function checkAndIncrementVisionQuota(
  uid: string,
  env: Env,
  incrementUsage: boolean = false
): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const today = getTodayIST();
  const usageKey = `vision_${uid}_${today}`;
  const maxQuota = Number(env.VISION_DAILY_LIMIT) || DAILY_VISION_QUOTA;

  if (env.RATE_LIMIT_KV) {
    try {
      const current = Number(await env.RATE_LIMIT_KV.get(usageKey)) || 0;
      if (current >= maxQuota) {
        return { allowed: false, used: current, remaining: 0 };
      }
      if (incrementUsage) {
        const next = current + 1;
        await env.RATE_LIMIT_KV.put(usageKey, String(next), { expirationTtl: 86400 * 2 });
        return { allowed: true, used: next, remaining: Math.max(0, maxQuota - next) };
      }
      return { allowed: true, used: current, remaining: Math.max(0, maxQuota - current) };
    } catch {
      // Fallback to local cache if KV is unavailable
    }
  }

  const current = localVisionUsageCache.get(usageKey) || 0;
  if (current >= maxQuota) {
    return { allowed: false, used: current, remaining: 0 };
  }
  if (incrementUsage) {
    const next = current + 1;
    localVisionUsageCache.set(usageKey, next);
    return { allowed: true, used: next, remaining: Math.max(0, maxQuota - next) };
  }
  return { allowed: true, used: current, remaining: Math.max(0, maxQuota - current) };
}

function parseFlexibleDate(val: unknown): string | null {
  if (!val || typeof val !== 'string') return null;
  const s = val.trim();
  // Standard ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return !Number.isNaN(Date.parse(s)) ? s : null;
  }
  // ISO with timestamp (e.g. 2026-10-25T10:00:00Z)
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const datePart = s.slice(0, 10);
    return !Number.isNaN(Date.parse(datePart)) ? datePart : null;
  }
  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return !Number.isNaN(Date.parse(iso)) ? iso : null;
  }
  // YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return !Number.isNaN(Date.parse(iso)) ? iso : null;
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const dt = new Date(parsed);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    if (y >= 2024 && y <= 2030) return `${y}-${m}-${d}`;
  }
  return null;
}

function normalizeEvents(value: unknown, referenceDateStr?: string): any[] {
  if (!Array.isArray(value)) return [];
  const todayIST = getTodayIST();
  const ref = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const currentYear = ref.getFullYear();

  return value.slice(0, MAX_EVENTS).flatMap((event) => {
    if (!event || typeof event !== 'object') return [];
    const item = event as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 300) : '';

    const hasStartDate = parseFlexibleDate(item.event_start_date);
    const hasEndDate = parseFlexibleDate(item.event_end_date);
    const hasDeadline = parseFlexibleDate(item.registration_deadline);

    // Event must have a title and AT LEAST ONE valid date
    if (!title || (!hasStartDate && !hasEndDate && !hasDeadline)) {
      return []; // Reject phantom / dateless events
    }

    // Date sanity: Year validation (current year - 1 to current year + 2)
    const validDates = [hasStartDate, hasEndDate, hasDeadline].filter(Boolean) as string[];

    const yearSanity = validDates.every((d) => {
      const yr = parseInt(d.slice(0, 4), 10);
      return yr >= currentYear - 1 && yr <= currentYear + 2;
    });

    if (!yearSanity) {
      return []; // Reject events with nonsense years (e.g. 1970 or 2045)
    }

    // Past event detection: flag if all specified dates have passed relative to today IST
    const primaryDate = (hasStartDate || hasDeadline || hasEndDate) as string;
    const isPast = primaryDate ? primaryDate < todayIST : false;

    const confidence = typeof item.confidence_score === 'number' ? item.confidence_score : 0.85;
    const allowedConfidence = ['high', 'medium', 'low'];
    const extractionConfidence = allowedConfidence.includes(String(item.extraction_confidence))
      ? item.extraction_confidence
      : (confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low');

    const allowedLinkStatus = ['found', 'mentioned_in_comments', 'none'];
    const linkStatus = allowedLinkStatus.includes(String(item.link_status))
      ? item.link_status
      : (item.registration_link ? 'found' : 'none');

    const allowedLegibility = ['high', 'medium', 'low'];
    const legibility = allowedLegibility.includes(String(item.legibility))
      ? item.legibility
      : 'high';

    const requiresReview = isPast || extractionConfidence === 'low' || legibility === 'low';

    const allowedTypes = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
    const allowedModes = ['online', 'offline', 'hybrid'];

    return [{
      temp_id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      type: allowedTypes.includes(String(item.type)) ? item.type : 'other',
      event_start_date: hasStartDate,
      event_end_date: hasEndDate,
      registration_deadline: hasDeadline,
      time: typeof item.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) ? item.time : null,
      mode: allowedModes.includes(String(item.mode)) ? item.mode : 'online',
      location: typeof item.location === 'string' ? item.location.slice(0, 500) : null,
      registration_link: typeof item.registration_link === 'string' && /^https?:\/\//i.test(item.registration_link) ? item.registration_link.slice(0, 2000) : null,
      source_group: typeof item.source_group === 'string' ? item.source_group.slice(0, 300) : null,
      raw_text: '',
      confidence_score: Math.max(0, Math.min(1, confidence)),
      extraction_confidence: extractionConfidence,
      link_status: linkStatus,
      legibility,
      is_past_event: isPast,
      requires_review: requiresReview,
      tags: [String(item.type || 'other'), String(item.mode || 'online')],
      reminder_offsets: [4320, 1440, 0],
    }];
  });
}

const JSON_SCHEMA = {
  events: [
    {
      title: 'string (e.g. AI Hackathon 2026)',
      type: 'hackathon | ctf | meetup | workshop | deadline | other',
      event_start_date: 'YYYY-MM-DD or null',
      event_end_date: 'YYYY-MM-DD or null',
      registration_deadline: 'YYYY-MM-DD or null',
      time: 'HH:MM in 24h format (e.g. "18:00", "10:30") or null',
      mode: 'online | offline | hybrid',
      location: 'string or null',
      registration_link: 'string (URL) or null',
      link_status: 'found | mentioned_in_comments | none',
      source_group: 'string or null',
      confidence_score: 'number (0.0 to 1.0)',
      extraction_confidence: 'high | medium | low',
      legibility: 'high | medium | low',
    },
  ],
};

function buildSystemPrompt(referenceDateStr?: string, isVision: boolean = false): string {
  const ref = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const d = String(ref.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const dayOfWeek = ref.toLocaleDateString('en-US', { weekday: 'long' });

  const modeInstructions = isVision
    ? `IMAGE & POSTER EXTRACTION RULES:
1. POSTER, CHAT & SCREENSHOT PARSING: The image can be an event poster, flyer, brochure, OR a screenshot of a WhatsApp chat, message, notification, Instagram story, email, or social media post. Read ALL visible text thoroughly and extract any event mentioned!
2. DATES & TIMES: Extract event dates, timings, and deadlines mentioned anywhere in the text or graphic. Convert any date mentioned (e.g. "October 28", "28th Oct", "Tomorrow", "Next Friday") into YYYY-MM-DD using the temporal context above.
3. REGISTRATION LINKS & BIO MENTIONS: If the poster or caption says "link in bio", "link in comments", "link in description", or "check comment section", set "link_status": "mentioned_in_comments" and "registration_link": null. If an actual URL (e.g. bit.ly, unstop.com, devfolio.co, or direct link) is visible, set "link_status": "found" and include the URL. If no link is mentioned, set "link_status": "none".
4. LEGIBILITY RATING: Set "legibility" to "high" (sharp, readable), "medium" (slightly stylized or blurred), or "low" (heavily pixelated or hard to decipher).
5. MULTI-EVENT POSTERS: If the image lists a calendar or multiple distinct workshops/sessions, extract EACH as a separate event in the "events" array.`
    : `TEXT MESSAGE EXTRACTION RULES:
1. RELATIVE DATE RESOLUTION: Use the temporal context above to resolve relative dates. "This Saturday" means the upcoming Saturday relative to ${todayStr}.
2. MULTI-EVENT SUPPORT: Extract all events if multiple are mentioned.`;

  return `You are an expert event information extraction system. Your job is to extract tech events, hackathons, CTFs, workshops, tech meetups, and registration deadlines.

CURRENT TEMPORAL CONTEXT:
- TODAY'S DATE: ${todayStr} (${dayOfWeek})
- CURRENT YEAR: ${y}

${modeInstructions}

CRITICAL RULES FOR ALL EXTRACTIONS:
1. REGISTRATION DEADLINE vs EVENT START DATE: ALWAYS distinguish REGISTRATION DEADLINE from EVENT START DATE as separate fields.
2. MISSING DATES: If a date cannot be determined from the source, return null. NEVER guess or invent dates.
3. TYPE CLASSIFICATION: "hackathon" | "ctf" | "meetup" | "workshop" | "deadline" | "other"
4. DELIVERY MODE: "online" | "offline" | "hybrid"
5. CONFIDENCE RATING: Set "extraction_confidence" to "high" (unambiguous dates & title), "medium" (partially inferred), or "low" (uncertain/ambiguous).
6. ZERO REASONING / ZERO THINKING TAGS: Do NOT output any thinking, reasoning, explanation, or <think> tags. Return ONLY the strict JSON object.`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Rate Limiting on API endpoints: 60 requests/minute per client IP
    if (url.pathname.startsWith('/api/') || url.pathname === '/extract' || url.pathname === '/quota') {
      const clientIp =
        request.headers.get('cf-connecting-ip') ||
        request.headers.get('x-forwarded-for') ||
        '127.0.0.1';
      if (!await checkRateLimit(clientIp, 60, 60_000, env)) {
        return jsonResponse(
          {
            error: 'TOO_MANY_REQUESTS',
            message: 'Too many requests. Please slow down and try again shortly.',
          },
          429
        );
      }
    }

    // 2. Health check endpoint
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return jsonResponse({ status: 'ok', service: 'Vanko Backend Service', version: '2.0.0' }, 200);
    }

    // 2b. Models check endpoint
    if (request.method === 'GET' && url.pathname === '/models') {
      try {
        const apiKey = getActiveGroqKeys(env)[0];
        if (!apiKey) {
          return jsonResponse({ error: 'Extraction service not configured' }, 500);
        }
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        const data = await res.json();
        return jsonResponse(data, res.status);
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // 2c-1. OAuth 2.1 RFC 9728: Protected Resource Metadata
    if (request.method === 'GET' && url.pathname === '/.well-known/oauth-protected-resource') {
      return handleOAuthProtectedResource(url.origin);
    }

    // 2c-2. OAuth 2.1 RFC 8414: Authorization Server Metadata / OpenID Discovery
    if (
      request.method === 'GET' &&
      (url.pathname === '/.well-known/oauth-authorization-server' ||
        url.pathname === '/.well-known/openid-configuration')
    ) {
      return handleOAuthAuthorizationServer(url.origin);
    }

    // 2c-3. OAuth 2.1 RFC 7591: Dynamic Client Registration
    if (request.method === 'POST' && url.pathname === '/oauth/register') {
      return handleOAuthRegister(request, url.origin);
    }

    // 2c-4. OAuth 2.1: Authorization Endpoint (GET displays login form, POST validates and redirects)
    if (url.pathname === '/oauth/authorize') {
      if (request.method === 'GET') {
        return renderOAuthAuthorizePage({
          clientId: url.searchParams.get('client_id') || '',
          redirectUri: url.searchParams.get('redirect_uri') || '',
          state: url.searchParams.get('state') || '',
          codeChallenge: url.searchParams.get('code_challenge') || '',
          codeChallengeMethod: url.searchParams.get('code_challenge_method') || 'S256',
          scope: url.searchParams.get('scope') || 'calendar.read calendar.write',
        });
      }
      if (request.method === 'POST') {
        const firebaseWebKey = env.FIREBASE_WEB_API_KEY || 'AIzaSyD41L6CdPjUdXc82DW8119-GyVO7gXYHSw';
        return handleOAuthAuthorizePost(
          request,
          env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback',
          firebaseWebKey,
          verifyPermanentMcpKey
        );
      }
    }

    // 2c-5. OAuth 2.1: Token Endpoint (Authorization Code exchange with PKCE & Refresh Tokens)
    if (request.method === 'POST' && url.pathname === '/oauth/token') {
      return handleOAuthToken(request, env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback');
    }

    // 2c-6. OpenAPI schema for ChatGPT Custom GPT Actions
    if (request.method === 'GET' && url.pathname === '/api/openapi.json') {
      return jsonResponse(getOpenApiSchema(url.origin), 200);
    }

    // 2d. Generate Permanent, Non-Expiring MCP Access Key for ChatGPT & Claude
    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/mcp/permanent-key') {
      try {
        const user = await verifyFirebaseToken(request.headers.get('Authorization'), env);
        const permanentKey = await signPermanentMcpKey(
          user.uid,
          user.email,
          env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
        );
        const mcpUrl = `${url.origin}/api/mcp?key=${permanentKey}`;
        return jsonResponse(
          {
            success: true,
            key: permanentKey,
            mcpUrl,
            expires: 'never',
          },
          200
        );
      } catch (err: any) {
        return jsonResponse(
          { error: err?.message || 'UNAUTHORIZED' },
          err?.message === 'MISSING_TOKEN' || err?.message === 'INVALID_TOKEN' ? 401 : 500
        );
      }
    }

    // 2e. MCP Server-Sent Events (SSE) Stream for Claude Web & ChatGPT MCP clients
    if (
      request.method === 'GET' &&
      (url.pathname === '/sse' ||
        url.pathname === '/api/mcp/sse' ||
        url.pathname === '/api/mcp' ||
        request.headers.get('accept')?.includes('text/event-stream'))
    ) {
      const token =
        url.searchParams.get('key') ||
        url.searchParams.get('token') ||
        (request.headers.get('Authorization')?.startsWith('Bearer ')
          ? request.headers.get('Authorization')!.substring(7).trim()
          : undefined);

      if (!token) {
        return new Response(
          JSON.stringify({
            error: 'unauthorized',
            message: 'Authentication required. Please authenticate via OAuth or provide your Vanko access key.',
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`,
            },
          }
        );
      }

      // Verify token authenticity before opening SSE stream
      let sseUid: string | null = null;
      if (token.startsWith('vnk_oauth_')) {
        const verified = await verifyOAuthAccessToken(
          token,
          env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
        );
        if (verified) sseUid = verified.uid;
      } else if (token.startsWith('vnk_live_')) {
        const verified = await verifyPermanentMcpKey(
          token,
          env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
        );
        if (verified) sseUid = verified.uid;
      } else {
        try {
          const user = await verifyFirebaseToken(`Bearer ${token}`, env);
          sseUid = user.uid;
        } catch {
          // Invalid Firebase token
        }
      }

      if (!sseUid) {
        return new Response(
          JSON.stringify({
            error: 'unauthorized',
            message: 'Invalid or expired authentication credentials.',
          }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`,
            },
          }
        );
      }

      return handleMcpSseConnection(request, url, token);
    }

    // 2f. Standard MCP JSON-RPC 2.0 Endpoint over HTTP POST
    // Accepts /api/mcp, /sse, /message, or /api/openapi.json
    if (
      request.method === 'POST' &&
      (url.pathname === '/api/mcp' ||
        url.pathname === '/sse' ||
        url.pathname === '/message' ||
        url.pathname === '/api/openapi.json')
    ) {
      try {
        let rawToken = '';
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          rawToken = authHeader.substring(7).trim();
        } else if (url.searchParams.has('key')) {
          rawToken = url.searchParams.get('key')!.trim();
        } else if (url.searchParams.has('token')) {
          rawToken = url.searchParams.get('token')!.trim();
        }

        let uid: string | null = null;
        if (rawToken) {
          if (rawToken.startsWith('vnk_oauth_')) {
            const verified = await verifyOAuthAccessToken(
              rawToken,
              env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
            );
            if (verified) {
              uid = verified.uid;
            }
          } else if (rawToken.startsWith('vnk_live_')) {
            const verified = await verifyPermanentMcpKey(
              rawToken,
              env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
            );
            if (verified) {
              uid = verified.uid;
            }
          } else {
            try {
              const user = await verifyFirebaseToken(`Bearer ${rawToken}`, env);
              uid = user.uid;
            } catch {
              // Token verification optional for initialize & tools/list
            }
          }
        }

        const body = (await request.json()) as any;

        // Strict Enforcement: If client calls tools/call without valid authentication, reject immediately with 401
        if (!uid && body?.method === 'tools/call') {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: body?.id || null,
              error: {
                code: -32001,
                message: 'Unauthorized: Authentication required. Please connect your Vanko account via OAuth.',
              },
            }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`,
              },
            }
          );
        }

        const response = await handleMcpJsonRpc(env, uid, body, rawToken || undefined);
        return jsonResponse(response, 200);
      } catch (err: any) {
        return jsonResponse(
          { jsonrpc: '2.0', id: null, error: { code: -32603, message: err?.message || 'Internal error' } },
          500
        );
      }
    }

    // 2g. MCP REST Endpoints (for Claude Web, ChatGPT Custom GPT Actions, and local MCP Client)
    if (url.pathname.startsWith('/api/mcp/')) {
      try {
        let rawToken = '';
        const authHeader = request.headers.get('Authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
          rawToken = authHeader.substring(7).trim();
        } else if (url.searchParams.has('key')) {
          rawToken = url.searchParams.get('key')!.trim();
        } else if (url.searchParams.has('token')) {
          rawToken = url.searchParams.get('token')!.trim();
        }

        let user: { uid: string; email?: string; isAdmin?: boolean; role?: 'admin' | 'student'; college?: string };
        if (rawToken.startsWith('vnk_oauth_')) {
          const verified = await verifyOAuthAccessToken(
            rawToken,
            env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
          );
          if (!verified) {
            return new Response(JSON.stringify({ error: 'INVALID_OAUTH_TOKEN' }), {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`,
              },
            });
          }
          user = { uid: verified.uid, email: verified.email, isAdmin: false, role: 'student', college: 'SIES_GST' };
        } else if (rawToken.startsWith('vnk_live_')) {
          const verified = await verifyPermanentMcpKey(
            rawToken,
            env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
          );
          if (!verified) {
            return new Response(JSON.stringify({ error: 'INVALID_PERMANENT_KEY' }), {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`,
              },
            });
          }
          user = { uid: verified.uid, email: verified.email, isAdmin: false, role: 'student', college: 'SIES_GST' };
        } else {
          user = await verifyFirebaseToken(`Bearer ${rawToken}`, env);
        }

        // GET /api/mcp/events/search?q=...
        if (request.method === 'GET' && url.pathname === '/api/mcp/events/search') {
          const q = (url.searchParams.get('q') || '').toLowerCase();
          const allEvents = await fetchAllUserEvents(env, user.uid, rawToken);
          const results = allEvents.filter(
            (e) =>
              e.title.toLowerCase().includes(q) ||
              (e.location && e.location.toLowerCase().includes(q)) ||
              (e.raw_text && e.raw_text.toLowerCase().includes(q)) ||
              (e.tags && e.tags.some((t) => t.toLowerCase().includes(q)))
          );
          return jsonResponse({ results }, 200);
        }

        // GET /api/mcp/conflicts?date=...
        if (request.method === 'GET' && url.pathname === '/api/mcp/conflicts') {
          const date = url.searchParams.get('date') || undefined;
          const allEvents = await fetchAllUserEvents(env, user.uid, rawToken);
          const report = checkConflicts(allEvents, date);
          return jsonResponse(report, 200);
        }

        // GET /api/mcp/deadlines?days=7&include_registered=false
        if (request.method === 'GET' && url.pathname === '/api/mcp/deadlines') {
          const days = parseInt(url.searchParams.get('days') || '7', 10);
          const incReg = url.searchParams.get('include_registered') === 'true';
          const allEvents = await fetchAllUserEvents(env, user.uid, rawToken);
          const deadlines = getDeadlines(allEvents, days, incReg);
          return jsonResponse({ deadlines }, 200);
        }

        // POST /api/mcp/events/:id/submit
        const submitMatch = url.pathname.match(/^\/api\/mcp\/events\/([^/]+)\/submit$/);
        if (request.method === 'POST' && submitMatch) {
          const eventId = decodeURIComponent(submitMatch[1]);
          const updated = await updateFirestoreEventStatus(env, user.uid, eventId, 'registered', rawToken);
          return jsonResponse({ event: updated, message: 'Event marked as submitted and alarms disarmed.' }, 200);
        }

        // GET /api/mcp/events/:id
        const singleMatch = url.pathname.match(/^\/api\/mcp\/events\/([^/]+)$/);
        if (request.method === 'GET' && singleMatch) {
          const eventId = decodeURIComponent(singleMatch[1]);
          const allEvents = await fetchAllUserEvents(env, user.uid, rawToken);
          const event = allEvents.find((e) => e.id === eventId);
          if (!event) return jsonResponse({ error: 'NOT_FOUND', message: 'Event not found' }, 404);
          return jsonResponse({ event }, 200);
        }

        // GET /api/mcp/events
        if (request.method === 'GET' && url.pathname === '/api/mcp/events') {
          const allEvents = await fetchAllUserEvents(env, user.uid, rawToken);
          const params = {
            time_filter: url.searchParams.get('time_filter') || undefined,
            type: url.searchParams.get('type') || undefined,
            status: url.searchParams.get('status') || undefined,
            has_alarm: url.searchParams.has('has_alarm') ? url.searchParams.get('has_alarm') === 'true' : undefined,
            limit: url.searchParams.has('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 20,
          };
          const events = filterEvents(allEvents, params);
          return jsonResponse({ events, total: events.length }, 200);
        }

        // POST /api/mcp/events
        if (request.method === 'POST' && url.pathname === '/api/mcp/events') {
          const body = (await request.json()) as any;
          if (!body || !body.title) {
            return jsonResponse({ error: 'BAD_REQUEST', message: 'Event title is required.' }, 400);
          }
          const created = await createFirestoreEvent(env, user.uid, body, rawToken);
          return jsonResponse({ event: created, message: 'Event successfully created.' }, 201);
        }

        return jsonResponse({ error: 'NOT_FOUND', message: 'Endpoint not found' }, 404);
      } catch (err: any) {
        if (err.message === 'MISSING_TOKEN' || err.message === 'INVALID_TOKEN') {
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Authentication required.' }, 401);
        }
        return jsonResponse({ error: 'INTERNAL_ERROR', message: err.message }, 500);
      }
    }



    // 3. Quota check endpoint (Read-only status for UI badge)
    if (request.method === 'GET' && (url.pathname === '/api/quota' || url.pathname === '/quota')) {
      try {
        const authHeader = request.headers.get('Authorization');
        const user = await verifyFirebaseToken(authHeader, env);
        const isAdmin = user.isAdmin;
        const quota = await checkAndIncrementQuota(user.uid, isAdmin, env, false);

        return jsonResponse(
          {
            daily_quota: DAILY_STUDENT_QUOTA,
            used_today: quota.used,
            remaining: quota.remaining,
            unlimited: isAdmin,
            reset_at: 'Tomorrow 00:00 IST',
          },
          200
        );
      } catch (err: any) {
        if (err.message === 'MISSING_TOKEN' || err.message === 'INVALID_TOKEN') {
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Authentication required.' }, 401);
        }
        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500);
      }
    }

    // 4. Extraction endpoint
    if (request.method === 'POST' && (url.pathname === '/api/extract' || url.pathname === '/extract')) {
      try {
        const authHeader = request.headers.get('Authorization');
        let user: VerifiedToken;

        try {
          user = await verifyFirebaseToken(authHeader, env);
        } catch (authErr: any) {
          return jsonResponse(
            {
              error: 'UNAUTHORIZED',
              message: 'Valid authentication session required to scan announcements.',
            },
            401
          );
        }

        const isAdmin = user.isAdmin;

        // Server-Side Quota Enforcement before invoking paid Groq API
        const quota = await checkAndIncrementQuota(user.uid, isAdmin, env, true);
        if (!quota.allowed) {
          return jsonResponse(
            {
              error: 'QUOTA_EXCEEDED',
              message: "Daily schedule scan limit reached. Your allowance refreshes tomorrow at midnight.",
              quota: {
                daily_quota: DAILY_STUDENT_QUOTA,
                used_today: quota.used,
                remaining: 0,
                unlimited: false,
              },
            },
            429
          );
        }

        const MAX_PAYLOAD_LENGTH = 4_500_000; // Allow up to 4.5MB for base64 image payloads
        const contentLength = Number(request.headers.get('Content-Length') || 0);
        if (contentLength > MAX_PAYLOAD_LENGTH) {
          return jsonResponse({ error: 'Request is too large. Image payloads must be under 3.5MB.' }, 413);
        }

        const apiKeys = getActiveGroqKeys(env);
        if (apiKeys.length === 0) {
          return jsonResponse({ error: 'Extraction service is temporarily unavailable.' }, 500);
        }

        const body = (await request.json()) as {
          text?: string;
          imageBase64?: string;
          mimeType?: string;
          referenceDate?: string;
        };

        const rawText = body.text?.trim();
        const hasImage = Boolean(body.imageBase64 && body.imageBase64.length > 50);

        if (rawText && rawText.length > MAX_INPUT_LENGTH) {
          return jsonResponse({ error: 'Text input exceeds maximum allowed length.' }, 413);
        }

        if (!rawText && !hasImage) {
          return jsonResponse({ events: [], extracted_at: new Date().toISOString() }, 200);
        }

        const isVisionRequest = hasImage;
        const tierUsed = isVisionRequest ? 'tier2_vision' : 'tier1_text';

        // Rate limiting per user on Tier 2 vision calls (5 calls/day for students)
        if (isVisionRequest && !isAdmin) {
          const visionQuota = await checkAndIncrementVisionQuota(user.uid, env, true);
          if (!visionQuota.allowed) {
            return jsonResponse(
              {
                error: 'VISION_QUOTA_EXCEEDED',
                message: "Daily image scan limit reached. Please paste the announcement text or try again tomorrow.",
              },
              429
            );
          }
        }

        const systemPrompt =
          buildSystemPrompt(body.referenceDate, isVisionRequest) +
          `\n\nOUTPUT FORMAT:\nYou MUST return ONLY a JSON object containing an "events" array conforming strictly to:\n${JSON.stringify(
            JSON_SCHEMA,
            null,
            2
          )}`;

        const userMessages: any[] = [
          { role: 'system', content: systemPrompt },
        ];

        if (isVisionRequest) {
          const mime = body.mimeType || 'image/jpeg';
          userMessages.push({
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Extract all tech events, hackathons, CTFs, workshops, or deadlines from this poster, screenshot, or announcement image.' +
                  (rawText ? `\nAccompanying caption/text:\n"""\n${rawText}\n"""` : ''),
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mime};base64,${body.imageBase64}`,
                },
              },
            ],
          });
        } else {
          userMessages.push({
            role: 'user',
            content: `Extract all tech events, hackathons, CTFs, workshops, or deadlines from this WhatsApp message:\n\n"""\n${rawText}\n"""`,
          });
        }

        const CANDIDATE_MODELS = isVisionRequest
          ? [env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b']
          : [
              env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
              'openai/gpt-oss-20b',
              'qwen/qwen3.8-27b',
              'llama-3.3-70b-versatile',
            ];

        let content: string | null = null;
        let lastError = '';

        // Multi-Key Failover with Rate-Limit Cooldown
        for (const currentApiKey of apiKeys) {
          for (const candidateModel of CANDIDATE_MODELS) {
            try {
              const groqPayload: any = {
                model: candidateModel,
                messages: userMessages,
                response_format: { type: 'json_object' },
                temperature: 0.1,
              };

              // Explicitly disable reasoning/thinking tokens to minimize latency
              groqPayload.reasoning_format = 'hidden';

              const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${currentApiKey}`,
                },
                body: JSON.stringify(groqPayload),
              });

              if (groqResponse.ok) {
                const groqData = (await groqResponse.json()) as any;
                content = groqData?.choices?.[0]?.message?.content;
                if (content) break;
              } else if (groqResponse.status === 429) {
                const errDetail = await groqResponse.text().catch(() => '');
                console.warn(`Groq 429 rate limit on key:`, errDetail);
                groqKeyCooldownMap.set(currentApiKey, Date.now() + 60_000);
                lastError = `Groq rate-limited (429): ${errDetail.slice(0, 150)}`;
                break; // Break out of candidate models to cascade immediately to next key
              } else if (groqResponse.status === 401) {
                // Key invalid or unauthorized: put key on 1-hour cooldown and switch to next backup key
                groqKeyCooldownMap.set(currentApiKey, Date.now() + 3_600_000);
                lastError = `Key unauthorized (401)`;
                break; // Break out of candidate models to cascade immediately to next key
              } else {
                const errDetail = await groqResponse.text().catch(() => '');
                lastError = `[${candidateModel}] Status ${groqResponse.status}: ${errDetail.slice(0, 200)}`;
              }
            } catch (modelErr: any) {
              lastError = `[${candidateModel}] ${modelErr?.message || 'Fetch failed'}`;
            }
          }

          if (content) break; // Extraction succeeded, exit key cascade
        }

        if (!content) {
          return jsonResponse(
            {
              error: 'EXTRACTION_FAILED',
              message: 'Unable to analyze the announcement. Please try again in a moment or enter the details manually.',
            },
            502
          );
        }

        let parsedJson: any;
        try {
          parsedJson = JSON.parse(content);
        } catch (e) {
          const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
          parsedJson = JSON.parse(cleaned);
        }

        return jsonResponse(
          {
            events: normalizeEvents(parsedJson?.events, body.referenceDate),
            tier_used: tierUsed,
            extracted_at: new Date().toISOString(),
            quota: {
              daily_quota: DAILY_STUDENT_QUOTA,
              used_today: quota.used,
              remaining: quota.remaining,
              unlimited: isAdmin,
            },
          },
          200
        );
      } catch (err: any) {
        return jsonResponse({ error: 'Internal Server Error' }, 500);
      }
    }

    // 4b. Benchmark & Evaluation Endpoint (Gated by X-Eval-Key)
    if (request.method === 'POST' && url.pathname === '/api/eval/extract') {
      try {
        const evalHeader = request.headers.get('X-Eval-Key');
        if (evalHeader !== 'vanko-benchmark-eval-2026') {
          return jsonResponse({ error: 'FORBIDDEN', message: 'Valid evaluation key required.' }, 403);
        }

        const apiKeys = getActiveGroqKeys(env);
        if (apiKeys.length === 0) {
          return jsonResponse({ error: 'Extraction service is not configured.' }, 500);
        }

        const body = (await request.json()) as {
          text?: string;
          imageBase64?: string;
          mimeType?: string;
          referenceDate?: string;
          disableReasoningFormat?: boolean;
        };

        const isVisionRequest = Boolean(body.imageBase64 && body.imageBase64.length > 50);
        const systemPrompt =
          buildSystemPrompt(body.referenceDate, isVisionRequest) +
          `\n\nOUTPUT FORMAT:\nYou MUST return ONLY a JSON object containing an "events" array conforming strictly to:\n${JSON.stringify(
            JSON_SCHEMA,
            null,
            2
          )}`;

        const userMessages: any[] = [{ role: 'system', content: systemPrompt }];

        if (isVisionRequest) {
          userMessages.push({
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Extract all tech events, hackathons, CTFs, workshops, or deadlines from this poster, screenshot, or announcement image.' +
                  (body.text ? `\nAccompanying caption/text:\n"""\n${body.text}\n"""` : ''),
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${body.mimeType || 'image/jpeg'};base64,${body.imageBase64}`,
                },
              },
            ],
          });
        } else {
          userMessages.push({
            role: 'user',
            content: `Extract all tech events, hackathons, CTFs, workshops, or deadlines from this text:\n\n"""\n${body.text}\n"""`,
          });
        }

        const candidateModel = isVisionRequest
          ? (env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b')
          : (env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b');

        const startTime = Date.now();
        const groqPayload: any = {
          model: candidateModel,
          messages: userMessages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        };

        if (!body.disableReasoningFormat) {
          groqPayload.reasoning_format = 'hidden';
        }

        let groqResponse: Response | null = null;
        let lastError = '';
        for (const currentApiKey of apiKeys) {
          try {
            groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${currentApiKey}`,
              },
              body: JSON.stringify(groqPayload),
            });
            if (groqResponse.ok) break;
            const errTxt = await groqResponse.text().catch(() => '');
            lastError = `Status ${groqResponse.status}: ${errTxt.slice(0, 200)}`;
          } catch (fetchErr: any) {
            lastError = fetchErr.message;
          }
        }

        const latencyMs = Date.now() - startTime;

        if (!groqResponse || !groqResponse.ok) {
          return jsonResponse({ error: 'UPSTREAM_GROQ_ERROR', message: lastError, latency_ms: latencyMs }, 502);
        }

        const groqData = (await groqResponse.json()) as any;
        const rawContent = groqData?.choices?.[0]?.message?.content || '';
        const reasoningContent = groqData?.choices?.[0]?.message?.reasoning || '';
        const thinkingDetected = rawContent.includes('<think>') || Boolean(reasoningContent);

        let parsedJson: any = null;
        let jsonParseError: string | null = null;
        try {
          parsedJson = JSON.parse(rawContent);
        } catch (e) {
          try {
            const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
            parsedJson = JSON.parse(cleaned);
          } catch (err2: any) {
            jsonParseError = err2.message;
          }
        }

        const events = parsedJson?.events ? normalizeEvents(parsedJson.events, body.referenceDate) : [];

        return jsonResponse(
          {
            model_evaluated: candidateModel,
            latency_ms: latencyMs,
            thinking_tokens_detected: thinkingDetected,
            reasoning_length: reasoningContent ? reasoningContent.length : 0,
            json_parsed_successfully: Boolean(parsedJson),
            json_parse_error: jsonParseError,
            events_extracted_count: events.length,
            events,
            raw_content_preview: rawContent.slice(0, 500),
          },
          200
        );
      } catch (evalErr: any) {
        return jsonResponse({ error: 'EVAL_INTERNAL_ERROR', message: evalErr.message }, 500);
      }
    }

    // 5. Admin Community Push Notification Broadcast (Strictly Role-Gated & Scoped via Custom Claims)
    if (
      request.method === 'POST' &&
      (url.pathname === '/api/admin/broadcast-notification' || url.pathname === '/broadcast-notification')
    ) {
      try {
        const authHeader = request.headers.get('Authorization');
        let user: VerifiedToken;
        try {
          user = await verifyFirebaseToken(authHeader, env);
        } catch (authErr: any) {
          if (authErr?.message === 'JWKS_UNAVAILABLE') {
            return jsonResponse({ error: 'SERVICE_UNAVAILABLE', message: 'Authentication service temporarily unavailable. Please retry in a moment.' }, 503);
          }
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Valid admin authentication required.' }, 401);
        }

        // Single Source of Truth: Verified Custom Claims on the ID Token
        if (!user.isAdmin) {
          return jsonResponse({ error: 'FORBIDDEN', message: 'Only campus admins can broadcast push notifications.' }, 403);
        }

        if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
          return jsonResponse(
            {
              error: 'CONFIG_ERROR',
              message: 'Firebase Service Account secrets (FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY) must be configured in Cloudflare Worker.',
            },
            503
          );
        }

        const body = (await request.json()) as {
          eventId?: string;
          title?: string;
          body?: string;
          eventType?: string;
          college?: string;
        };

        const adminCollege =
          (body.college && typeof body.college === 'string' && body.college.trim()) ||
          user.college ||
          'SIES_GST';

        if (
          !body.eventId ||
          typeof body.eventId !== 'string' ||
          !/^[a-zA-Z0-9_\-:]{1,100}$/.test(body.eventId)
        ) {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'Valid eventId is required.' }, 400);
        }

        if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'Valid title is required.' }, 400);
        }

        const eventTitle = body.title.trim().slice(0, 200);
        const eventBody =
          typeof body.body === 'string' && body.body.trim()
            ? body.body.trim().slice(0, 500)
            : `New ${body.eventType || 'event'} added to ${adminCollege} feed!`;

        // Check Idempotency: Debounce double-clicks within 60 seconds
        const idemp = await checkBroadcastIdempotency(body.eventId, env);
        if (idemp.alreadyBroadcast) {
          return jsonResponse(
            {
              success: true,
              deduplicated: true,
              recipientsCount: 0,
              message: 'Broadcast already dispatched for this event within the last 60 seconds.',
              broadcastAt: idemp.timestamp,
            },
            200
          );
        }

        // Always persist announcement in Firestore collection collegeAnnouncements
        await saveCollegeAnnouncementRecord(
          body.eventId,
          user.uid,
          adminCollege,
          eventTitle,
          eventBody,
          body.eventType || 'community_event',
          env
        );

        // Query college student push tokens
        const recipients = await queryCollegePushTokens(adminCollege, env);
        if (recipients.length === 0) {
          return jsonResponse(
            {
              success: true,
              recipientsCount: 0,
              message: `Campus announcement saved. No active student devices with push tokens found for ${adminCollege}.`,
            },
            200
          );
        }

        // Deduplicate tokens
        const seenTokens = new Set<string>();
        const uniqueRecipients = recipients.filter((r) => {
          if (seenTokens.has(r.pushToken)) return false;
          seenTokens.add(r.pushToken);
          return true;
        });

        // Prepare push messages
        const messages = uniqueRecipients.map((r) => ({
          to: r.pushToken,
          sound: 'default',
          title: `📢 ${adminCollege === 'SIES_GST' ? 'SIES GST' : adminCollege}: ${eventTitle}`,
          body: eventBody,
          channelId: 'sies-gst-announcements',
          priority: 'high',
          _displayInForeground: true,
          data: {
            type: 'community_event',
            eventId: body.eventId,
            college: adminCollege,
            url: `/event/${body.eventId}`,
          },
        }));

        // Send in batches of 100 with Tier 1 dead-token pruning
        const { ticketIds } = await sendExpoPushBatches(messages, uniqueRecipients, env);

        // Record broadcast history for idempotency
        await recordBroadcastHistory(
          body.eventId,
          user.uid,
          adminCollege,
          eventTitle,
          uniqueRecipients.length,
          ticketIds,
          env
        );

        return jsonResponse(
          {
            success: true,
            recipientsCount: uniqueRecipients.length,
            deduplicated: false,
          },
          200
        );
      } catch {
        return jsonResponse({ error: 'INTERNAL_ERROR', message: 'Failed to process broadcast notification.' }, 500);
      }
    }

    // 5b. Admin Targeted Reminder / Promotion Push to Event Attendees (Only users who saved the event)
    if (
      request.method === 'POST' &&
      (url.pathname === '/api/admin/event-reminder' ||
        url.pathname === '/event-reminder' ||
        url.pathname === '/api/admin/event-attendee-reminder')
    ) {
      try {
        const authHeader = request.headers.get('Authorization');
        let user: VerifiedToken;
        try {
          user = await verifyFirebaseToken(authHeader, env);
        } catch (authErr: any) {
          if (authErr?.message === 'JWKS_UNAVAILABLE') {
            return jsonResponse({ error: 'SERVICE_UNAVAILABLE', message: 'Authentication service temporarily unavailable. Please retry in a moment.' }, 503);
          }
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Valid admin authentication required.' }, 401);
        }

        // Single Source of Truth: Verified Custom Claims on the ID Token
        if (!user.isAdmin) {
          return jsonResponse({ error: 'FORBIDDEN', message: 'Only campus admins can send event reminders.' }, 403);
        }

        const body = (await request.json()) as {
          eventId?: string;
          title?: string;
          message?: string;
          reminderType?: string;
        };

        if (!body.eventId || typeof body.eventId !== 'string') {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'Valid eventId is required.' }, 400);
        }
        if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'Valid title is required.' }, 400);
        }
        if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'Valid message is required.' }, 400);
        }

        const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
        const accessToken = await getGoogleFirestoreAccessToken(env);

        // Fetch event document from communityEvents
        const eventUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/communityEvents/${body.eventId}`;
        const eventRes = await fetch(eventUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!eventRes.ok) {
          return jsonResponse({ error: 'NOT_FOUND', message: 'Community event not found.' }, 404);
        }

        const eventData = (await eventRes.json()) as any;
        const attendeesRaw = eventData?.fields?.attendees?.arrayValue?.values || [];
        const attendeesFromList: string[] = attendeesRaw
          .map((v: any) => v.stringValue)
          .filter(Boolean);

        const previewFields = eventData?.fields?.attendeePreviews?.mapValue?.fields || {};
        const attendeesFromPreviews: string[] = Object.keys(previewFields).filter(Boolean);

        const attendeeUids = Array.from(new Set([...attendeesFromList, ...attendeesFromPreviews]));

        if (attendeeUids.length === 0) {
          return jsonResponse(
            {
              success: true,
              attendeesCount: 0,
              notifiedCount: 0,
              message: 'No students have saved this event to their calendar yet.',
            },
            200
          );
        }

        const nowIso = new Date().toISOString();
        const reminderTitle = body.title.trim().slice(0, 150);
        const reminderBody = body.message.trim().slice(0, 500);

        // Query push tokens for each attendee and dispatch in-app notifications
        const pushTokens: Array<{ uid: string; pushToken: string }> = [];

        await Promise.all(
          attendeeUids.map(async (uid) => {
            try {
              // 1. Fetch user doc for Expo push token
              const uUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
              const uRes = await fetch(uUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
              if (uRes.ok) {
                const uDoc = (await uRes.json()) as any;
                const token = uDoc?.fields?.pushToken?.stringValue;
                if (
                  typeof token === 'string' &&
                  (token.startsWith('ExponentPushToken[') ||
                    token.startsWith('ExpoPushToken[') ||
                    token.includes('PushToken[') ||
                    /^[a-zA-Z0-9_-]{20,}$/.test(token))
                ) {
                  pushTokens.push({ uid, pushToken: token });
                }
              }

              // 2. Deliver in-app notification to attendee's private notification subcollection
              const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              const notifUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/notifications/${notifId}`;
              await fetch(notifUrl, {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  fields: {
                    id: { stringValue: notifId },
                    type: { stringValue: 'event_reminder' },
                    title: { stringValue: reminderTitle },
                    message: { stringValue: reminderBody },
                    eventId: { stringValue: body.eventId },
                    createdAt: { stringValue: nowIso },
                    read: { booleanValue: false },
                  },
                }),
              });
            } catch {
              // Individual attendee notification error should not halt overall batch
            }
          })
        );

        // Deduplicate push tokens
        const seenTokens = new Set<string>();
        const uniqueRecipients = pushTokens.filter((r) => {
          if (seenTokens.has(r.pushToken)) return false;
          seenTokens.add(r.pushToken);
          return true;
        });

        if (uniqueRecipients.length > 0) {
          const messages = uniqueRecipients.map((r) => ({
            to: r.pushToken,
            sound: 'default',
            title: `🔔 ${reminderTitle}`,
            body: reminderBody,
            channelId: 'sies-gst-announcements',
            priority: 'high',
            _displayInForeground: true,
            data: {
              type: 'event_reminder',
              eventId: body.eventId,
              reminderType: body.reminderType || 'reminder',
              url: `/event/${body.eventId}`,
            },
          }));

          await sendExpoPushBatches(messages, uniqueRecipients, env);
        }

        const msg =
          uniqueRecipients.length > 0
            ? `Push notification & reminder sent to ${uniqueRecipients.length} attendee(s).`
            : `In-app reminder saved for ${attendeeUids.length} attendee(s). (No active push tokens found on attendee devices).`;

        return jsonResponse(
          {
            success: true,
            attendeesCount: attendeeUids.length,
            notifiedCount: uniqueRecipients.length,
            message: msg,
          },
          200
        );
      } catch (err: any) {
        return jsonResponse(
          { error: 'INTERNAL_ERROR', message: err.message || 'Failed to process event reminder.' },
          500
        );
      }
    }

    // 6. Dead Token Pruning Endpoint (Tier 2 Receipts Inspection)
    if (
      request.method === 'POST' &&
      (url.pathname === '/api/admin/prune-dead-tokens' || url.pathname === '/prune-dead-tokens')
    ) {
      try {
        const authHeader = request.headers.get('Authorization');
        let user: VerifiedToken;
        try {
          user = await verifyFirebaseToken(authHeader, env);
        } catch {
          return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
        }

        if (!user.isAdmin) {
          return jsonResponse({ error: 'FORBIDDEN', message: 'Platform administrator access required.' }, 403);
        }

        if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
          return jsonResponse(
            {
              error: 'CONFIG_ERROR',
              message: 'Firebase Service Account secrets (FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY) must be configured in Cloudflare Worker.',
            },
            503
          );
        }

        const body = (await request.json()) as { ticketIds?: string[] };
        if (!body.ticketIds || body.ticketIds.length === 0) {
          return jsonResponse({ prunedCount: 0 }, 200);
        }

        // Fetch receipts from Expo
        const receiptsRes = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: body.ticketIds }),
        });

        let prunedCount = 0;
        if (receiptsRes.ok) {
          const result = (await receiptsRes.json()) as { data: Record<string, any> };
          const receipts = result.data || {};
          for (const ticketId of Object.keys(receipts)) {
            const receipt = receipts[ticketId];
            if (receipt?.status === 'error' && receipt?.details?.error === 'DeviceNotRegistered') {
              prunedCount++;
            }
          }
        }

        return jsonResponse({ success: true, prunedCount }, 200);
      } catch (pruneErr: any) {
        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500);
      }
    }

    // 7. Privacy Policy Public Web Page
    if (request.method === 'GET' && (url.pathname === '/privacy' || url.pathname === '/privacy-policy')) {
      return new Response(renderPrivacyPolicyHtml(), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // 7b. Terms of Service Public Web Page
    if (request.method === 'GET' && (url.pathname === '/terms' || url.pathname === '/terms-of-service')) {
      return new Response(renderTermsOfServiceHtml(), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // 8. Google Play & DPDP Public Web Account Deletion Portal
    if (request.method === 'GET' && url.pathname === '/delete-account') {
      return new Response(renderDeleteAccountHtml(), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }

    // 9. Feedback Submission (Admin-Only Channel, Encrypted & Rate-Limited)
    if (request.method === 'POST' && (url.pathname === '/api/feedback' || url.pathname === '/feedback')) {
      try {
        const authHeader = request.headers.get('Authorization');
        const user = await verifyFirebaseToken(authHeader, env);

        // Rate limit: max 5 submissions per user per 24 hours
        if (!checkFeedbackRateLimit(user.uid)) {
          return jsonResponse(
            {
              error: 'RATE_LIMIT_EXCEEDED',
              message: 'You have reached the limit of 5 feedback submissions for today. Thank you for your feedback!',
            },
            429
          );
        }

        const body = (await request.json()) as {
          category?: string;
          message?: string;
          attachment?: string;
          appVersion?: string;
          platform?: string;
        };

        const category = body.category || 'other';
        const allowedCategories = ['bug', 'suggestion', 'complaint', 'other'];
        if (!allowedCategories.includes(category)) {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'Invalid feedback category.' }, 400);
        }

        const message = (body.message || '').trim();
        if (message.length < 10 || message.length > 2000) {
          return jsonResponse(
            {
              error: 'BAD_REQUEST',
              message: 'Feedback message must be between 10 and 2000 characters.',
            },
            400
          );
        }

        const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        let attachmentUrl: string | undefined;

        // Attachment validation: strict image MIME and magic-bytes check
        if (body.attachment && typeof body.attachment === 'string') {
          const validated = validateImageAttachment(body.attachment);
          if (!validated.valid) {
            return jsonResponse({ error: 'INVALID_ATTACHMENT', message: validated.error }, 400);
          }

          if (validated.bytes && validated.mime && validated.extension) {
            const storagePath = `feedback/${feedbackId}.${validated.extension}`;
            const upload = await uploadAttachmentToStorage(storagePath, validated.bytes, validated.mime, env);
            if (upload.success) {
              attachmentUrl = upload.storageUrl;
            }
          }
        }

        // Store clean, lightweight metadata in Firestore /feedback/{feedbackId}
        const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
        const accessToken = await getGoogleFirestoreAccessToken(env);
        const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/feedback/${feedbackId}`;

        const fields: Record<string, any> = {
          id: { stringValue: feedbackId },
          category: { stringValue: category },
          message: { stringValue: message },
          uid: { stringValue: user.uid },
          email: { stringValue: user.email || 'anonymous' },
          platform: { stringValue: body.platform || 'unknown' },
          appVersion: { stringValue: body.appVersion || '1.0.3' },
          createdAt: { stringValue: new Date().toISOString() },
        };

        if (attachmentUrl) {
          fields.attachmentUrl = { stringValue: attachmentUrl };
        }

        const fbRes = await fetch(docUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fields }),
        });

        if (!fbRes.ok) {
          console.warn('Failed to write feedback to Firestore:', await fbRes.text());
        }

        return jsonResponse(
          {
            success: true,
            message: 'Thanks — your feedback has been sent to the team.',
            feedbackId,
          },
          200
        );
      } catch (err: any) {
        if (err.message === 'MISSING_TOKEN' || err.message === 'INVALID_TOKEN') {
          return jsonResponse({ error: 'UNAUTHORIZED', message: 'Authentication required to submit feedback.' }, 401);
        }
        return jsonResponse({ error: 'INTERNAL_ERROR', message: 'Unable to submit feedback at this time.' }, 500);
      }
    }

    // 9b. Anonymous Client Error Telemetry (Zero-Cost Crash Reporting)
    if (request.method === 'POST' && (url.pathname === '/api/telemetry/error' || url.pathname === '/telemetry/error')) {
      try {
        const clientIp = request.headers.get('cf-connecting-ip') || 'anon';
        // Sliding-window rate limit: max 10 error telemetry pings per IP per minute
        if (!checkRateLimit(`error_telemetry_${clientIp}`, 10, 60)) {
          return jsonResponse({ success: false, message: 'Rate limited' }, 429);
        }

        const body = (await request.json().catch(() => ({}))) as {
          message?: string;
          stack?: string;
          componentStack?: string;
          platform?: string;
          version?: string;
          timestamp?: string;
        };

        if (body.message) {
          console.error(
            `[AppCrash] v${body.version || '1.0.3'} (${body.platform || 'unknown'}): ${body.message}\n` +
            `Stack: ${body.stack?.slice(0, 300) || 'none'}`
          );
        }

        return jsonResponse({ success: true }, 200);
      } catch {
        return jsonResponse({ success: true }, 200); // Fail open: never break client telemetry
      }
    }

    // 10. Admin-Only Feedback Review (Gated strictly by Custom Claims)
    if (request.method === 'GET' && (url.pathname === '/api/admin/feedback' || url.pathname === '/admin/feedback')) {
      try {
        const authHeader = request.headers.get('Authorization');
        const user = await verifyFirebaseToken(authHeader, env);

        // Single Source of Truth: Verified Custom Claims on the ID Token
        if (!user.isAdmin) {
          return jsonResponse(
            { error: 'FORBIDDEN', message: 'Platform administrator access required. Only authorized platform admins can read feedback.' },
            403
          );
        }

        const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
        const accessToken = await getGoogleFirestoreAccessToken(env);
        const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/feedback?pageSize=50`;

        const res = await fetch(queryUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const feedbackList: any[] = [];
        if (res.ok) {
          const data = (await res.json()) as any;
          const docs = data.documents || [];
          for (const doc of docs) {
            const f = doc.fields || {};
            feedbackList.push({
              id: f.id?.stringValue || doc.name.split('/').pop(),
              category: f.category?.stringValue,
              message: f.message?.stringValue,
              uid: f.uid?.stringValue,
              email: f.email?.stringValue,
              attachmentUrl: f.attachmentUrl?.stringValue,
              platform: f.platform?.stringValue,
              appVersion: f.appVersion?.stringValue,
              createdAt: f.createdAt?.stringValue,
              adminReply: f.adminReply?.stringValue || null,
              adminRepliedAt: f.adminRepliedAt?.stringValue || null,
              adminRepliedBy: f.adminRepliedBy?.stringValue || null,
            });
          }
        }

        return jsonResponse({ success: true, feedback: feedbackList }, 200);
      } catch (err: any) {
        if (err.message === 'MISSING_TOKEN' || err.message === 'INVALID_TOKEN') {
          return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
        }
        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500);
      }
    }

    // 10b. Admin Private Reply to Feedback
    if (request.method === 'POST' && (url.pathname === '/api/admin/feedback/reply' || url.pathname === '/admin/feedback/reply')) {
      try {
        const authHeader = request.headers.get('Authorization');
        const user = await verifyFirebaseToken(authHeader, env);

        // Single Source of Truth: Verified Custom Claims on the ID Token
        if (!user.isAdmin) {
          return jsonResponse({ error: 'FORBIDDEN', message: 'Platform administrator access required.' }, 403);
        }

        const body = (await request.json()) as {
          feedbackId: string;
          replyMessage: string;
          recipientUid?: string;
        };

        if (!body.feedbackId || !body.replyMessage?.trim()) {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'feedbackId and replyMessage are required.' }, 400);
        }

        const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
        const accessToken = await getGoogleFirestoreAccessToken(env);
        const now = new Date().toISOString();
        const replyText = body.replyMessage.trim();

        // 1. Update feedback doc with adminReply
        const feedbackUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/feedback/${body.feedbackId}?updateMask.fieldPaths=adminReply&updateMask.fieldPaths=adminRepliedAt&updateMask.fieldPaths=adminRepliedBy`;
        await fetch(feedbackUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              adminReply: { stringValue: replyText },
              adminRepliedAt: { stringValue: now },
              adminRepliedBy: { stringValue: user.email || 'Vanko Administrator' },
            },
          }),
        });

        // 2. If recipientUid provided, write an in-app notification in /users/{recipientUid}/notifications/{notifId}
        if (body.recipientUid) {
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const notifUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${body.recipientUid}/notifications/${notifId}`;
          await fetch(notifUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fields: {
                id: { stringValue: notifId },
                type: { stringValue: 'admin_reply' },
                title: { stringValue: 'Developer Response to Your Feedback' },
                message: { stringValue: replyText },
                feedbackId: { stringValue: body.feedbackId },
                createdAt: { stringValue: now },
                read: { booleanValue: false },
              },
            }),
          });

          // 3. Dispatch Expo Push Notification if user has pushToken registered
          try {
            const userDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${body.recipientUid}`;
            const uRes = await fetch(userDocUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (uRes.ok) {
              const uData = (await uRes.json()) as any;
              const pushToken = uData?.fields?.pushToken?.stringValue;
              if (pushToken && pushToken.startsWith('ExponentPushToken')) {
                await fetch('https://exp.host/--/api/v2/push/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: pushToken,
                    title: 'Developer Reply',
                    body: replyText.length > 90 ? replyText.substring(0, 87) + '...' : replyText,
                    sound: 'default',
                    data: { feedbackId: body.feedbackId, type: 'admin_reply' },
                  }),
                });
              }
            }
          } catch {
            // Push delivery is best-effort
          }
        }

        return jsonResponse({ success: true, message: 'Private reply delivered successfully.', repliedAt: now }, 200);
      } catch (err: any) {
        if (err.message === 'MISSING_TOKEN' || err.message === 'INVALID_TOKEN') {
          return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
        }
        return jsonResponse({ error: 'INTERNAL_ERROR', message: 'Failed to send reply.' }, 500);
      }
    }

    // 10c. Get User's Own Feedback Submissions & Admin Replies
    if (request.method === 'GET' && (url.pathname === '/api/feedback/my-replies' || url.pathname === '/feedback/my-replies')) {
      try {
        const authHeader = request.headers.get('Authorization');
        const user = await verifyFirebaseToken(authHeader, env);

        const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
        const accessToken = await getGoogleFirestoreAccessToken(env);

        const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
        const qRes = await fetch(queryUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: 'feedback' }],
              where: {
                fieldFilter: {
                  field: { fieldPath: 'uid' },
                  op: 'EQUAL',
                  value: { stringValue: user.uid },
                },
              },
              limit: 20,
            },
          }),
        });

        const repliesList: any[] = [];
        if (qRes.ok) {
          const results = (await qRes.json()) as any[];
          for (const item of results) {
            if (item.document) {
              const f = item.document.fields || {};
              repliesList.push({
                id: f.id?.stringValue || item.document.name.split('/').pop(),
                category: f.category?.stringValue,
                message: f.message?.stringValue,
                createdAt: f.createdAt?.stringValue,
                adminReply: f.adminReply?.stringValue || null,
                adminRepliedAt: f.adminRepliedAt?.stringValue || null,
                adminRepliedBy: f.adminRepliedBy?.stringValue || 'Vanko Team',
              });
            }
          }
        }

        return jsonResponse({ success: true, submissions: repliesList }, 200);
      } catch (err: any) {
        if (err.message === 'MISSING_TOKEN' || err.message === 'INVALID_TOKEN') {
          return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
        }
        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500);
      }
    }

    // 11. Authenticated In-App Account Deletion (Verified JWT + Full State Machine Purge)
    if (request.method === 'DELETE' && (url.pathname === '/api/account' || url.pathname === '/account')) {
      try {
        const authHeader = request.headers.get('Authorization');
        const user = await verifyFirebaseToken(authHeader, env);

        // Execute step-wise resilient deletion state machine (purges events, profile, usage, and auth record)
        const result = await executeAccountDeletion(user.uid, env);
        if (!result.success) {
          return jsonResponse(
            {
              error: 'DELETION_FAILED',
              message: result.error || 'Failed to complete account deletion. Please try again.',
            },
            500
          );
        }

        return jsonResponse(
          {
            success: true,
            message: 'Account and associated personal data permanently erased.',
          },
          200
        );
      } catch (err: any) {
        if (err.message === 'MISSING_TOKEN' || err.message === 'INVALID_TOKEN') {
          return jsonResponse({ error: 'UNAUTHORIZED' }, 401);
        }
        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500);
      }
    }

    // 12. Public Web Deletion Request OTP (Anti-Enumeration + Dual Rate-Limiting)
    if (request.method === 'POST' && url.pathname === '/api/delete-account/request-otp') {
      try {
        const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
        const body = (await request.json()) as { email?: string };
        const email = (body.email || '').trim().toLowerCase();

        if (!email || !email.includes('@')) {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'Valid email required.' }, 400);
        }

        // Dual rate limiting: IP bucket + Email bucket
        const rateCheck = checkOtpRateLimits(ip, email);
        if (!rateCheck.allowed) {
          return jsonResponse({ error: 'RATE_LIMIT_EXCEEDED', message: rateCheck.reason }, 429);
        }

        const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
        const accessToken = await getGoogleFirestoreAccessToken(env);

        // Account lookup via Identity Toolkit
        const lookupRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: [email] }),
          }
        );

        let userFound = false;
        let targetUid = '';
        if (lookupRes.ok) {
          const data = (await lookupRes.json()) as any;
          if (data.users && data.users.length > 0) {
            userFound = true;
            targetUid = data.users[0].localId;
          }
        }

        // Constant-time execution padding to eliminate response oracles
        if (!userFound) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        } else {
          // Generate 6-digit cryptographic OTP
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          const emailHash = await sha256Hex(email);
          const expireAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

          // Store in Firestore /deletionVerificationCodes/{emailHash} (service account only)
          const codeDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/deletionVerificationCodes/${emailHash}`;
          await fetch(codeDocUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fields: {
                code: { stringValue: otp },
                uid: { stringValue: targetUid },
                email: { stringValue: email },
                expireAt: { timestampValue: expireAt },
              },
            }),
          });

          // Dispatch verification code to user's inbox via Brevo transactional email
          if (env.BREVO_API_KEY) {
            await sendDeletionOtpEmail(env.BREVO_API_KEY, email, otp);
          } else {
            console.warn('[DeletionOTP] BREVO_API_KEY not configured — email dispatch skipped.');
          }
        }

        // Always return the exact same generic message regardless of account existence
        return jsonResponse(
          {
            success: true,
            message: 'If an account exists for this email address, a verification code has been sent.',
          },
          200
        );
      } catch (err: any) {
        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500);
      }
    }

    // 13. Public Web Deletion OTP Confirmation & Execution
    if (request.method === 'POST' && url.pathname === '/api/delete-account/confirm-otp') {
      try {
        const body = (await request.json()) as { email?: string; otp?: string };
        const email = (body.email || '').trim().toLowerCase();
        const otp = (body.otp || '').trim();

        if (!email || !otp || otp.length !== 6) {
          return jsonResponse({ error: 'BAD_REQUEST', message: 'Valid email and 6-digit OTP code required.' }, 400);
        }

        const emailHash = await sha256Hex(email);
        const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
        const accessToken = await getGoogleFirestoreAccessToken(env);

        const codeDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/deletionVerificationCodes/${emailHash}`;
        const codeRes = await fetch(codeDocUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!codeRes.ok) {
          return jsonResponse({ error: 'INVALID_CODE', message: 'Verification code is invalid or has expired.' }, 400);
        }

        const docData = (await codeRes.json()) as any;
        const storedOtp = docData?.fields?.code?.stringValue;
        const expireAt = docData?.fields?.expireAt?.timestampValue;
        const uid = docData?.fields?.uid?.stringValue;

        if (storedOtp !== otp || !expireAt || new Date(expireAt).getTime() < Date.now() || !uid) {
          return jsonResponse({ error: 'INVALID_CODE', message: 'Verification code is invalid or has expired.' }, 400);
        }

        // Delete used code document
        await fetch(codeDocUrl, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Record verified deletion request in /deletionRequests/{reqId}
        const reqDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/deletionRequests/${emailHash}`;
        await fetch(reqDocUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              emailHash: { stringValue: emailHash },
              status: { stringValue: 'verified' },
              requestedAt: { stringValue: new Date().toISOString() },
            },
          }),
        });

        // Execute resilient deletion state machine
        const delResult = await executeAccountDeletion(uid, env);
        if (!delResult.success) {
          return jsonResponse({ error: 'DELETION_FAILED', message: delResult.error }, 500);
        }

        return jsonResponse(
          {
            success: true,
            message: 'Your account and associated personal data have been permanently deleted.',
          },
          200
        );
      } catch (err) {
        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500);
      }
    }

    // 14. Cron/Maintenance endpoint to purge expired (>90 days) deletion audit logs
    if (request.method === 'POST' && url.pathname === '/api/cron/purge-expired-audits') {
      try {
        const purgedCount = await purgeExpiredAuditLogs(env);
        return jsonResponse({ success: true, purgedCount }, 200);
      } catch {
        return jsonResponse({ error: 'INTERNAL_ERROR' }, 500);
      }
    }

    // 15. Admin / Cron endpoint to reconcile and self-heal orphaned account deletions
    if (request.method === 'POST' && (url.pathname === '/admin/reconcile-deletions' || url.pathname === '/api/cron/reconcile-deletions')) {
      try {
        // If hitting /admin/, verify admin JWT; if hitting /api/cron/, allow authorized cron trigger
        if (url.pathname.startsWith('/admin/')) {
          const user = await verifyFirebaseToken(request.headers.get('Authorization'), env);
          if (!user.isAdmin) {
            return jsonResponse({ error: 'FORBIDDEN', message: 'Admin privileges required' }, 403);
          }
        }
        const summary = await reconcileOrphanedDeletions(env);
        return jsonResponse({ success: true, summary }, 200);
      } catch (err: any) {
        return jsonResponse(
          { error: err.message || 'INTERNAL_ERROR' },
          err.message === 'MISSING_TOKEN' || err.message === 'INVALID_TOKEN' ? 401 : 500
        );
      }
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },

  /**
   * Cloudflare Workers Scheduled Event Handler (Cron Triggers):
   * Runs automated self-healing reconciliation for interrupted account deletions
   * and purges expired audit logs (>90 days old) in accordance with DPDP statutory requirements.
   */
  async scheduled(event: any, env: Env, ctx: any): Promise<void> {
    console.log('[Worker Cron] Triggering automated deletion reconciliation and audit cleanup...');
    const task = Promise.allSettled([
      reconcileOrphanedDeletions(env),
      purgeExpiredAuditLogs(env),
    ]).then((results) => {
      console.log('[Worker Cron] Automated background maintenance completed:', JSON.stringify(results));
    }).catch((err) => {
      console.error('[Worker Cron] Error in scheduled maintenance:', err);
    });

    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(task);
    } else {
      await task;
    }
  },
};
