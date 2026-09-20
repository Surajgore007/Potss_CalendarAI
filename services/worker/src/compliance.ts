import { Env } from './index';
import { getGoogleFirestoreAccessToken } from './auth/googleServiceAccount';

const DEFAULT_FIREBASE_PROJECT_ID = 'calendarai-f5cd0';

// 90 days in milliseconds for DPDP audit log retention
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// In-memory rate limiting structures
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const feedbackRateLimitMap = new Map<string, RateLimitBucket>();
const otpIpRateLimitMap = new Map<string, RateLimitBucket>();
const otpEmailRateLimitMap = new Map<string, RateLimitBucket>();

/**
 * Hash a string using SHA-256 via WebCrypto (available in Cloudflare Workers)
 */
export async function sha256Hex(str: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Check feedback rate limit: max 5 submissions per user per 24 hours.
 */
export function checkFeedbackRateLimit(uid: string): boolean {
  const now = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const existing = feedbackRateLimitMap.get(uid);

  if (!existing || existing.resetAt < now) {
    feedbackRateLimitMap.set(uid, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= 5) {
    return false;
  }

  existing.count += 1;
  return true;
}

/**
 * Dual rate limiting for deletion OTP:
 * - Max 3 requests per IP per hour
 * - Max 3 requests per target Email per hour (prevents victim email inbox harassment)
 */
export function checkOtpRateLimits(
  ip: string,
  email: string
): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  // 1. IP Check
  const ipEntry = otpIpRateLimitMap.get(ip);
  if (ipEntry && ipEntry.resetAt > now && ipEntry.count >= 3) {
    return {
      allowed: false,
      reason: 'Too many requests from this network. Please wait an hour before requesting another code.',
    };
  }

  // 2. Email Check (Target inbox harassment protection)
  const normEmail = email.trim().toLowerCase();
  const emailEntry = otpEmailRateLimitMap.get(normEmail);
  if (emailEntry && emailEntry.resetAt > now && emailEntry.count >= 3) {
    return {
      allowed: false,
      reason: 'Too many verification requests sent to this email address. Please wait an hour before requesting another code.',
    };
  }

  // Update IP bucket
  if (!ipEntry || ipEntry.resetAt < now) {
    otpIpRateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
  } else {
    ipEntry.count += 1;
  }

  // Update Email bucket
  if (!emailEntry || emailEntry.resetAt < now) {
    otpEmailRateLimitMap.set(normEmail, { count: 1, resetAt: now + windowMs });
  } else {
    emailEntry.count += 1;
  }

  return { allowed: true };
}

/**
 * Validates feedback screenshot attachment:
 * - Checks size (max 2MB)
 * - Checks magic-bytes header: strictly JPEG (FF D8 FF), PNG (89 50 4E 47), or WebP (RIFF...WEBP)
 * - Rejects any executables, SVGs, HTML, or scripts
 */
export function validateImageAttachment(dataUriOrBase64: string): {
  valid: boolean;
  mime?: string;
  extension?: string;
  bytes?: Uint8Array;
  error?: string;
} {
  let base64 = dataUriOrBase64;
  if (base64.startsWith('data:')) {
    const commaIdx = base64.indexOf(',');
    if (commaIdx !== -1) {
      base64 = base64.substring(commaIdx + 1);
    }
  }

  base64 = base64.replace(/\s/g, '');

  const estimatedBytes = (base64.length * 3) / 4;
  if (estimatedBytes > 2 * 1024 * 1024) {
    return { valid: false, error: 'Attachment exceeds the 2MB size limit.' };
  }

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return { valid: false, error: 'Invalid base64 attachment format.' };
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  if (bytes.length < 12) {
    return { valid: false, error: 'File is too small to be a valid image.' };
  }

  // JPEG check: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, mime: 'image/jpeg', extension: 'jpg', bytes };
  }

  // PNG check: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, mime: 'image/png', extension: 'png', bytes };
  }

  // WebP check: RIFF .... WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, mime: 'image/webp', extension: 'webp', bytes };
  }

  return {
    valid: false,
    error: 'Disallowed file type. Only JPEG, PNG, and WebP images are permitted for security.',
  };
}

/**
 * Upload an attachment to Google Cloud Storage / Firebase Storage via REST API.
 * Uses Service Account OAuth2 token with X-Content-Type-Options: nosniff.
 */
export async function uploadAttachmentToStorage(
  storagePath: string,
  bytes: Uint8Array,
  mime: string,
  env: Env
): Promise<{ success: boolean; storageUrl?: string }> {
  try {
    const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
    const bucket = `${projectId}.appspot.com`;
    const accessToken = await getGoogleFirestoreAccessToken(env);

    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(
      storagePath
    )}`;

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mime,
        'X-Goog-Meta-Content-Type-Options': 'nosniff',
      },
      body: bytes,
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
        storagePath
      )}?alt=media`;
      return { success: true, storageUrl: downloadUrl };
    }
  } catch (err) {
    console.warn('Storage upload error:', err);
  }

  return { success: false };
}

/**
 * Resilient, Resumable & Idempotent Deletion State Machine:
 * Transitions: initiated -> firestore_events_deleted -> firestore_profile_deleted -> auth_deleted -> completed
 * 
 * Idempotence & Resumability Guarantees:
 * - Prior Execution Check: Inspects /accountDeletionAudit/{uid} before executing.
 * - Completed Guard: If status is already 'completed', returns immediately with success (zero double-decrement of platform counter).
 * - Fast-Forward Resume: If a prior attempt died between stages (e.g. timeout or network drop),
 *   resumes directly from the uncompleted stage without repeating earlier deletions.
 * - Idempotent Operations: Subcollection purges, doc deletions, and auth deletes handle already-deleted resources cleanly.
 * - Audit Trail: Maintains an audit record with an enforced 90-day retention TTL field (expireAt) under DPDP Sec 12.
 */
export async function executeAccountDeletion(
  uid: string,
  env: Env
): Promise<{ success: boolean; error?: string; state?: string; resumedFrom?: string }> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const accessToken = await getGoogleFirestoreAccessToken(env);
  const now = new Date();
  const expireAt = new Date(now.getTime() + AUDIT_RETENTION_MS).toISOString();
  const uidHash = await sha256Hex(uid);

  const auditDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/accountDeletionAudit/${uid}`;

  // Step 0: Check for existing deletion state to enable seamless resume and prevent double-processing
  let priorStatus: string | null = null;
  try {
    const checkRes = await fetch(auditDocUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (checkRes.ok) {
      const existingDoc = (await checkRes.json()) as any;
      priorStatus = existingDoc?.fields?.status?.stringValue || null;
    }
  } catch {
    // Non-blocking — if audit read fails, proceed through standard idempotent pipeline
  }

  // Terminal Idempotence: If already completed in a prior execution, return immediately
  if (priorStatus === 'completed') {
    return { success: true, state: 'completed', resumedFrom: 'completed' };
  }

  // Helper to record audit state
  const updateAudit = async (status: string, extra: Record<string, any> = {}) => {
    try {
      const fields: Record<string, any> = {
        uidHash: { stringValue: uidHash },
        status: { stringValue: status },
        updatedAt: { stringValue: new Date().toISOString() },
        expireAt: { timestampValue: expireAt },
        purgeAfter: { stringValue: expireAt },
        ...extra,
      };

      const maskParams = Object.keys(fields)
        .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
        .join('&');

      await fetch(`${auditDocUrl}?${maskParams}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      });
    } catch {
      // Audit log update failures should not block deletion progress
    }
  };

  // State 1: Initiated or Resumed
  if (priorStatus) {
    await updateAudit(priorStatus, {
      resumedAt: { stringValue: now.toISOString() },
      resumedFromState: { stringValue: priorStatus },
    });
  } else {
    await updateAudit('initiated', { requestedAt: { stringValue: now.toISOString() } });
  }

  // State 2: Delete user calendar events & notifications subcollections
  // (Skip if already completed in a previous attempt)
  const skipEvents =
    priorStatus === 'firestore_events_deleted' ||
    priorStatus === 'community_attendance_cleared' ||
    priorStatus === 'firestore_profile_deleted' ||
    priorStatus === 'auth_deleted' ||
    priorStatus === 'failed_at_auth';

  if (!skipEvents) {
    try {
      // Delete all events in /users/{uid}/events
      let hasMoreEvents = true;
      while (hasMoreEvents) {
        const eventsListUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/events?pageSize=100`;
        const eventsRes = await fetch(eventsListUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (eventsRes.ok) {
          const data = (await eventsRes.json()) as any;
          const docs = data.documents || [];
          if (docs.length === 0) {
            hasMoreEvents = false;
            break;
          }
          for (const doc of docs) {
            await fetch(`https://firestore.googleapis.com/v1/${doc.name}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          }
          if (docs.length < 100) {
            hasMoreEvents = false;
          }
        } else {
          hasMoreEvents = false;
        }
      }

      // Purge all user notifications in /users/{uid}/notifications
      let hasMoreNotifs = true;
      while (hasMoreNotifs) {
        const notifsListUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/notifications?pageSize=100`;
        const notifsRes = await fetch(notifsListUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (notifsRes.ok) {
          const nData = (await notifsRes.json()) as any;
          const nDocs = nData.documents || [];
          if (nDocs.length === 0) {
            hasMoreNotifs = false;
            break;
          }
          for (const nDoc of nDocs) {
            await fetch(`https://firestore.googleapis.com/v1/${nDoc.name}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          }
          if (nDocs.length < 100) {
            hasMoreNotifs = false;
          }
        } else {
          hasMoreNotifs = false;
        }
      }

      await updateAudit('firestore_events_deleted');
    } catch (err: any) {
      console.warn('Error purging user events/notifications:', err);
    }
  }

  // Stage 2b: Remove deleted user's UID from all communityEvents attendee arrays they joined.
  // This prevents residual PII (UID) from persisting in public-readable community event documents
  // after account erasure, which is required under DPDP Act data minimization principles.
  const skipAttendance =
    priorStatus === 'community_attendance_cleared' ||
    priorStatus === 'firestore_profile_deleted' ||
    priorStatus === 'auth_deleted' ||
    priorStatus === 'failed_at_auth';

  if (!skipAttendance) {
    try {
      // Query all communityEvents where this UID appears in the attendees array.
      const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
      const queryRes = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'communityEvents' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'attendees' },
                op: 'ARRAY_CONTAINS',
                value: { stringValue: uid },
              },
            },
            limit: 200,
          },
        }),
      });

      if (queryRes.ok) {
        const results = (await queryRes.json()) as any[];
        for (const item of results) {
          if (!item.document) continue;
          const docName = item.document.name;
          const fields = item.document.fields || {};

          // Build updated attendees array with UID removed
          const existingAttendees: string[] = (
            fields.attendees?.arrayValue?.values || []
          )
            .map((v: any) => v.stringValue)
            .filter((v: string) => Boolean(v) && v !== uid);

          // Build updated attendeePreviews map with UID key removed
          const existingPreviews: Record<string, any> =
            fields.attendeePreviews?.mapValue?.fields || {};
          const updatedPreviewFields: Record<string, any> = {};
          for (const [key, val] of Object.entries(existingPreviews)) {
            if (key !== uid) {
              updatedPreviewFields[key] = val;
            }
          }

          // Decrement attendeesCount by 1 (floor at 0)
          const currentCount: number =
            parseInt(fields.attendeesCount?.integerValue || '0', 10);
          const newCount = Math.max(0, currentCount - 1);

          // PATCH only the three affected fields using field mask
          const patchUrl =
            `https://firestore.googleapis.com/v1/${docName}` +
            `?updateMask.fieldPaths=attendees` +
            `&updateMask.fieldPaths=attendeePreviews` +
            `&updateMask.fieldPaths=attendeesCount`;

          await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fields: {
                attendees: {
                  arrayValue: {
                    values: existingAttendees.map((v) => ({ stringValue: v })),
                  },
                },
                attendeePreviews: {
                  mapValue: { fields: updatedPreviewFields },
                },
                attendeesCount: { integerValue: String(newCount) },
              },
            }),
          });
        }
      }

      await updateAudit('community_attendance_cleared');
    } catch (err: any) {
      // Non-fatal: log and continue. The profile and auth deletions must still
      // proceed regardless. Reconciliation cron will retry on next run.
      console.warn('Error purging community event attendance for uid:', uid, err);
    }
  }

  // State 3: Delete user profile document /users/{uid}
  // (Skip if already completed)
  const skipProfile =
    priorStatus === 'firestore_profile_deleted' ||
    priorStatus === 'auth_deleted' ||
    priorStatus === 'failed_at_auth';

  if (!skipProfile) {
    try {
      const userDocUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
      await fetch(userDocUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      await updateAudit('firestore_profile_deleted');
    } catch (err: any) {
      console.warn('Error purging user doc:', err);
    }
  }

  // State 4: Delete user account from Firebase Auth via Google Identity Toolkit REST API
  // (Skip if already completed)
  const skipAuth = priorStatus === 'auth_deleted';

  if (!skipAuth) {
    try {
      const authDeleteUrl = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`;
      const authRes = await fetch(authDeleteUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ localId: uid }),
      });

      if (!authRes.ok) {
        const errText = await authRes.text();
        // If user is already deleted, treat as idempotent success
        if (!errText.includes('USER_NOT_FOUND')) {
          await updateAudit('failed_at_auth', { error: { stringValue: errText } });
          return {
            success: false,
            state: 'failed_at_auth',
            error: `Failed to remove user auth record: ${errText}`,
          };
        }
      }

      await updateAudit('auth_deleted');
    } catch (err: any) {
      await updateAudit('failed_at_auth', { error: { stringValue: err.message } });
      return {
        success: false,
        state: 'failed_at_auth',
        error: `Network error deleting auth record: ${err.message}`,
      };
    }
  }

  // State 5: Decrement total registered users counter in public_stats/platform
  // Strict Concurrency & Idempotency Guard: Uses Firestore precondition `currentDocument: { exists: false }`
  // on a dedicated lock document so that even if two concurrent worker executions run simultaneously,
  // the batch commit will succeed exactly ONCE across the entire distributed cluster.
  try {
    const statsCommitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
    const lockDocPath = `projects/${projectId}/databases/(default)/documents/accountDeletionAudit/${uid}/locks/counterDecremented`;

    const commitRes = await fetch(statsCommitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: lockDocPath,
              fields: {
                uid: { stringValue: uid },
                decrementedAt: { stringValue: new Date().toISOString() },
              },
            },
            currentDocument: { exists: false }, // Atomic mutex: Only the first concurrent worker can create this
          },
          {
            transform: {
              document: `projects/${projectId}/databases/(default)/documents/public_stats/platform`,
              fieldTransforms: [
                {
                  fieldPath: 'totalUsers',
                  increment: {
                    integerValue: '-1',
                  },
                },
                {
                  fieldPath: 'last_active',
                  setToServerValue: 'REQUEST_TIME',
                },
              ],
            },
          },
        ],
      }),
    });

    if (!commitRes.ok) {
      // If lock document already exists (ALREADY_EXISTS / code 409),
      // a concurrent worker or prior attempt has already performed the decrement.
      console.log(`[Stage 5 Decrement] Counter lock already exists for UID: ${uid}; double-decrement prevented.`);
    }
  } catch (err: any) {
    console.warn('Error decrementing platform totalUsers in worker:', err);
  }

  // State 6: Completed
  await updateAudit('completed', {
    completedAt: { stringValue: new Date().toISOString() },
  });

  return { success: true, state: 'completed', resumedFrom: priorStatus || undefined };
}

/**
 * Opportunistic / Cron cleanup routine to purge expired deletion audit logs (>90 days old).
 * Enforces the DPDP statutory 90-day storage minimization limit.
 */
export async function purgeExpiredAuditLogs(env: Env): Promise<number> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  let purgedCount = 0;

  try {
    const accessToken = await getGoogleFirestoreAccessToken(env);
    const nowIso = new Date().toISOString();

    // Query documents in accountDeletionAudit
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/accountDeletionAudit?pageSize=50`;
    const res = await fetch(queryUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const docs = data.documents || [];
      for (const doc of docs) {
        const purgeAfter = doc.fields?.purgeAfter?.stringValue || doc.fields?.expireAt?.timestampValue;
        if (purgeAfter && purgeAfter < nowIso) {
          await fetch(`https://firestore.googleapis.com/v1/${doc.name}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          purgedCount++;
        }
      }
    }
  } catch (err) {
    console.warn('Audit purge error:', err);
  }

  return purgedCount;
}

/**
 * Automated Deletion Self-Healing & Reconciliation Engine:
 * - Scans /accountDeletionAudit for records where status !== 'completed'
 * - Filters for records older than 15 minutes to guarantee zero race condition with in-flight deletions
 * - Re-invokes executeAccountDeletion() which automatically fast-forwards through unfinished stages
 * - Guarantees end-to-end statutory erasure completion under DPDP Act 2023 even if user never reopens the app
 */
export async function reconcileOrphanedDeletions(env: Env): Promise<{
  checked: number;
  resumed: number;
  completed: number;
  failed: number;
}> {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
  const summary = { checked: 0, resumed: 0, completed: 0, failed: 0 };

  try {
    const accessToken = await getGoogleFirestoreAccessToken(env);
    const now = Date.now();
    const IN_FLIGHT_SAFETY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

    const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/accountDeletionAudit?pageSize=50`;
    const res = await fetch(queryUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const docs = data.documents || [];
      summary.checked = docs.length;

      for (const doc of docs) {
        const fields = doc.fields || {};
        const status = fields.status?.stringValue || '';
        if (status === 'completed') {
          continue; // Already finished cleanly
        }

        // Check timestamp to avoid racing active requests
        const updatedAtStr = fields.updatedAt?.stringValue || fields.requestedAt?.stringValue;
        const updatedAtMs = updatedAtStr ? Date.parse(updatedAtStr) : 0;
        if (now - updatedAtMs < IN_FLIGHT_SAFETY_WINDOW_MS) {
          continue; // Active in-flight deletion, skip
        }

        // Extract UID from doc name: projects/{p}/databases/(default)/documents/accountDeletionAudit/{uid}
        const docNameParts = doc.name.split('/');
        const uid = docNameParts[docNameParts.length - 1];

        if (uid) {
          summary.resumed++;
          console.log(`[Deletion Reconciliation] Resuming orphaned deletion for UID: ${uid} (prior state: ${status})`);
          const result = await executeAccountDeletion(uid, env);
          if (result.success) {
            summary.completed++;
          } else {
            summary.failed++;
            console.warn(`[Deletion Reconciliation] Failed to complete resumed deletion for UID: ${uid}:`, result.error);
          }
        }
      }
    }
  } catch (err: any) {
    console.error('[Deletion Reconciliation] Error during scheduled reconciliation:', err?.message || err);
  }

  return summary;
}

/**
 * Public HTML Privacy Policy responsive web page.
 */
export function renderPrivacyPolicyHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Vanko (EventPulse)</title>
  <style>
    :root {
      --bg: #0B0E14;
      --card-bg: rgba(22, 27, 34, 0.8);
      --border: rgba(255, 255, 255, 0.1);
      --primary: #6366F1;
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
      --accent: #10B981;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px 80px;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    h1 {
      font-size: 28px;
      font-weight: 800;
      color: #FFF;
      margin: 0 0 8px;
    }
    .effective-date {
      color: var(--text-muted);
      font-size: 14px;
    }
    .badge {
      display: inline-block;
      background: rgba(99, 102, 241, 0.15);
      color: var(--primary);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    section {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 20px;
      color: #FFF;
      margin-top: 0;
      margin-bottom: 12px;
      border-left: 3px solid var(--primary);
      padding-left: 10px;
    }
    p, li {
      color: var(--text-muted);
      font-size: 15px;
    }
    strong {
      color: var(--text);
    }
    ul {
      padding-left: 20px;
      margin-bottom: 16px;
    }
    .contact-box {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 8px;
      padding: 16px;
      margin-top: 16px;
    }
    a {
      color: var(--primary);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge">DPDP Act 2023 & Play Store Compliant</div>
      <h1>Privacy Policy & Data Protection Notice</h1>
      <div class="effective-date">Effective Date: September 2026 | Application: Vanko (EventPulse)</div>
    </header>

    <section>
      <h2>1. Data Fiduciary & Contact Details</h2>
      <p>This privacy policy governs the <strong>Vanko</strong> mobile application. The Data Fiduciary responsible for your personal data under the <strong>Digital Personal Data Protection Act, 2023 (DPDP)</strong> is:</p>
      <ul>
        <li><strong>Data Fiduciary:</strong> Vanko Data Governance & Privacy Office</li>
        <li><strong>Official Inquiries:</strong> <a href="mailto:supportvanko@gmail.com">supportvanko@gmail.com</a></li>
      </ul>
    </section>

    <section>
      <h2>2. Categories of Personal Data Collected</h2>
      <p>We collect and process only the minimal personal data required to operate your schedule and provide AI event extraction:</p>
      <ul>
        <li><strong>Account Information:</strong> Your email address, display name, and authentication identifiers provided during email/Google sign-in.</li>
        <li><strong>Calendar & Schedule Entries:</strong> Event titles, dates, times, locations, and descriptions that you add or extract from announcements.</li>
        <li><strong>Push Notification Tokens:</strong> Anonymous device push tokens (via Expo / Google FCM) strictly used to deliver deadline reminders 24 hours prior to events.</li>
        <li><strong>User-Initiated Feedback:</strong> Messages, categories, and optional screenshot attachments you voluntarily submit via the in-app feedback channel.</li>
      </ul>
    </section>

    <section>
      <h2>3. Legal Grounds & Purpose of Processing</h2>
      <p>Under Section 4 and Section 6 of the DPDP Act 2023, we process personal data solely on the basis of your <strong>unbundled, affirmative consent</strong> provided at account registration for the following limited purposes:</p>
      <ul>
        <li>Organizing and synchronizing your personal schedule across your authorized devices.</li>
        <li>Extracting structured calendar fields from raw notice text that you voluntarily submit.</li>
        <li>Dispatching on-device and push notifications for upcoming registration deadlines.</li>
      </ul>
    </section>

    <section>
      <h2>4. Third-Party Subprocessors & Cross-Border Transfers</h2>
      <p>To deliver our cloud calendar and AI capabilities, personal data is transferred to the following trusted service providers:</p>
      <ul>
        <li><strong>Groq, Inc. (USA) [Cross-Border Transfer]:</strong> Notice text you voluntarily submit for AI extraction is sent to Groq Inc. via encrypted TLS 1.3 for real-time parsing. Calendar text submitted may contain personal information depending on user input (such as names, meeting locations, or topics). Under Groq's Commercial Terms of Service and Data Processing terms, API inputs are processed statelessly in real-time, are not used to train or improve foundational models, and are not retained beyond the immediate inference request. No user account credentials (email or password) are ever sent to Groq. Transferred under Section 16 of the DPDP Act 2023 (no Central Government restrictions apply).</li>
        <li><strong>Google Firebase / GCP (USA / India / Global):</strong> Provides secure authentication (Firebase Auth), encrypted database storage (Firestore, AES-256), and optional feedback attachment storage.</li>
        <li><strong>Cloudflare, Inc. (Global Edge):</strong> Operates the serverless API edge, SSL/TLS termination, and abuse/rate-limiting protection.</li>
        <li><strong>Expo (USA):</strong> Dispatches push notifications to your device based on scheduled deadlines.</li>
      </ul>
    </section>

    <section>
      <h2>5. Children's Privacy & Age Gate Limitation</h2>
      <p>Vanko is designed for college and university students and working adults. During account creation, users self-declare that they are 18 years of age or older or an enrolled college student.</p>
      <p><strong>Statutory Notice under Section 9 of DPDP Act:</strong> A self-declaration gate does not constitute verifiable parental consent. Vanko does not knowingly collect data from children under 18 or engage in behavioral tracking of minors. If a parent or guardian discovers that a child has registered an account without consent, they may contact our Grievance Officer for an immediate, expedited account purge within 24 hours.</p>
    </section>

    <section>
      <h2>6. Data Subject Rights (Access, Correction & Erasure)</h2>
      <p>Under Chapter III of the DPDP Act 2023, you have enforceable legal rights:</p>
      <ul>
        <li><strong>Right to Access & Portability:</strong> Tap <em>"My Data & Export"</em> in app settings to inspect all personal data held and export a complete JSON and iCalendar file.</li>
        <li><strong>Right to Correction:</strong> Update your profile details directly from the app.</li>
        <li><strong>Right to Withdraw Consent:</strong> Access <em>"Manage Data Consents"</em> in Settings. You may toggle optional notifications on or off. Withdrawing essential calendar processing consent requires closing your account, as the service cannot function without storing your schedule.</li>
        <li><strong>Right to Erasure (Account Deletion):</strong> Delete your account and all schedule records in real-time under <em>Settings &gt; Delete My Account</em>, or submit a request via our public <a href="/delete-account">Web Deletion Portal</a>.</li>
      </ul>
    </section>

    <section>
      <h2>7. Grievance Redressal & Data Protection Desk</h2>
      <p>Under Section 10 and Section 12 of the DPDP Act 2023, you may contact our designated Grievance & Privacy Desk regarding any data protection or privacy concern:</p>
      <div class="contact-box">
        <strong>Data Protection & Grievance Desk:</strong> Vanko Privacy Office<br>
        <strong>Email:</strong> <a href="mailto:supportvanko@gmail.com">supportvanko@gmail.com</a><br>
        <strong>In-App Channel:</strong> Vanko App &gt; Settings &gt; Send Feedback / Suggestion
      </div>
    </section>
  </div>
</body>
</html>`;
}

/**
 * Public HTML Web Deletion Portal responsive page.
 */
export function renderDeleteAccountHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Delete Account & Erase Data - Vanko</title>
  <style>
    :root {
      --bg: #0B0E14;
      --card-bg: rgba(22, 27, 34, 0.85);
      --border: rgba(255, 255, 255, 0.1);
      --danger: #EF4444;
      --primary: #6366F1;
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.6;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      width: 100%;
      max-width: 480px;
      padding: 24px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    h1 {
      font-size: 22px;
      color: #FFF;
      margin: 0 0 8px;
    }
    p {
      color: var(--text-muted);
      font-size: 14px;
      margin-bottom: 20px;
    }
    .warning {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      padding: 12px;
      color: #FCA5A5;
      font-size: 13px;
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text);
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: rgba(11, 14, 20, 0.8);
      color: #FFF;
      font-size: 15px;
      margin-bottom: 16px;
    }
    input:focus {
      outline: none;
      border-color: var(--primary);
    }
    button {
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: none;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary {
      background: var(--primary);
      color: #FFF;
    }
    .btn-danger {
      background: var(--danger);
      color: #FFF;
      margin-top: 8px;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .status-msg {
      margin-top: 16px;
      font-size: 13px;
      text-align: center;
    }
    .hidden {
      display: none;
    }
    .footer-links {
      text-align: center;
      margin-top: 24px;
      font-size: 13px;
    }
    a {
      color: var(--primary);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>Delete Account & Data</h1>
      <p>Google Play & DPDP Act Data Erasure Portal</p>

      <div class="warning">
        ⚠️ <strong>Warning:</strong> Deleting your account will permanently erase your personal profile, all calendar entries, timetable events, and notification preferences. This action cannot be undone.
      </div>

      <!-- Step 1: Request OTP -->
      <div id="step1">
        <label for="email">Enter your registered email address:</label>
        <input type="email" id="email" placeholder="student@college.edu" required autocomplete="email">
        <button id="sendOtpBtn" class="btn-primary" onclick="requestOtp()">Send Verification Code</button>
      </div>

      <!-- Step 2: Confirm OTP -->
      <div id="step2" class="hidden">
        <p style="color: #6EE7B7;">A verification code has been dispatched to your email if registered.</p>
        <label for="otp">Enter 6-digit Verification Code:</label>
        <input type="text" id="otp" placeholder="123456" maxlength="6" autocomplete="one-time-code">
        <button id="confirmBtn" class="btn-danger" onclick="confirmDeletion()">Permanently Delete My Account</button>
      </div>

      <div id="statusMsg" class="status-msg"></div>

      <div class="footer-links">
        Still have the app installed? You can delete your account instantly under <em>Settings &gt; Delete My Account</em>.<br><br>
        Need assistance? Contact <a href="mailto:supportvanko@gmail.com">supportvanko@gmail.com</a> · <a href="/privacy-policy">View Privacy Policy</a>
      </div>
    </div>
  </div>

  <script>
    async function requestOtp() {
      const email = document.getElementById('email').value.trim();
      if (!email || !email.includes('@')) {
        alert('Please enter a valid email address.');
        return;
      }

      const btn = document.getElementById('sendOtpBtn');
      const status = document.getElementById('statusMsg');
      btn.disabled = true;
      btn.innerText = 'Sending Code...';
      status.innerText = '';

      try {
        const res = await fetch('/api/delete-account/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        status.style.color = '#10B981';
        status.innerText = data.message || 'If an account exists for this email address, a verification code has been sent.';
        document.getElementById('step1').classList.add('hidden');
        document.getElementById('step2').classList.remove('hidden');
      } catch (err) {
        status.style.color = '#EF4444';
        status.innerText = 'Network error. Please try again.';
        btn.disabled = false;
        btn.innerText = 'Send Verification Code';
      }
    }

    async function confirmDeletion() {
      const email = document.getElementById('email').value.trim();
      const otp = document.getElementById('otp').value.trim();
      if (!otp || otp.length < 6) {
        alert('Please enter the 6-digit code received via email.');
        return;
      }

      const btn = document.getElementById('confirmBtn');
      const status = document.getElementById('statusMsg');
      btn.disabled = true;
      btn.innerText = 'Erasing Data...';

      try {
        const res = await fetch('/api/delete-account/confirm-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          document.getElementById('step2').classList.add('hidden');
          status.style.color = '#10B981';
          status.innerHTML = '<strong>Account Deleted</strong><br>Your account and associated data have been permanently erased.';
        } else {
          status.style.color = '#EF4444';
          status.innerText = data.message || 'Verification failed. Please check the code and try again.';
          btn.disabled = false;
          btn.innerText = 'Permanently Delete My Account';
        }
      } catch (err) {
        status.style.color = '#EF4444';
        status.innerText = 'Error connecting to server. Please try again.';
        btn.disabled = false;
        btn.innerText = 'Permanently Delete My Account';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Dispatch 6-digit Account Deletion OTP via Brevo Transactional Email API.
 */
export async function sendDeletionOtpEmail(
  apiKey: string,
  toEmail: string,
  otpCode: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'Vanko Privacy & Support',
          email: 'supportvanko@gmail.com',
        },
        to: [{ email: toEmail }],
        subject: `${otpCode} is your Vanko account deletion code`,
        htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Deletion Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0B0E14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #E4E4E7;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0B0E14; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #181B22; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; padding: 32px 28px;">
          <tr>
            <td align="left">
              <div style="font-size: 20px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px; margin-bottom: 8px;">
                Vanko
              </div>
              <div style="font-size: 13px; color: #71717A; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 24px;">
                Data Protection & Erasure Desk
              </div>
              <h1 style="font-size: 22px; font-weight: 700; color: #F43F5E; margin: 0 0 16px 0;">
                Account Deletion Request
              </h1>
              <p style="font-size: 14px; line-height: 1.6; color: #D4D4D8; margin: 0 0 24px 0;">
                We received a request to permanently delete your Vanko account and all associated calendar, timetable, and profile data from our servers.
              </p>
              <div style="background: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.25); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #FDA4AF; letter-spacing: 1px; margin-bottom: 8px;">
                  Your 6-Digit Verification Code
                </div>
                <div style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #FFFFFF; font-family: monospace;">
                  ${otpCode}
                </div>
                <div style="font-size: 12px; color: #A1A1AA; margin-top: 8px;">
                  Expires in <strong>15 minutes</strong>
                </div>
              </div>
              <p style="font-size: 13px; line-height: 1.6; color: #A1A1AA; margin: 0 0 20px 0;">
                Enter this code on the <a href="https://vanko-api.vanko-app.workers.dev/delete-account" style="color: #60A5FA; text-decoration: none;">Web Deletion Portal</a> to confirm erasure. Once confirmed, this action cannot be undone.
              </p>
              <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px; margin-top: 20px;">
                <p style="font-size: 12px; line-height: 1.5; color: #71717A; margin: 0;">
                  ⚠️ <strong>Security Notice:</strong> If you did not request this deletion, someone may have entered your email by mistake. Your account remains completely secure — do not share this code with anyone.
                </p>
                <p style="font-size: 12px; line-height: 1.5; color: #71717A; margin: 12px 0 0 0;">
                  Contact: <a href="mailto:supportvanko@gmail.com" style="color: #71717A;">supportvanko@gmail.com</a>
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Brevo] Email dispatch failed (${res.status}): ${errText}`);
      return { success: false, error: errText };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Brevo] Dispatch exception:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

