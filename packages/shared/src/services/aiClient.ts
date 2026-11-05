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
  const trimmedText = rawText ? rawText.trim() : '';
  const hasImage = Boolean(options?.imageBase64 && options.imageBase64.length > 50);

  if (!trimmedText && !hasImage) {
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
    'https://vanko-api.vanko-app.workers.dev';

  if (!workerUrl) {
    throw new AIClientError(
      'The extraction service is currently unavailable. Please try again shortly.',
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

  // Hard 25-second timeout via AbortController for vision/text extractions
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  const requestBody: Record<string, any> = {
    referenceDate: referenceDate.toISOString(),
  };

  if (trimmedText) {
    requestBody.text = trimmedText;
  }

  if (hasImage) {
    requestBody.imageBase64 = options?.imageBase64;
    requestBody.mimeType = options?.mimeType || 'image/jpeg';
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new AIClientError(
        'The request timed out. Please check your connection and try again.',
        408,
        'TIMEOUT'
      );
    }
    throw new AIClientError(
      'Unable to connect to the server. Please check your internet connection.',
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
        errorDetail || 'Your session has expired. Please sign in again to continue.',
        401,
        'UNAUTHORIZED'
      );
    }

    if (res.status === 429) {
      throw new AIClientError(
        errorDetail || 'Daily schedule scan limit reached. Your allowance refreshes tomorrow at midnight.',
        429,
        'QUOTA_EXCEEDED'
      );
    }

    if (res.status >= 500) {
      throw new AIClientError(
        errorDetail || 'The service is temporarily unavailable. Please try again shortly.',
        res.status,
        'UPSTREAM_ERROR'
      );
    }

    throw new AIClientError(
      errorDetail || `Unable to complete request (${res.status}). Please try again shortly.`,
      res.status,
      'REQUEST_FAILED'
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch (jsonErr) {
    throw new AIClientError(
      'Unable to process event details. Please verify the information and try again.',
      502,
      'INVALID_RESPONSE'
    );
  }

  const rawEvents = Array.isArray(data?.events) ? data.events : [];
  const normalizedEvents: ExtractedEvent[] = rawEvents.map((rawEvent: any, index: number) => {
    const confidence = typeof rawEvent.confidence_score === 'number'
      ? Math.max(0, Math.min(1, rawEvent.confidence_score))
      : 0.85;

    const extractionConfidence = ['high', 'medium', 'low'].includes(rawEvent.extraction_confidence)
      ? rawEvent.extraction_confidence
      : (confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low');

    const linkStatus = ['found', 'mentioned_in_comments', 'none'].includes(rawEvent.link_status)
      ? rawEvent.link_status
      : (rawEvent.registration_link ? 'found' : 'none');

    const legibility = ['high', 'medium', 'low'].includes(rawEvent.legibility)
      ? rawEvent.legibility
      : 'high';

    const isPast = Boolean(rawEvent.is_past_event);
    const requiresReview = isPast || extractionConfidence === 'low' || legibility === 'low';

    return {
      temp_id: rawEvent.temp_id || `ext_${Date.now()}_${index}`,
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
      raw_text: trimmedText || '[Visual Extraction]',
      confidence_score: confidence,
      extraction_confidence: extractionConfidence,
      link_status: linkStatus,
      legibility,
      is_past_event: isPast,
      requires_review: requiresReview,
      tags: [rawEvent.type || 'other', rawEvent.mode || 'online'],
      reminder_offsets: [4320, 1440, 0],
    };
  });

  return {
    events: normalizedEvents,
    tier_used: data.tier_used || (hasImage ? 'tier2_vision' : 'tier1_text'),
    raw_input: trimmedText || (hasImage ? '[Image Poster Extraction]' : ''),
    extracted_at: data.extracted_at || new Date().toISOString(),
    quota: data.quota,
  };
}

/**
 * Extract structured calendar events from an image/poster screenshot (Tier 2 Vision).
 */
export async function extractEventsFromImage(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
  rawText?: string,
  options?: ExtractEventsOptions
): Promise<ExtractResponse> {
  return extractEventsFromText(rawText || '', {
    ...options,
    imageBase64,
    mimeType,
  });
}

/** Fetch user's current daily extraction quota without triggering an extraction */
export async function getExtractionQuota(
  options?: ExtractEventsOptions
): Promise<ExtractionQuotaInfo> {
  const workerUrl =
    options?.workerUrl ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_WORKER_URL) ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) ||
    'https://vanko-api.vanko-app.workers.dev';

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
