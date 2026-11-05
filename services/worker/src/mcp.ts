import { Env, verifyFirebaseToken } from './index';
import { getGoogleFirestoreAccessToken } from './auth/googleServiceAccount';
import { verifyOAuthAccessToken } from './oauth';

export interface VankoMcpEvent {
  id: string;
  title: string;
  type: string;
  event_start_date: string | null;
  event_end_date: string | null;
  registration_deadline: string | null;
  time: string | null;
  mode: string;
  location: string | null;
  registration_link: string | null;
  source_group?: string | null;
  raw_text?: string;
  confidence_score?: number;
  tags?: string[];
  reminder_offsets?: number[];
  status: string;
  created_at: string;
  updated_at: string;
  userId?: string;
  has_critical_alarm?: boolean;
  alarm_offsets?: number[];
  alarm_time_assumed?: boolean;
}

export function firestoreToJs(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(fields || {})) {
    if (!val || typeof val !== 'object') continue;
    if ('stringValue' in val) result[key] = val.stringValue;
    else if ('booleanValue' in val) result[key] = val.booleanValue;
    else if ('integerValue' in val) result[key] = parseInt(val.integerValue, 10);
    else if ('doubleValue' in val) result[key] = parseFloat(val.doubleValue);
    else if ('timestampValue' in val) result[key] = val.timestampValue;
    else if ('nullValue' in val) result[key] = null;
    else if ('arrayValue' in val) {
      result[key] = (val.arrayValue.values || []).map((item: any) => {
        if ('stringValue' in item) return item.stringValue;
        if ('integerValue' in item) return parseInt(item.integerValue, 10);
        if ('booleanValue' in item) return item.booleanValue;
        if ('mapValue' in item) return firestoreToJs(item.mapValue.fields);
        return item;
      });
    } else if ('mapValue' in val) {
      result[key] = firestoreToJs(val.mapValue.fields);
    }
  }
  return result;
}

export function jsToFirestore(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val === null) fields[key] = { nullValue: null };
    else if (typeof val === 'string') fields[key] = { stringValue: val };
    else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
    else if (typeof val === 'number') {
      if (Number.isInteger(val)) fields[key] = { integerValue: String(val) };
      else fields[key] = { doubleValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map((item) => {
            if (typeof item === 'string') return { stringValue: item };
            if (typeof item === 'number') return { integerValue: String(item) };
            if (typeof item === 'boolean') return { booleanValue: item };
            if (item && typeof item === 'object') return { mapValue: { fields: jsToFirestore(item) } };
            return { nullValue: null };
          }),
        },
      };
    } else if (typeof val === 'object') {
      fields[key] = { mapValue: { fields: jsToFirestore(val) } };
    }
  }
  return fields;
}

const DEFAULT_FIREBASE_PROJECT_ID = 'calendarai-f5cd0';

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

/**
 * Sign a permanent, non-expiring personal access key for MCP
 */
export async function signPermanentMcpKey(uid: string, email: string | undefined, secret: string): Promise<string> {
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

/**
 * Cryptographically verify a permanent MCP key
 */
export async function verifyPermanentMcpKey(token: string, secret: string): Promise<{ uid: string; email?: string } | null> {
  if (!token || typeof token !== 'string' || !token.startsWith('vnk_live_')) return null;
  const parts = token.substring('vnk_live_'.length).split('.');
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
    return data && data.uid ? { uid: data.uid, email: data.email } : null;
  } catch {
    return null;
  }
}

async function getEffectiveFirestoreToken(env: Env, userToken?: string): Promise<string> {
  if (userToken && !userToken.startsWith('vnk_live_') && !userToken.startsWith('vnk_oauth_')) {
    if (userToken.startsWith('Bearer ')) {
      const raw = userToken.substring(7).trim();
      if (!raw.startsWith('vnk_live_') && !raw.startsWith('vnk_oauth_')) return raw;
    } else if (userToken.length > 20) {
      return userToken.trim();
    }
  }
  try {
    return await getGoogleFirestoreAccessToken(env);
  } catch (err) {
    if (userToken && !userToken.startsWith('vnk_live_') && !userToken.startsWith('vnk_oauth_')) return userToken.trim();
    throw err;
  }
}

/**
 * Fetch all events for a user from Firestore
 */
export async function fetchAllUserEvents(
  env: Env,
  uid: string,
  userToken?: string
): Promise<VankoMcpEvent[]> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const accessToken = await getEffectiveFirestoreToken(env, userToken);
  const events: VankoMcpEvent[] = [];
  let pageToken = '';

  for (let page = 0; page < 5; page++) {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/events?pageSize=100${pageParam}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 404) return [];
      const err = await res.text();
      throw new Error(`Firestore list error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;
    const docs = data.documents || [];
    for (const doc of docs) {
      const raw = firestoreToJs(doc.fields || {});
      const id = doc.name.split('/').pop() || raw.id;
      events.push({
        id,
        title: raw.title || 'Untitled Event',
        type: raw.type || 'other',
        event_start_date: raw.event_start_date || null,
        event_end_date: raw.event_end_date || null,
        registration_deadline: raw.registration_deadline || null,
        time: raw.time || null,
        mode: raw.mode || 'online',
        location: raw.location || null,
        registration_link: raw.registration_link || null,
        source_group: raw.source_group || null,
        raw_text: raw.raw_text || '',
        confidence_score: raw.confidence_score ?? 1.0,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        reminder_offsets: Array.isArray(raw.reminder_offsets) ? raw.reminder_offsets : [4320, 1440, 0],
        status: raw.status || 'upcoming',
        created_at: raw.created_at || new Date().toISOString(),
        updated_at: raw.updated_at || new Date().toISOString(),
        userId: uid,
        has_critical_alarm: Boolean(raw.has_critical_alarm),
        alarm_offsets: Array.isArray(raw.alarm_offsets) ? raw.alarm_offsets : [120, 15],
        alarm_time_assumed: Boolean(raw.alarm_time_assumed),
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return events;
}


/**
 * Filter events based on criteria
 */
export function filterEvents(
  events: VankoMcpEvent[],
  params: {
    time_filter?: string;
    type?: string;
    status?: string;
    has_alarm?: boolean;
    limit?: number;
  }
): VankoMcpEvent[] {
  const todayStr = new Date().toISOString().split('T')[0];
  let filtered = [...events];

  if (params.type) {
    filtered = filtered.filter((e) => e.type.toLowerCase() === params.type?.toLowerCase());
  }

  if (params.status) {
    filtered = filtered.filter((e) => e.status.toLowerCase() === params.status?.toLowerCase());
  }

  if (params.has_alarm !== undefined) {
    filtered = filtered.filter((e) => Boolean(e.has_critical_alarm) === params.has_alarm);
  }

  if (params.time_filter) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (params.time_filter === 'upcoming') {
      filtered = filtered.filter((e) => {
        const d = e.event_start_date || e.registration_deadline;
        if (!d) return true;
        return new Date(d).getTime() >= today;
      });
    } else if (params.time_filter === 'past') {
      filtered = filtered.filter((e) => {
        const d = e.event_end_date || e.event_start_date;
        if (!d) return false;
        return new Date(d).getTime() < today;
      });
    } else if (params.time_filter === 'this_week') {
      const weekAhead = today + 7 * 86400 * 1000;
      filtered = filtered.filter((e) => {
        const d = e.event_start_date || e.registration_deadline;
        if (!d) return false;
        const t = new Date(d).getTime();
        return t >= today && t <= weekAhead;
      });
    } else if (params.time_filter === 'this_month') {
      const monthAhead = today + 30 * 86400 * 1000;
      filtered = filtered.filter((e) => {
        const d = e.event_start_date || e.registration_deadline;
        if (!d) return false;
        const t = new Date(d).getTime();
        return t >= today && t <= monthAhead;
      });
    }
  }

  // Sort upcoming first
  filtered.sort((a, b) => {
    const da = a.event_start_date || a.registration_deadline || '9999-99-99';
    const db = b.event_start_date || b.registration_deadline || '9999-99-99';
    return da.localeCompare(db);
  });

  const limit = params.limit && params.limit > 0 ? params.limit : 20;
  return filtered.slice(0, limit);
}

/**
 * Check schedule clashes among events
 */
export function checkConflicts(events: VankoMcpEvent[], specificDate?: string) {
  let scope = events.filter((e) => e.status !== 'skipped');
  if (specificDate) {
    scope = scope.filter(
      (e) =>
        e.event_start_date === specificDate ||
        e.event_end_date === specificDate ||
        e.registration_deadline === specificDate
    );
  }

  const conflictingPairs: {
    event1: { id: string; title: string; date: string; time: string | null };
    event2: { id: string; title: string; date: string; time: string | null };
    reason: string;
  }[] = [];

  for (let i = 0; i < scope.length; i++) {
    for (let j = i + 1; j < scope.length; j++) {
      const e1 = scope[i];
      const e2 = scope[j];

      // Check date collision
      const dateOverlap =
        (e1.event_start_date && e1.event_start_date === e2.event_start_date) ||
        (e1.registration_deadline && e1.registration_deadline === e2.registration_deadline);

      if (dateOverlap) {
        let reason = `Both events fall on ${e1.event_start_date || e1.registration_deadline}`;
        if (e1.time && e2.time && e1.time === e2.time) {
          reason += ` at the exact same time (${e1.time})`;
        }
        conflictingPairs.push({
          event1: { id: e1.id, title: e1.title, date: e1.event_start_date || e1.registration_deadline || '', time: e1.time },
          event2: { id: e2.id, title: e2.title, date: e2.event_start_date || e2.registration_deadline || '', time: e2.time },
          reason,
        });
      }
    }
  }

  return {
    has_conflicts: conflictingPairs.length > 0,
    conflicts_count: conflictingPairs.length,
    conflicting_pairs: conflictingPairs,
  };
}

/**
 * Get upcoming deadlines
 */
export function getDeadlines(events: VankoMcpEvent[], daysAhead = 7, includeRegistered = false) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const numDays = isNaN(Number(daysAhead)) ? 7 : Number(daysAhead);
  const maxMs = startOfToday + (numDays + 1) * 86400 * 1000;

  return events
    .filter((e) => {
      if (!includeRegistered && e.status === 'registered') return false;
      if (e.status === 'skipped') return false;
      const rawDeadline = e.registration_deadline || e.event_start_date;
      if (!rawDeadline) return false;

      let dMs = NaN;
      if (rawDeadline.includes('T')) {
        dMs = new Date(rawDeadline).getTime();
      } else {
        const parts = rawDeadline.split('-').map(Number);
        if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
          dMs = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59).getTime();
        } else {
          dMs = new Date(rawDeadline).getTime();
        }
      }

      if (isNaN(dMs)) return false;
      return dMs >= startOfToday && dMs <= maxMs;
    })
    .sort((a, b) => {
      const da = a.registration_deadline || a.event_start_date || '9999-99-99';
      const db = b.registration_deadline || b.event_start_date || '9999-99-99';
      return da.localeCompare(db);
    });
}

/**
 * Create an event in Firestore
 */
export async function createFirestoreEvent(
  env: Env,
  uid: string,
  eventData: Partial<VankoMcpEvent>,
  userToken?: string
): Promise<VankoMcpEvent> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const accessToken = await getEffectiveFirestoreToken(env, userToken);
  const eventId = `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const validTypes = ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'];
  const validModes = ['online', 'offline', 'hybrid'];

  const fullEvent: VankoMcpEvent = {
    id: eventId,
    title: eventData.title || 'Untitled Event',
    type: validTypes.includes(eventData.type as string) ? eventData.type! : 'other',
    event_start_date: eventData.event_start_date || null,
    event_end_date: eventData.event_end_date || null,
    registration_deadline: eventData.registration_deadline || null,
    time: eventData.time || null,
    mode: validModes.includes(eventData.mode as string) ? eventData.mode! : 'online',
    location: eventData.location || null,
    registration_link: eventData.registration_link || null,
    source_group: 'mcp-chat',
    raw_text: eventData.raw_text || `Added via Vanko MCP Assistant on ${new Date().toLocaleDateString()}`,
    confidence_score: 1.0,
    tags: eventData.tags || ['mcp'],
    reminder_offsets: [4320, 1440, 0],
    status: 'upcoming',
    created_at: nowIso,
    updated_at: nowIso,
    userId: uid,
    has_critical_alarm: Boolean(eventData.has_critical_alarm),
    alarm_offsets: eventData.alarm_offsets || [120, 15],
    alarm_time_assumed: !eventData.time,
  };

  const fields = jsToFirestore(fullEvent);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/events/${eventId}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create Firestore event (${res.status}): ${err}`);
  }

  return fullEvent;
}

/**
 * Mark event as submitted/registered
 */
export async function updateFirestoreEventStatus(
  env: Env,
  uid: string,
  eventId: string,
  status: 'registered' | 'upcoming' | 'skipped',
  userToken?: string
): Promise<VankoMcpEvent> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const accessToken = await getEffectiveFirestoreToken(env, userToken);
  const nowIso = new Date().toISOString();

  const updates: Record<string, any> = {
    status,
    has_critical_alarm: false, // Disarm alarm on submission
    updated_at: nowIso,
  };

  const fields = jsToFirestore(updates);
  const mask = 'updateMask.fieldPaths=status&updateMask.fieldPaths=has_critical_alarm&updateMask.fieldPaths=updated_at';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/events/${eventId}?${mask}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to update event status (${res.status}): ${err}`);
  }

  const updatedDoc = (await res.json()) as any;
  const raw = firestoreToJs(updatedDoc.fields || {});
  return {
    ...raw,
    id: eventId,
  } as VankoMcpEvent;
}

/**
 * MCP JSON-RPC 2.0 Standard Handler over HTTP POST
 */
export async function handleMcpJsonRpc(
  env: Env,
  uid: string | null,
  body: any,
  userToken?: string
): Promise<{ jsonrpc: '2.0'; id: any; result?: any; error?: any }> {
  const { jsonrpc, id, method, params = {} } = body;

  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
            serverInfo: {
              name: 'vanko-calendar-mcp',
              version: '1.0.0',
            },
          },
        };
      }

      case 'notifications/initialized': {
        return { jsonrpc: '2.0', id, result: {} };
      }

      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'list_events',
                description: 'List calendar events with filters (upcoming, this_week, hackathons, deadlines).',
                inputSchema: {
                  type: 'object',
                  properties: {
                    time_filter: { type: 'string', enum: ['all', 'upcoming', 'past', 'this_week', 'this_month'] },
                    type: { type: 'string' },
                    status: { type: 'string' },
                    has_alarm: { type: 'boolean' },
                    limit: { type: 'number', default: 20 },
                  },
                },
              },
              {
                name: 'get_event_details',
                description: 'Get full details of a specific event.',
                inputSchema: {
                  type: 'object',
                  properties: { event_id: { type: 'string' } },
                  required: ['event_id'],
                },
              },
              {
                name: 'check_conflicts',
                description: 'Check for schedule clashes and overlapping events.',
                inputSchema: {
                  type: 'object',
                  properties: { date: { type: 'string' } },
                },
              },
              {
                name: 'get_deadlines',
                description: 'Get upcoming registration deadlines sorted by urgency.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    days_ahead: { type: 'number', default: 7 },
                    include_registered: { type: 'boolean', default: false },
                  },
                },
              },
              {
                name: 'add_event',
                description: 'Create a new event or deadline in the calendar.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    type: { type: 'string' },
                    event_start_date: { type: 'string' },
                    event_end_date: { type: 'string' },
                    registration_deadline: { type: 'string' },
                    time: { type: 'string' },
                    mode: { type: 'string' },
                    location: { type: 'string' },
                    registration_link: { type: 'string' },
                    has_critical_alarm: { type: 'boolean' },
                  },
                  required: ['title'],
                },
              },
              {
                name: 'mark_submitted',
                description: 'Mark registration/submission completed and disarm alarms.',
                inputSchema: {
                  type: 'object',
                  properties: { event_id: { type: 'string' } },
                  required: ['event_id'],
                },
              },
              {
                name: 'search_events',
                description: 'Search events across titles, tags, and notes.',
                inputSchema: {
                  type: 'object',
                  properties: { query: { type: 'string' } },
                  required: ['query'],
                },
              },
            ],
          },
        };
      }

      case 'tools/call': {
        const { name, arguments: args = {} } = params;

        let activeUid = uid;
        let activeToken = userToken;

        if (!activeUid || !activeToken) {
          const tokenArg = args.token || args.auth_token || args.key || args.api_key;
          if (tokenArg && typeof tokenArg === 'string') {
            const cleanToken = tokenArg.trim();
            if (cleanToken.startsWith('vnk_oauth_')) {
              const verified = await verifyOAuthAccessToken(
                cleanToken,
                env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
              );
              if (verified) {
                activeUid = verified.uid;
                activeToken = cleanToken;
              }
            } else if (cleanToken.startsWith('vnk_live_')) {
              const verified = await verifyPermanentMcpKey(
                cleanToken,
                env.FIREBASE_PRIVATE_KEY || 'vanko_secret_fallback'
              );
              if (verified) {
                activeUid = verified.uid;
                activeToken = cleanToken;
              }
            } else {
              try {
                const verified = await verifyFirebaseToken(`Bearer ${cleanToken}`, env);
                activeUid = verified.uid;
                activeToken = cleanToken;
              } catch {}
            }
          }
        }

        // Strict Security: All calendar tools require verified authentication
        if (!activeUid) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32001,
              message:
                'Unauthorized: Authentication required. Please connect your Vanko account via OAuth or provide your Vanko access key.',
            },
          };
        }

        const allEvents: VankoMcpEvent[] = await fetchAllUserEvents(env, activeUid, activeToken);

        if (name === 'list_events') {
          const events = filterEvents(allEvents, args);
          return {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] },
          };
        }

        if (name === 'get_event_details') {
          const event = allEvents.find((e) => e.id === args.event_id);
          if (!event) {
            return {
              jsonrpc: '2.0',
              id,
              result: { isError: true, content: [{ type: 'text', text: `Event not found: ${args.event_id}` }] },
            };
          }
          return {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: JSON.stringify(event, null, 2) }] },
          };
        }

        if (name === 'check_conflicts') {
          const conflicts = checkConflicts(allEvents, args.date);
          return {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: JSON.stringify(conflicts, null, 2) }] },
          };
        }

        if (name === 'get_deadlines') {
          const daysAhead = args.days_ahead !== undefined ? Number(args.days_ahead) : 7;
          const incReg = args.include_registered === true || args.include_registered === 'true';
          const deadlines = getDeadlines(allEvents, isNaN(daysAhead) ? 7 : daysAhead, incReg);
          return {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: JSON.stringify(deadlines, null, 2) }] },
          };
        }

        if (name === 'add_event') {
          if (!activeUid) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: 'Authentication required: Please connect with your permanent Vanko key (?key=vnk_live_...) to add events.' }],
              },
            };
          }
          const created = await createFirestoreEvent(env, activeUid, args, activeToken);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Created event "${created.title}" with ID ${created.id}!\n${JSON.stringify(created, null, 2)}`,
                },
              ],
            },
          };
        }

        if (name === 'mark_submitted') {
          if (!activeUid) {
            return {
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: 'Authentication required: Please connect with your permanent Vanko key (?key=vnk_live_...) to update events.' }],
              },
            };
          }
          const updated = await updateFirestoreEventStatus(env, activeUid, args.event_id, 'registered', activeToken);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Event "${updated.title}" marked as submitted! Critical alarms disarmed.`,
                },
              ],
            },
          };
        }

        if (name === 'search_events') {
          const q = (args.query || '').toLowerCase();
          const results = allEvents.filter(
            (e) =>
              e.title.toLowerCase().includes(q) ||
              (e.location && e.location.toLowerCase().includes(q)) ||
              (e.raw_text && e.raw_text.toLowerCase().includes(q)) ||
              (e.tags && e.tags.some((t) => t.toLowerCase().includes(q)))
          );
          return {
            jsonrpc: '2.0',
            id,
            result: { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${name}` },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown method: ${method}` },
        };
    }
  } catch (err: any) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: err?.message || 'Internal MCP error' },
    };
  }
}

/**
 * OpenAPI 3.0.0 Specification for ChatGPT Custom GPT Actions
 */
export function getOpenApiSchema(baseUrl: string) {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Vanko Calendar Assistant API',
      description: 'API for Claude and ChatGPT Custom Actions to interact with Vanko Calendar schedule, deadlines, and conflicts.',
      version: '1.0.0',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/mcp/events': {
        get: {
          operationId: 'listEvents',
          summary: 'List user calendar events with filters',
          parameters: [
            { name: 'time_filter', in: 'query', schema: { type: 'string', enum: ['all', 'upcoming', 'past', 'this_week', 'this_month'] } },
            { name: 'type', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'has_alarm', in: 'query', schema: { type: 'boolean' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { events: { type: 'array' } } } } },
            },
          },
        },
        post: {
          operationId: 'addEvent',
          summary: 'Create a new event in the user calendar',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    title: { type: 'string' },
                    type: { type: 'string' },
                    event_start_date: { type: 'string' },
                    event_end_date: { type: 'string' },
                    registration_deadline: { type: 'string' },
                    time: { type: 'string' },
                    mode: { type: 'string' },
                    location: { type: 'string' },
                    registration_link: { type: 'string' },
                    has_critical_alarm: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Event created',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      },
      '/api/mcp/deadlines': {
        get: {
          operationId: 'getDeadlines',
          summary: 'Get upcoming registration deadlines sorted by urgency',
          parameters: [
            { name: 'days', in: 'query', schema: { type: 'integer', default: 7 } },
            { name: 'include_registered', in: 'query', schema: { type: 'boolean', default: false } },
          ],
          responses: {
            '200': { description: 'List of deadlines', content: { 'application/json': { schema: { type: 'object' } } } },
          },
        },
      },
      '/api/mcp/conflicts': {
        get: {
          operationId: 'checkConflicts',
          summary: 'Check for schedule clashes and overlapping events',
          parameters: [{ name: 'date', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Conflict report', content: { 'application/json': { schema: { type: 'object' } } } },
          },
        },
      },
      '/api/mcp/events/search': {
        get: {
          operationId: 'searchEvents',
          summary: 'Search events by keyword across titles, tags, and notes',
          parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Search results', content: { 'application/json': { schema: { type: 'object' } } } },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ BearerAuth: [] }],
  };
}

/**
 * Handle MCP Server-Sent Events (SSE) stream for Claude Web & remote MCP clients
 */
export function handleMcpSseConnection(
  request: Request,
  url: URL,
  token?: string
): Response {
  const sessionId = crypto.randomUUID();
  const tokenParam = token
    ? (token.startsWith('vnk_live_') ? `&key=${encodeURIComponent(token)}` : `&token=${encodeURIComponent(token)}`)
    : '';
  const postEndpoint = `${url.origin}/api/mcp?sessionId=${sessionId}${tokenParam}`;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Send initial endpoint event per MCP SSE protocol specification
  const initialEvent = `event: endpoint\ndata: ${postEndpoint}\n\n`;
  writer.write(encoder.encode(initialEvent));

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    },
  });
}


