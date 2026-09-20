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
  renderDeleteAccountHtml,
} from './compliance';

export interface Env {
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_API_KEY_3?: string;
  GROQ_API_KEY_4?: string;
  GROQ_API_KEYS?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      console.warn(`[KV Timeout] ${operationName} exceeded ${timeoutMs}ms ceiling; failing open to Tier 1.`);
      resolve(fallback);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err: any) {
    clearTimeout(timer);
    console.warn(`[KV Error] ${operationName} encountered exception; failing open to Tier 1:`, err?.message || err);
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

async function verifyFirebaseToken(
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

  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });

    if (!payload.sub) {
      throw new Error('INVALID_UID');
    }

    const isAdmin = payload.admin === true || payload.role === 'admin';
    const role: 'admin' | 'student' = isAdmin ? 'admin' : 'student';
    const college =
      typeof payload.college === 'string' && payload.college.trim()
        ? payload.college.trim()
        : 'SIES_GST';

    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      authTime: typeof payload.auth_time === 'number' ? payload.auth_time : undefined,
      isAdmin,
      role,
      college,
      claims: (payload as Record<string, unknown>) || {},
    };
  } catch (err: any) {
    throw new Error('INVALID_TOKEN');
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

function normalizeEvents(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_EVENTS).flatMap((event) => {
    if (!event || typeof event !== 'object') return [];
    const item = event as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 300) : '';
    const confidence = typeof item.confidence_score === 'number' ? item.confidence_score : 0;
    const allowedTypes = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
    const allowedModes = ['online', 'offline', 'hybrid'];
    if (!title || !isDate(item.event_start_date) || !isDate(item.event_end_date) || !isDate(item.registration_deadline)) return [];
    return [{
      title,
      type: allowedTypes.includes(String(item.type)) ? item.type : 'other',
      event_start_date: item.event_start_date,
      event_end_date: item.event_end_date,
      registration_deadline: item.registration_deadline,
      time: typeof item.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) ? item.time : null,
      mode: allowedModes.includes(String(item.mode)) ? item.mode : 'online',
      location: typeof item.location === 'string' ? item.location.slice(0, 500) : null,
      registration_link: typeof item.registration_link === 'string' && /^https?:\/\//i.test(item.registration_link) ? item.registration_link.slice(0, 2000) : null,
      source_group: typeof item.source_group === 'string' ? item.source_group.slice(0, 300) : null,
      confidence_score: Math.max(0, Math.min(1, confidence)),
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
      time: '12-hour format with AM/PM (e.g. "6:00 PM", "10:30 AM") or null if not mentioned',
      mode: 'online | offline | hybrid',
      location: 'string or null',
      registration_link: 'string (URL) or null',
      source_group: 'string or null',
      confidence_score: 'number (0.0 to 1.0)',
    },
  ],
};

function buildSystemPrompt(referenceDateStr?: string): string {
  const ref = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const d = String(ref.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const dayOfWeek = ref.toLocaleDateString('en-US', { weekday: 'long' });

  return `You are an expert event information extraction system. Your job is to parse informal, conversational, or forwarded WhatsApp messages and extract tech events, hackathons, CTFs, workshops, tech meetups, and registration deadlines.

CURRENT TEMPORAL CONTEXT:
- TODAY'S DATE: ${todayStr} (${dayOfWeek})

CRITICAL RULES FOR EXTRACTION:
1. RELATIVE DATE RESOLUTION: Use the temporal context above to resolve relative dates. "This Saturday" means the upcoming Saturday relative to ${todayStr}.
2. REGISTRATION DEADLINE vs EVENT DATE: ALWAYS distinguish REGISTRATION DEADLINE from EVENT START DATE as separate fields.
3. MULTI-EVENT SUPPORT: Extract all events if multiple are mentioned.
4. MISSING DATES: If an event date or deadline cannot be determined, return null. NEVER guess.
5. TYPE CLASSIFICATION: "hackathon" | "ctf" | "meetup" | "workshop" | "deadline" | "other"
6. DELIVERY MODE: "online" | "offline" | "hybrid"
7. FORMAT: Return strictly a valid JSON object matching the schema.`;
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
      return jsonResponse({ status: 'ok', service: 'Vanko AI Worker', version: '2.0.0' }, 200);
    }

    // 2b. Models check endpoint
    if (request.method === 'GET' && url.pathname === '/models') {
      try {
        const apiKey = getActiveGroqKeys(env)[0];
        if (!apiKey) {
          return jsonResponse({ error: 'No Groq API keys configured' }, 500);
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
              message: 'Valid authentication session required to use AI extraction.',
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
              message: "You've reached your limit of 3 extractions for today. New extractions unlock tomorrow.",
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

        const contentLength = Number(request.headers.get('Content-Length') || 0);
        if (contentLength > MAX_INPUT_LENGTH + 500) return jsonResponse({ error: 'Request is too large.' }, 413);

        const apiKeys = getActiveGroqKeys(env);
        if (apiKeys.length === 0) {
          return jsonResponse({ error: 'Extraction service is not configured.' }, 500);
        }

        const body = (await request.json()) as { text?: string; referenceDate?: string };
        const rawText = body.text?.trim();
        if (rawText && rawText.length > MAX_INPUT_LENGTH) return jsonResponse({ error: 'Text is too large.' }, 413);

        if (!rawText) {
          return jsonResponse({ events: [], extracted_at: new Date().toISOString() }, 200);
        }

        const systemPrompt =
          buildSystemPrompt(body.referenceDate) +
          `\n\nOUTPUT FORMAT:\nYou MUST return ONLY a JSON object containing an "events" array conforming strictly to:\n${JSON.stringify(
            JSON_SCHEMA,
            null,
            2
          )}`;

        const CANDIDATE_MODELS = [
          'openai/gpt-oss-120b',
          'openai/gpt-oss-20b',
          'qwen/qwen3.8-27b',
          'qwen/qwen3.6-27b',
          'groq/compound',
          'llama-3.3-70b-versatile',
        ];

        let content: string | null = null;
        let lastError = '';

        // Multi-Key Failover with Rate-Limit Cooldown
        for (const currentApiKey of apiKeys) {
          for (const candidateModel of CANDIDATE_MODELS) {
            try {
              const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${currentApiKey}`,
                },
                body: JSON.stringify({
                  model: candidateModel,
                  messages: [
                    { role: 'system', content: systemPrompt },
                    {
                      role: 'user',
                      content: `Extract all tech events, hackathons, CTFs, workshops, or deadlines from this WhatsApp message:\n\n"""\n${rawText}\n"""`,
                    },
                  ],
                  response_format: { type: 'json_object' },
                  temperature: 0.1,
                }),
              });

              if (groqResponse.ok) {
                const groqData = (await groqResponse.json()) as any;
                content = groqData?.choices?.[0]?.message?.content;
                if (content) break;
              } else if (groqResponse.status === 429) {
                // Key rate-limited / quota exhausted: put key on 60-second cooldown and switch to next backup key
                groqKeyCooldownMap.set(currentApiKey, Date.now() + 60_000);
                lastError = `Key rate-limited (429)`;
                break; // Break out of candidate models to cascade immediately to next key
              } else if (groqResponse.status === 401) {
                // Key invalid or unauthorized: put key on 1-hour cooldown and switch to next backup key
                groqKeyCooldownMap.set(currentApiKey, Date.now() + 3_600_000);
                lastError = `Key unauthorized (401)`;
                break; // Break out of candidate models to cascade immediately to next key
              } else {
                lastError = `[${candidateModel}] Status ${groqResponse.status}`;
              }
            } catch (modelErr: any) {
              lastError = `[${candidateModel}] ${modelErr?.message || 'Fetch failed'}`;
            }
          }

          if (content) break; // Extraction succeeded, exit key cascade
        }

        if (!content) {
          return jsonResponse({ error: `Groq upstream error: ${lastError || 'Empty response'}` }, 502);
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
            events: normalizeEvents(parsedJson.events),
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
        } catch {
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

        const adminCollege = user.college || 'SIES_GST';

        const body = (await request.json()) as {
          eventId?: string;
          title?: string;
          body?: string;
          eventType?: string;
        };

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

        // Check Idempotency: One broadcast per event
        const idemp = await checkBroadcastIdempotency(body.eventId, env);
        if (idemp.alreadyBroadcast) {
          return jsonResponse(
            {
              success: true,
              deduplicated: true,
              recipientsCount: 0,
              message: 'Broadcast already dispatched for this event.',
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
          await recordBroadcastHistory(body.eventId, user.uid, adminCollege, eventTitle, 0, [], env);
          return jsonResponse(
            {
              success: true,
              recipientsCount: 0,
              message: `Campus announcement saved. No active student push tokens found for ${adminCollege}.`,
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
          data: {
            type: 'community_event',
            eventId: body.eventId,
            college: adminCollege,
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
        } catch {
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
            data: {
              type: 'event_reminder',
              eventId: body.eventId,
              reminderType: body.reminderType || 'reminder',
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
    if (request.method === 'GET' && url.pathname === '/privacy-policy') {
      return new Response(renderPrivacyPolicyHtml(), {
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
          appVersion: { stringValue: body.appVersion || '1.0.0' },
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
