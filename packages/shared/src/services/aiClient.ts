import { ExtractResponse, ExtractEventsOptions } from '../types/ai';
import { ExtractedEvent, ExtractionQuotaInfo } from '../types/event';
import { isValidDateFormat, sanitizeUrl } from '../utils/validation';

export class AIClientError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'AIClientError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Extract structured calendar events from informal text via Cloudflare Worker proxy.
 * Worker routes request to Groq without client-side API key exposure.
 */
export async function extractEventsFromText(
  rawText: string,
  options?: ExtractEventsOptions
): Promise<ExtractResponse> {
  const trimmedText = rawText.trim();
  if (!trimmedText) {
    return {
      events: [],
      raw_input: rawText,
      extracted_at: new Date().toISOString(),
    };
  }

  const workerUrl =
    options?.workerUrl ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_WORKER_URL) ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
    'https://eventpulse-api.surajgore.workers.dev';

  if (!workerUrl) {
    throw new AIClientError(
      'AI Extraction service URL is not configured. Set EXPO_PUBLIC_WORKER_URL.',
      500,
      'CONFIG_MISSING'
    );
  }

  const endpoint = workerUrl.endsWith('/api/extract')
    ? workerUrl
    : `${workerUrl.replace(/\/$/, '')}/api/extract`;

  // Retrieve fresh Firebase ID Token if getter is provided
  let idToken: string | null = null;
  if (options?.getIdToken) {
    try {
      idToken = await options.getIdToken();
    } catch (tokenErr) {
      console.warn('Could not obtain Firebase ID token before extraction:', tokenErr);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }

  const referenceDate = options?.referenceDate || new Date();

  // Hard 20-second timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text: trimmedText,
        referenceDate: referenceDate.toISOString(),
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new AIClientError(
        'AI Extraction request timed out after 20 seconds. Please try with shorter text.',
        408,
        'TIMEOUT'
      );
    }
    throw new AIClientError(
      `Network error connecting to extraction worker: ${err.message || 'Connection failed'}`,
      0,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = (errJson as any)?.error || (errJson as any)?.message || '';
    } catch {
      // Non-JSON response
    }

    if (res.status === 401) {
      throw new AIClientError(
        errorDetail || 'Your session expired. Please sign in again to use AI extraction.',
        401,
        'UNAUTHORIZED'
      );
    }

    if (res.status === 429) {
      throw new AIClientError(
        errorDetail || "You've reached your limit of 3 extractions for today. New extractions unlock tomorrow.",
        429,
        'QUOTA_EXCEEDED'
      );
    }

    if (res.status >= 500) {
      throw new AIClientError(
        errorDetail || 'The AI extraction service is temporarily unavailable. Please try again shortly.',
        res.status,
        'UPSTREAM_ERROR'
      );
    }

    throw new AIClientError(
      errorDetail || `Extraction request failed with status ${res.status}`,
      res.status,
      'REQUEST_FAILED'
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch (jsonErr) {
    throw new AIClientError(
      'Received invalid JSON response from extraction worker.',
      502,
      'INVALID_RESPONSE'
    );
  }

  const rawEvents = Array.isArray(data?.events) ? data.events : [];
  const normalizedEvents: ExtractedEvent[] = rawEvents.map((rawEvent: any, index: number) => ({
    temp_id: `ext_${Date.now()}_${index}`,
    title: rawEvent.title?.trim() || 'Untitled Event',
    type: ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'].includes(rawEvent.type?.toLowerCase())
      ? rawEvent.type.toLowerCase()
      : 'other',
    event_start_date: isValidDateFormat(rawEvent.event_start_date) ? rawEvent.event_start_date : null,
    event_end_date: isValidDateFormat(rawEvent.event_end_date) ? rawEvent.event_end_date : null,
    registration_deadline: isValidDateFormat(rawEvent.registration_deadline) ? rawEvent.registration_deadline : null,
    time: rawEvent.time?.trim() || null,
    mode: ['online', 'offline', 'hybrid'].includes(rawEvent.mode?.toLowerCase()) ? rawEvent.mode.toLowerCase() : 'online',
    location: rawEvent.location?.trim() || null,
    registration_link: sanitizeUrl(rawEvent.registration_link),
    source_group: rawEvent.source_group?.trim() || null,
    raw_text: trimmedText,
    confidence_score: typeof rawEvent.confidence_score === 'number' ? Math.max(0, Math.min(1, rawEvent.confidence_score)) : 0.85,
    tags: [rawEvent.type || 'other', rawEvent.mode || 'online'],
    reminder_offsets: [4320, 1440, 0],
  }));

  return {
    events: normalizedEvents,
    raw_input: trimmedText,
    extracted_at: data.extracted_at || new Date().toISOString(),
    quota: data.quota,
  };
}

/** Fetch user's current daily extraction quota without triggering an extraction */
export async function getExtractionQuota(
  options?: ExtractEventsOptions
): Promise<ExtractionQuotaInfo> {
  const workerUrl =
    options?.workerUrl ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_WORKER_URL) ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
    'https://eventpulse-api.surajgore.workers.dev';

  const endpoint = workerUrl.endsWith('/api/quota')
    ? workerUrl
    : `${workerUrl.replace(/\/$/, '')}/api/quota`;

  let idToken: string | null = null;
  if (options?.getIdToken) {
    try {
      idToken = await options.getIdToken();
    } catch {
      // Ignored
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

  try {
    const res = await fetch(endpoint, { method: 'GET', headers });
    if (res.ok) {
      const data = await res.json();
      return data as ExtractionQuotaInfo;
    }
  } catch (e) {
    console.warn('Could not fetch extraction quota:', e);
  }

  // Fallback defaults
  return {
    daily_quota: 3,
    used_today: 0,
    remaining: 3,
    unlimited: false,
    reset_at: new Date().toISOString(),
  };
}

// Backward compatibility alias
export const extractEventsWithGroq = extractEventsFromText;
export const extractEvents = extractEventsFromText;
