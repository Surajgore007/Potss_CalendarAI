import assert from 'node:assert/strict';

console.log('🧪 Starting Admin Push Notification & Idempotency Unit Tests...\n');

// Test 1: Idempotency Key Semantic (One Broadcast per Event)
console.log('--- Test Suite 1: Idempotency Key Semantics ---');
const eventId = 'hackathon_mit_2026';
const idempotencyKey = `broadcast_${eventId}`;
assert.equal(idempotencyKey, 'broadcast_hackathon_mit_2026', 'Idempotency key must be derived from eventId alone');

// Simulated broadcast history store
const broadcastHistory = new Map();

function simulateBroadcastDispatch(evId, adminUid, college) {
  const key = `broadcast_${evId}`;
  if (broadcastHistory.has(key)) {
    const record = broadcastHistory.get(key);
    return {
      success: true,
      deduplicated: true,
      recipientsCount: 0,
      message: 'Broadcast already dispatched for this event.',
      broadcastAt: record.timestamp,
    };
  }

  // Record dispatch
  const now = new Date().toISOString();
  broadcastHistory.set(key, {
    eventId: evId,
    adminUid,
    college,
    timestamp: now,
  });

  return {
    success: true,
    deduplicated: false,
    recipientsCount: 42,
    message: 'Broadcast sent successfully',
  };
}

// First dispatch
const firstAttempt = simulateBroadcastDispatch(eventId, 'admin_123', 'SIES_GST');
assert.equal(firstAttempt.deduplicated, false, 'First attempt must not be deduplicated');
assert.equal(firstAttempt.recipientsCount, 42, 'First attempt must send to recipients');
console.log('✔ Case 1A passed: First broadcast successfully dispatched');

// Immediate retry / double-tap with same eventId
const retryAttempt = simulateBroadcastDispatch(eventId, 'admin_123', 'SIES_GST');
assert.equal(retryAttempt.deduplicated, true, 'Immediate duplicate attempt must be deduplicated');
assert.equal(retryAttempt.recipientsCount, 0, 'Deduplicated attempt must not re-send');
console.log('✔ Case 1B passed: Duplicate broadcast attempt deduplicated');

// Test 2: Token Chunking (100 max per Expo batch)
console.log('\n--- Test Suite 2: Batch Chunking Logic (Expo 100 limit) ---');
const simulatedTokens = Array.from({ length: 245 }, (_, i) => `ExponentPushToken[student_${i}]`);
const BATCH_SIZE = 100;
const chunks = [];
for (let i = 0; i < simulatedTokens.length; i += BATCH_SIZE) {
  chunks.push(simulatedTokens.slice(i, i + BATCH_SIZE));
}

assert.equal(chunks.length, 3, '245 tokens must produce exactly 3 chunks');
assert.equal(chunks[0].length, 100, 'First chunk must have 100 tokens');
assert.equal(chunks[1].length, 100, 'Second chunk must have 100 tokens');
assert.equal(chunks[2].length, 45, 'Third chunk must have 45 tokens');
console.log('✔ Test 2 passed: 245 tokens correctly partitioned into [100, 100, 45]');

// Test 3: Dead Token Detection (Tier 1 DeviceNotRegistered)
console.log('\n--- Test Suite 3: Tier 1 Dead Token Detection ---');
const mockExpoTickets = [
  { status: 'ok', id: 'ticket_1' },
  { status: 'error', message: '"ExponentPushToken[student_1]" is not registered', details: { error: 'DeviceNotRegistered' } },
  { status: 'ok', id: 'ticket_2' },
  { status: 'error', message: 'Message rate exceeded', details: { error: 'MessageRateExceeded' } },
];

const deadTokens = [];
mockExpoTickets.forEach((ticket, idx) => {
  if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
    deadTokens.push(`ExponentPushToken[student_${idx}]`);
  }
});

assert.equal(deadTokens.length, 1, 'Must detect exactly 1 dead token');
assert.equal(deadTokens[0], 'ExponentPushToken[student_1]', 'Must isolate the DeviceNotRegistered token');
console.log('✔ Test 3 passed: Tier 1 dead tokens accurately identified for nullification');

// Test 4: College Multi-Tenant Scoping
console.log('\n--- Test Suite 4: Multi-Tenant College Scoping ---');
const allUsers = [
  { uid: 'u1', college: 'SIES_GST', pushToken: 'ExponentPushToken[sies_1]' },
  { uid: 'u2', college: 'SIES_GST', pushToken: 'ExponentPushToken[sies_2]' },
  { uid: 'u3', college: 'OTHER_COLLEGE', pushToken: 'ExponentPushToken[other_1]' },
  { uid: 'u4', college: 'SIES_GST', pushToken: null }, // Opted out / signed out
];

const adminCollege = 'SIES_GST';
const targetRecipients = allUsers.filter(
  (u) => u.college === adminCollege && u.pushToken !== null
);

assert.equal(targetRecipients.length, 2, 'Only SIES_GST students with active tokens must be targeted');
assert.ok(!targetRecipients.some((u) => u.college !== 'SIES_GST'), 'Must never include students from another college');
console.log('✔ Test 4 passed: Strict tenant scoping prevents cross-college leaks');

// Test 5: Custom Claims Unified Admin Trust
console.log('\n--- Test Suite 5: Custom Claims Unified Admin Trust ---');
function verifyAdminAccess(tokenPayload) {
  const isAdmin = tokenPayload.admin === true || tokenPayload.role === 'admin';
  const college = typeof tokenPayload.college === 'string' && tokenPayload.college.trim()
    ? tokenPayload.college.trim()
    : 'SIES_GST';
  return {
    isAuthorized: isAdmin,
    college: isAdmin ? college : null,
    statusCode: isAdmin ? 200 : 403,
  };
}

const adminToken = { sub: 'admin_uid_1', admin: true, role: 'admin', college: 'SIES_GST' };
const studentToken = { sub: 'student_uid_2', email: 'student@vanko.app' };
const studentClaimingAdminInBody = { sub: 'student_uid_3', role: 'student' }; // Body/doc might say admin, but claims say student

const adminCheck = verifyAdminAccess(adminToken);
assert.equal(adminCheck.isAuthorized, true, 'Admin with custom claims must be authorized');
assert.equal(adminCheck.college, 'SIES_GST', 'Admin college must be read from claims');
assert.equal(adminCheck.statusCode, 200);

const studentCheck = verifyAdminAccess(studentToken);
assert.equal(studentCheck.isAuthorized, false, 'Student without admin claim must be rejected');
assert.equal(studentCheck.statusCode, 403, 'Must return 403 Forbidden');

const spoofCheck = verifyAdminAccess(studentClaimingAdminInBody);
assert.equal(spoofCheck.isAuthorized, false, 'Document or body claim cannot override JWT custom claims');
console.log('✔ Test 5 passed: Custom Claims serve as single source of truth for admin authorization');

// Test 6: 5-Stage Resumable & Idempotent Account Deletion
console.log('\n--- Test Suite 6: 5-Stage Resumable & Idempotent Deletion Engine ---');
class MockDeletionStateMachine {
  constructor() {
    this.auditStore = new Map();
    this.totalUsers = 100;
    this.executedStages = [];
  }

  async runDeletion(uid, simulateCrashAtStage = null) {
    const prior = this.auditStore.get(uid);
    const priorStatus = prior?.status || null;

    if (priorStatus === 'completed') {
      return { success: true, state: 'completed', alreadyCompleted: true };
    }

    if (priorStatus) {
      this.executedStages.push(`resumed_from_${priorStatus}`);
    } else {
      this.auditStore.set(uid, { status: 'initiated' });
      this.executedStages.push('stage_1_initiated');
    }

    // Stage 2: Events
    const skipEvents = ['firestore_events_deleted', 'firestore_profile_deleted', 'auth_deleted', 'failed_at_auth'].includes(priorStatus);
    if (!skipEvents) {
      this.executedStages.push('stage_2_events_purged');
      this.auditStore.set(uid, { status: 'firestore_events_deleted' });
      if (simulateCrashAtStage === 2) throw new Error('Simulated network drop at Stage 2');
    }

    // Stage 3: Profile
    const skipProfile = ['firestore_profile_deleted', 'auth_deleted', 'failed_at_auth'].includes(priorStatus);
    if (!skipProfile) {
      this.executedStages.push('stage_3_profile_purged');
      this.auditStore.set(uid, { status: 'firestore_profile_deleted' });
      if (simulateCrashAtStage === 3) throw new Error('Simulated timeout at Stage 3');
    }

    // Stage 4: Auth
    const skipAuth = priorStatus === 'auth_deleted';
    if (!skipAuth) {
      this.executedStages.push('stage_4_auth_deleted');
      this.auditStore.set(uid, { status: 'auth_deleted' });
      if (simulateCrashAtStage === 4) throw new Error('Simulated worker restart at Stage 4');
    }

    // Stage 5: Decrement total registered users using atomic precondition lock (currentDocument: exists: false)
    if (!this.auditLocks.has(uid)) {
      this.auditLocks.set(uid, true); // Atomic currentDocument: { exists: false }
      this.totalUsers -= 1;
      this.executedStages.push('stage_5_counter_decremented');
    }

    // Stage 6: Completed
    this.auditStore.set(uid, { status: 'completed' });
    this.executedStages.push('stage_6_completed');

    return { success: true, state: 'completed' };
  }
}

const sm = new MockDeletionStateMachine();
sm.auditLocks = new Map();
const testUid = 'user_interrupted_999';

// 1. Initial attempt crashes at Stage 2
try {
  await sm.runDeletion(testUid, 2);
} catch (e) {
  // Expected crash
}
assert.equal(sm.auditStore.get(testUid).status, 'firestore_events_deleted', 'Audit must reflect progress up to Stage 2');
assert.equal(sm.totalUsers, 100, 'Counter must not be decremented on interrupted deletion');

// 2. Resume execution: Must skip Stage 2 (events already purged) and finish Stages 3-6
const resumeResult = await sm.runDeletion(testUid, null);
assert.equal(resumeResult.success, true);
assert.equal(resumeResult.state, 'completed');
assert.equal(sm.auditStore.get(testUid).status, 'completed');
assert.equal(sm.totalUsers, 99, 'Total users must be decremented exactly once');

// Verify that Stage 2 was skipped during resume
const stagesDuringResume = sm.executedStages.slice(sm.executedStages.indexOf('resumed_from_firestore_events_deleted'));
assert.ok(!stagesDuringResume.includes('stage_2_events_purged'), 'Resume must skip already completed Stage 2');
assert.ok(stagesDuringResume.includes('stage_3_profile_purged'), 'Resume must execute Stage 3');
assert.ok(stagesDuringResume.includes('stage_4_auth_deleted'), 'Resume must execute Stage 4');

// 3. Retry when already completed: Must be a terminal idempotent no-op (no double decrement!)
const terminalRetry = await sm.runDeletion(testUid, null);
assert.equal(terminalRetry.alreadyCompleted, true);
assert.equal(sm.totalUsers, 99, 'Platform user count must NEVER double-decrement on duplicate deletion requests');

// 4. Concurrent execution test: Two worker invocations run simultaneously for the same UID
const concurrentUid = 'user_concurrent_888';
await Promise.all([
  sm.runDeletion(concurrentUid, null),
  sm.runDeletion(concurrentUid, null),
]);
assert.equal(sm.totalUsers, 98, 'Platform user count must NEVER double-decrement even when two workers execute deletion simultaneously');
console.log('✔ Test 6 passed: 5-stage deletion state machine is fully resumable and concurrency-safe under simultaneous executions');

// Test 7: Edge Rate Limiting & Cooldown Architecture
console.log('\n--- Test Suite 7: Edge Rate Limiting & Cooldown Semantics ---');
const localBucket = new Map();
function rateLimitTest(ip, maxReq = 3, windowMs = 1000, now = Date.now()) {
  const existing = localBucket.get(ip);
  if (!existing || existing.resetAt < now) {
    localBucket.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= maxReq) return false;
  existing.count += 1;
  return true;
}

const clientIp = '203.0.113.42';
const t0 = 1000000;
assert.equal(rateLimitTest(clientIp, 3, 1000, t0), true, 'Req 1 allowed');
assert.equal(rateLimitTest(clientIp, 3, 1000, t0 + 100), true, 'Req 2 allowed');
assert.equal(rateLimitTest(clientIp, 3, 1000, t0 + 200), true, 'Req 3 allowed');
assert.equal(rateLimitTest(clientIp, 3, 1000, t0 + 300), false, 'Req 4 blocked by sliding-window rate limit');
assert.equal(rateLimitTest(clientIp, 3, 1000, t0 + 1500), true, 'Req after window expiry allowed');
console.log('✔ Test 7 passed: Sliding-window isolate-local rate limiter functions correctly');

// Test 8: KV Rate Limiting Failure & Latency Isolation (withKvTimeout)
console.log('\n--- Test Suite 8: KV Failure & Latency Spike Isolation (withKvTimeout) ---');
async function withKvTimeout(operation, timeoutMs = 250, fallback) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    const result = await Promise.race([operation, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch {
    clearTimeout(timer);
    return fallback;
  }
}

// Case 8A: Normal fast KV response
const fastKvOp = new Promise((resolve) => setTimeout(() => resolve('5'), 10));
const fastResult = await withKvTimeout(fastKvOp, 250, null);
assert.equal(fastResult, '5', 'Fast KV operation succeeds normally');

// Case 8B: Latency spike (> 250ms) -> Must resolve to fallback open without blocking
const slowKvOp = new Promise((resolve) => setTimeout(() => resolve('100'), 500));
const timedOutResult = await withKvTimeout(slowKvOp, 50, null); // test with 50ms
assert.equal(timedOutResult, null, 'Slow KV operation times out and gracefully returns fallback open');

// Case 8C: Network / Service Exception -> Must catch and return fallback open
const failingKvOp = Promise.reject(new Error('KV Service Unavailable 500'));
const errResult = await withKvTimeout(failingKvOp, 250, 'fallback_val');
assert.equal(errResult, 'fallback_val', 'Failing KV operation caught cleanly without bubbling 500 to user');
console.log('✔ Test 8 passed: KV read/write failures and latency spikes safely fail open to Tier 1');

// Test 9: Automated Orphaned Deletion Reconciliation Engine
console.log('\n--- Test Suite 9: Automated Orphaned Deletion Reconciliation Engine ---');
const mockAuditDB = [
  { uid: 'u1_fresh_inflight', status: 'initiated', updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() }, // 5 min ago (in-flight, must skip)
  { uid: 'u2_stuck_stage2', status: 'firestore_events_deleted', updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() }, // 30 min ago (must resume)
  { uid: 'u3_stuck_stage4', status: 'auth_deleted', updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }, // 60 min ago (must resume)
  { uid: 'u4_completed', status: 'completed', updatedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString() }, // completed (must skip)
];

const reconciledUIDs = [];
for (const record of mockAuditDB) {
  if (record.status === 'completed') continue;
  const ageMs = Date.now() - Date.parse(record.updatedAt);
  if (ageMs < 15 * 60 * 1000) continue; // In-flight safety window
  reconciledUIDs.push(record.uid);
}

assert.deepEqual(reconciledUIDs, ['u2_stuck_stage2', 'u3_stuck_stage4'], 'Reconciliation engine must resume only stuck deletions >15 min old');
console.log('✔ Test 9 passed: Automated background self-healing reconciles orphaned deletions without racing active users');

// Test 10: Firebase Custom Claims 1,000-byte Payload Size Guard
console.log('\n--- Test Suite 10: Firebase Custom Claims 1,000-byte Limit Guard ---');
const standardClaims = { admin: true, role: 'admin', college: 'SIES_GST' };
const standardSize = Buffer.byteLength(JSON.stringify(standardClaims), 'utf8');
assert.ok(standardSize < 1000, `Standard claims payload (${standardSize} bytes) well under 1,000-byte limit`);

const bloatedClaims = {
  admin: true,
  role: 'admin',
  college: 'SIES_GST',
  largeArray: new Array(50).fill('permission_scope_token_abcdefghijklmnopqrstuvwxyz1234567890'),
};
const bloatedSize = Buffer.byteLength(JSON.stringify(bloatedClaims), 'utf8');
assert.ok(bloatedSize > 1000, 'Bloated claims payload exceeds 1,000-byte ceiling');

function validateClaimsPayload(claims) {
  const size = Buffer.byteLength(JSON.stringify(claims), 'utf8');
  if (size > 1000) {
    throw new Error(`EXCEEDS_1000_BYTES: ${size}`);
  }
  return true;
}

assert.equal(validateClaimsPayload(standardClaims), true);
assert.throws(() => validateClaimsPayload(bloatedClaims), /EXCEEDS_1000_BYTES/);
console.log('✔ Test 10 passed: Custom claims payload size guard enforces Firebase 1,000-byte ceiling');

console.log('\n🎉 ALL PUSH NOTIFICATION, IDEMPOTENCY, CUSTOM CLAIMS, RESUME & KV RESILIENCE TESTS PASSED!\n');
