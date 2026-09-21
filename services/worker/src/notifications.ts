import { Env } from './index';
import { getGoogleFirestoreAccessToken } from './auth/googleServiceAccount';

const DEFAULT_FIREBASE_PROJECT_ID = 'calendarai-f5cd0';

export interface ExpoPushMessage {
  to: string;
  sound?: string;
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, any>;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Fetch user role and college.
 * Primary source of truth: Cryptographically signed Custom Claims from verified token.
 * Fallback: Firestore document lookup if custom claims are not present.
 */
export async function getUserProfile(
  userOrUid:
    | { uid: string; isAdmin?: boolean; role?: 'admin' | 'student'; college?: string }
    | string,
  env: Env
): Promise<{ role: 'admin' | 'student'; college: string; missingSecrets?: boolean }> {
  // 1. Fast-path: Rely on Custom Claims directly from the verified token
  if (typeof userOrUid === 'object' && userOrUid.isAdmin !== undefined) {
    return {
      role: userOrUid.isAdmin ? 'admin' : (userOrUid.role || 'student'),
      college: userOrUid.college || 'General',
    };
  }

  const uid = typeof userOrUid === 'object' ? userOrUid.uid : userOrUid;

  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return { role: 'student', college: 'General', missingSecrets: true };
  }

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;

  try {
    const accessToken = await getGoogleFirestoreAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const doc = (await res.json()) as any;
      const role = doc?.fields?.role?.stringValue === 'admin' ? 'admin' : 'student';
      const college = doc?.fields?.college?.stringValue || 'General';
      return { role, college };
    }
  } catch {
    // Authenticated profile lookup failed — fall back gracefully
  }

  // Fallback default
  return { role: 'student', college: 'General' };
}

/** Check if broadcast was sent for this eventId within 60 seconds (Debounce double-click protection) */
export async function checkBroadcastIdempotency(
  eventId: string,
  env: Env
): Promise<{ alreadyBroadcast: boolean; timestamp?: string }> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const idempotencyKey = `broadcast_${eventId}`;

  try {
    const accessToken = await getGoogleFirestoreAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/broadcastHistory/${idempotencyKey}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const doc = (await res.json()) as any;
      const lastBroadcastTime = doc?.fields?.timestamp?.stringValue || doc?.createTime;
      if (lastBroadcastTime) {
        const diffMs = Date.now() - new Date(lastBroadcastTime).getTime();
        // Debounce: prevent duplicate broadcast within 60 seconds (anti-double-click)
        if (diffMs < 60_000) {
          return {
            alreadyBroadcast: true,
            timestamp: lastBroadcastTime,
          };
        }
      }
    }
  } catch {
    // Idempotency check error — allow retry
  }

  return { alreadyBroadcast: false };
}

/** Record successful broadcast in Firestore to enforce idempotency */
export async function recordBroadcastHistory(
  eventId: string,
  adminUid: string,
  college: string,
  title: string,
  recipientsCount: number,
  ticketIds: string[],
  env: Env
): Promise<void> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const idempotencyKey = `broadcast_${eventId}`;

  try {
    const accessToken = await getGoogleFirestoreAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/broadcastHistory/${idempotencyKey}`;
    const now = new Date().toISOString();

    await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          eventId: { stringValue: eventId },
          adminUid: { stringValue: adminUid },
          college: { stringValue: college },
          title: { stringValue: title },
          recipientsCount: { integerValue: recipientsCount },
          timestamp: { stringValue: now },
          ticketIds: {
            arrayValue: {
              values: ticketIds.slice(0, 100).map((id) => ({ stringValue: id })),
            },
          },
        },
      }),
    });
  } catch {
    // History recording failed — continue gracefully
  }
}

/** Save campus announcement in Firestore /collegeAnnouncements/{announceId} */
export async function saveCollegeAnnouncementRecord(
  eventId: string,
  adminUid: string,
  college: string,
  title: string,
  message: string,
  eventType: string,
  env: Env
): Promise<void> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const announceId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    const accessToken = await getGoogleFirestoreAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/collegeAnnouncements/${announceId}`;
    const now = new Date().toISOString();

    await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          id: { stringValue: announceId },
          college: { stringValue: college || 'SIES_GST' },
          title: { stringValue: title },
          message: { stringValue: message },
          eventId: { stringValue: eventId },
          type: { stringValue: eventType || 'community_event' },
          createdAt: { stringValue: now },
          adminUid: { stringValue: adminUid },
        },
      }),
    });
  } catch {
    // Announcement recording failed — continue gracefully
  }
}

/** Query all students registered under college who have a valid Expo push token */
export async function queryCollegePushTokens(
  college: string,
  env: Env
): Promise<Array<{ uid: string; pushToken: string }>> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const recipients: Array<{ uid: string; pushToken: string }> = [];

  try {
    const accessToken = await getGoogleFirestoreAccessToken(env);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;

    // Fetch active user records (up to 1000)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          limit: 1000,
        },
      }),
    });

    if (!res.ok) {
      return [];
    }

    const items = (await res.json()) as any[];
    for (const item of items) {
      const doc = item?.document;
      if (!doc || !doc.fields) continue;

      const pushToken = doc.fields.pushToken?.stringValue;
      if (
        pushToken &&
        (pushToken.startsWith('ExponentPushToken[') ||
          pushToken.startsWith('ExpoPushToken[') ||
          pushToken.includes('PushToken['))
      ) {
        const userCollege = doc.fields.college?.stringValue;
        // Tenant matching: If broadcast is for SIES_GST, include SIES_GST, General, or unset college.
        // Prevent cross-college leakage: if user is explicitly registered with another college, exclude them.
        const isMatch =
          !college || college === 'SIES_GST'
            ? !userCollege || userCollege === 'SIES_GST' || userCollege === 'General'
            : userCollege === college;

        if (isMatch) {
          // Extract UID from resource name: projects/.../databases/(default)/documents/users/{uid}
          const pathParts = doc.name.split('/');
          const uid = pathParts[pathParts.length - 1];
          recipients.push({ uid, pushToken });
        }
      }
    }
  } catch {
    // Token query failed
  }

  return recipients;
}

/** Nullify pushToken in Firestore for students whose devices report DeviceNotRegistered */
export async function pruneDeadTokens(
  uids: string[],
  env: Env
): Promise<void> {
  if (uids.length === 0) return;
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;

  try {
    const accessToken = await getGoogleFirestoreAccessToken(env);
    // Batch or iterate null updates (safe against concurrent null sets)
    for (const uid of uids) {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=pushToken&updateMask.fieldPaths=pushTokenUpdatedAt`;
      await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            pushToken: { nullValue: null },
            pushTokenUpdatedAt: { nullValue: null },
          },
        }),
      });
    }
  } catch {
    // Dead token pruning failed — safe to ignore
  }
}

/** Chunk messages and send to Expo Push API in batches of up to 100 */
export async function sendExpoPushBatches(
  messages: ExpoPushMessage[],
  recipients: Array<{ uid: string; pushToken: string }>,
  env: Env
): Promise<{ ticketIds: string[]; deadUids: string[] }> {
  const tokenToUid = new Map(recipients.map((r) => [r.pushToken, r.uid]));
  const ticketIds: string[] = [];
  const deadUids: string[] = [];

  const BATCH_SIZE = 100;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    try {
      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(batch),
      });

      if (expoRes.ok) {
        const result = (await expoRes.json()) as { data: ExpoPushTicket[] };
        if (Array.isArray(result.data)) {
          result.data.forEach((ticket, idx) => {
            if (ticket.status === 'ok' && ticket.id) {
              ticketIds.push(ticket.id);
            } else if (ticket.status === 'error') {
              // Tier 1 Immediate Detection
              if (
                ticket.details?.error === 'DeviceNotRegistered' ||
                ticket.message?.includes('DeviceNotRegistered')
              ) {
                const token = batch[idx]?.to;
                const uid = token ? tokenToUid.get(token) : null;
                if (uid) deadUids.push(uid);
              } else {
                console.warn(
                  `[Expo Push] Delivery failure ticket: code=${ticket.details?.error || 'UNKNOWN'} message=${ticket.message || 'none'}`
                );
              }
            }
          });
        }
      }
    } catch (pushErr: any) {
      console.warn('[Expo Push] Batch delivery exception:', pushErr?.message || pushErr);
    }
  }

  // Tier 1 Pruning
  if (deadUids.length > 0) {
    pruneDeadTokens(deadUids, env).catch(() => {});
  }

  return { ticketIds, deadUids };
}
