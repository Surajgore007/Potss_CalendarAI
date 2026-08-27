import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface Env {
  GROQ_API_KEY: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  ENVIRONMENT?: string;
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
async function verifyFirebaseToken(
  authHeader: string | null,
  env: Env
): Promise<{ uid: string; email?: string }> {
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

    return {
      uid: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch (err: any) {
    console.error('JWT Verification failed:', err.message);
    throw new Error('INVALID_TOKEN');
  }
}

/** Check if user is platform admin or student */
async function getUserRole(uid: string, env: Env): Promise<'admin' | 'student'> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;

  try {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
    const res = await fetch(url);
    if (res.ok) {
      const doc = (await res.json()) as any;
      const role = doc?.fields?.role?.stringValue;
      if (role === 'admin') return 'admin';
    }
  } catch (e) {
    console.warn('Role lookup warning:', e);
  }

  return 'student';
}

/**
 * Check and atomically increment daily quota in Firestore:
 * - Uses today's date in IST (Asia/Kolkata)
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
    // 1. Fetch current usage document from Firestore REST
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/extractionUsage/${usageKey}`;
    const getRes = await fetch(docUrl);

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
      headers: { 'Content-Type': 'application/json' },
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
  } catch (err) {
    console.warn('Quota processing warning:', err);
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
      time: 'HH:MM or null',
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

    // 2. Health check endpoint
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return jsonResponse({ status: 'ok', service: 'Vanko AI Worker', version: '2.0.0' }, 200);
    }

    // 2b. Models check endpoint
    if (request.method === 'GET' && url.pathname === '/models') {
      try {
        const apiKey = env.GROQ_API_KEY;
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
        const role = await getUserRole(user.uid, env);
        const isAdmin = role === 'admin';
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
        let user: { uid: string; email?: string };

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

        const role = await getUserRole(user.uid, env);
        const isAdmin = role === 'admin';

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

        const apiKey = env.GROQ_API_KEY;
        if (!apiKey) {
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

        for (const candidateModel of CANDIDATE_MODELS) {
          try {
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
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
            } else {
              const errBody = await groqResponse.text();
              lastError = `[${candidateModel}] Status ${groqResponse.status}: ${errBody}`;
              console.warn(`Groq model ${candidateModel} failed:`, lastError);
            }
          } catch (modelErr: any) {
            lastError = `[${candidateModel}] ${modelErr?.message || 'Fetch failed'}`;
            console.warn(`Groq candidate ${candidateModel} threw error:`, lastError);
          }
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
            raw_input: rawText,
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
        console.error('Worker extraction error:', err);
        return jsonResponse({ error: 'Internal Server Error' }, 500);
      }
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
