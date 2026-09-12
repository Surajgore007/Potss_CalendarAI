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

/** Fetch user role and college securely from Firestore via Service Account OAuth2 token */
export async function getUserProfile(
  uid: string,
  env: Env
): Promise<{ role: 'admin' | 'student'; college: string; missingSecrets?: boolean }> {
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return { role: 'student', college: 'SIES_GST', missingSecrets: true };
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
      const college = doc?.fields?.college?.stringValue || 'SIES_GST';
      return { role, college };
    }
  } catch (err) {
    console.warn(`Authenticated profile lookup failed for ${uid}:`, err);
  }

  // Fallback default
  return { role: 'student', college: 'SIES_GST' };
}

/** Check if broadcast was already sent for this eventId (One-broadcast-per-event semantic) */
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
      return {
        alreadyBroadcast: true,
        timestamp: doc?.fields?.timestamp?.stringValue || doc?.createTime,
      };
    }
  } catch (err) {
    console.warn('Idempotency check warning:', err);
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
  } catch (err) {
    console.error('Failed to record broadcast history:', err);
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

    // Query users matching college filter
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'college' },
              op: 'EQUAL',
              value: { stringValue: college },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Firestore token query failed:', errText);
      return [];
    }

    const items = (await res.json()) as any[];
    for (const item of items) {
      const doc = item?.document;
      if (!doc || !doc.fields) continue;

      const pushToken = doc.fields.pushToken?.stringValue;
      if (
        pushToken &&
        (pushToken.startsWith('ExponentPushToken[') || pushToken.startsWith('ExpoPushToken['))
      ) {
        // Extract UID from resource name: projects/.../databases/(default)/documents/users/{uid}
        const pathParts = doc.name.split('/');
        const uid = pathParts[pathParts.length - 1];
        recipients.push({ uid, pushToken });
      }
    }
  } catch (err) {
    console.error('Error querying college push tokens:', err);
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
  } catch (err) {
    console.warn('Dead token pruning warning:', err);
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
              }
            }
          });
        }
      }
    } catch (err) {
      console.error('Expo batch send error:', err);
    }
  }

  // Tier 1 Pruning
  if (deadUids.length > 0) {
    pruneDeadTokens(deadUids, env).catch(() => {});
  }

  return { ticketIds, deadUids };
}
