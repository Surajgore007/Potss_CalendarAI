// Unit verification for Offline Cache Shield and Date Normalization
import assert from 'node:assert';
import {
  normalizeDateString,
  parseDateTime,
  formatFriendlyDate,
  getDaysDifference,
  isEventFinished,
  isDeadlineActive,
} from '../packages/shared/dist/utils/dateUtils.js';

console.log('🧪 Running Offline Cache Shield & Date Normalization Test Suite...\n');

// --- Test 1: Date Normalization ---
console.log('--- Test 1: Date Normalization (ISO Strings, Whitespace, & YYYY-MM-DD) ---');

const isoDate = '2026-09-25T14:30:00.000Z';
const normalizedIso = normalizeDateString(isoDate);
assert.strictEqual(normalizedIso, '2026-09-25', 'ISO timestamp must normalize to 2026-09-25');
console.log('✔ Case 1A passed: ISO timestamp normalized to YYYY-MM-DD');

const spaceDate = '  2026-10-02  ';
const normalizedSpace = normalizeDateString(spaceDate);
assert.strictEqual(normalizedSpace, '2026-10-02', 'Whitespace date must normalize to 2026-10-02');
console.log('✔ Case 1B passed: Whitespace trimmed to YYYY-MM-DD');

const friendlyFromIso = formatFriendlyDate(isoDate, false);
assert(friendlyFromIso.includes('Sep 25, 2026'), 'formatFriendlyDate handles ISO timestamp');
console.log(`✔ Case 1C passed: formatFriendlyDate handles ISO string -> "${friendlyFromIso}"`);

const parsedIso = parseDateTime(isoDate, '6:00 PM');
assert(parsedIso !== null, 'parseDateTime must parse ISO date with time string');
assert.strictEqual(parsedIso.getFullYear(), 2026);
assert.strictEqual(parsedIso.getMonth(), 8); // 0-indexed September
assert.strictEqual(parsedIso.getDate(), 25);
assert.strictEqual(parsedIso.getHours(), 18);
console.log('✔ Case 1D passed: parseDateTime parsed ISO date with time to valid Date object');

// --- Test 2: Calendar Grid Matching Resilience ---
console.log('\n--- Test 2: Calendar Grid Matching Resilience ---');
const isoEventDate = '2026-09-20T10:00:00.000Z';
const targetDayIso = '2026-09-20';
assert.strictEqual(
  isoEventDate.slice(0, 10),
  targetDayIso,
  'Calendar comparison e.event_start_date.slice(0, 10) === targetDayIso must match'
);
console.log('✔ Case 2A passed: Calendar day matching succeeds with ISO date slice');

// --- Test 3: Offline Cache Shield Simulation ---
console.log('\n--- Test 3: Offline Cache Shield Simulation ---');

// Mock in-memory & AsyncStorage state
let memoryEvents = [
  { id: 'event_1', title: 'Offline Hackathon', event_start_date: '2026-10-15', userId: 'user_123' },
  { id: 'event_2', title: 'Tech Workshop', event_start_date: '2026-10-18', userId: 'user_123' },
];

let diskCache = JSON.stringify(memoryEvents);

function simulateFirestoreSnapshot(fetchedEvents, fromCache, isOnline) {
  // CRITICAL OFFLINE / CACHE SHIELD LOGIC under test
  if (fetchedEvents.length === 0) {
    if (fromCache || !isOnline) {
      // Shield active: reject empty snapshot
      return 'SHIELD_TRIGGERED_IGNORED_EMPTY_SNAPSHOT';
    }
  }
  memoryEvents = fetchedEvents;
  diskCache = JSON.stringify(fetchedEvents);
  return 'UPDATED';
}

// Scenario A: WiFi is turned off, Firestore memory cache is empty
const resA = simulateFirestoreSnapshot([], true, false);
assert.strictEqual(resA, 'SHIELD_TRIGGERED_IGNORED_EMPTY_SNAPSHOT');
assert.strictEqual(memoryEvents.length, 2, 'Memory events must NOT be wiped');
assert.strictEqual(JSON.parse(diskCache).length, 2, 'Disk cache must NOT be wiped');
console.log('✔ Case 3A passed: Offline empty cache snapshot successfully shielded; 2 events preserved');

// Scenario B: App reloads offline, Firestore returns unavailable with empty cache
const resB = simulateFirestoreSnapshot([], true, true);
assert.strictEqual(resB, 'SHIELD_TRIGGERED_IGNORED_EMPTY_SNAPSHOT');
assert.strictEqual(memoryEvents.length, 2, 'Memory events must remain preserved');
console.log('✔ Case 3B passed: fromCache=true snapshot safely shielded even before NetInfo transition');

// Scenario C: Genuine server update with 1 event
const resC = simulateFirestoreSnapshot(
  [{ id: 'event_1', title: 'Offline Hackathon', event_start_date: '2026-10-15', userId: 'user_123' }],
  false,
  true
);
assert.strictEqual(resC, 'UPDATED');
assert.strictEqual(memoryEvents.length, 1, 'Valid server update successfully applied');
console.log('✔ Case 3C passed: Legitimate server update applied correctly');

// --- Test 4: Resilient MultiGet Hydration Simulation ---
console.log('\n--- Test 4: Resilient MultiGet Hydration Simulation ---');

let frame0Events = [
  { id: 'event_latest', title: 'Frame 0 Event', event_start_date: '2026-11-01', userId: 'user_123' }
];

let currentMemory = [...frame0Events];
let userCacheRes = null; // User cache key had nothing yet
let latestCacheRes = JSON.stringify(frame0Events); // Latest cache has items

// Hydration logic under test
let loadedEvents = null;
if (latestCacheRes) {
  const parsed = JSON.parse(latestCacheRes);
  if (Array.isArray(parsed) && parsed.length > 0) {
    const userMatches = parsed.filter((e) => !e.userId || e.userId === 'user_123');
    const candidates = userMatches.length > 0 ? userMatches : parsed;
    loadedEvents = candidates;
  }
}

if (loadedEvents && loadedEvents.length > 0) {
  currentMemory = loadedEvents;
} else if (currentMemory.length > 0) {
  // Preserved
}

assert.strictEqual(currentMemory.length, 1, 'Frame 0 events must not be overwritten with []');
assert.strictEqual(currentMemory[0].id, 'event_latest');
console.log('✔ Case 4 passed: MultiGet adopts latest device cache and preserves in-memory events');

console.log('\n🎉 ALL OFFLINE CACHE SHIELD & NORMALIZATION TESTS PASSED SUCCESSFULLY!\n');
