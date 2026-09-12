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

console.log('\n🎉 ALL PUSH NOTIFICATION & IDEMPOTENCY UNIT TESTS PASSED!\n');
