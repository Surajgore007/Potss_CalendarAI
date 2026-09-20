import assert from 'node:assert/strict';
import {
  isEventFinished,
  isDeadlineActive,
  getUrgencyInfo,
  parseDateTime,
  detectClashes,
} from '../packages/shared/dist/utils/dateUtils.js';
import { generateEventId } from '../packages/shared/dist/services/firestore.js';

console.log('🧪 Starting Event App Lifecycle & Outbox Unit Tests...\n');

// Fixed reference date: 2026-09-12 14:00:00 (Saturday 2:00 PM)
const refDate = new Date(2026, 8, 12, 14, 0, 0); // Month is 0-indexed (8 = September)

// Test 1: Finished Events Detection
console.log('--- Test Suite 1: Finished Events Detection (isEventFinished) ---');

// Case 1A: Event ended yesterday
const pastEvent = {
  id: 'e1',
  title: 'Past Workshop',
  event_start_date: '2026-09-10',
  event_end_date: '2026-09-11',
  status: 'active',
};
assert.equal(isEventFinished(pastEvent, refDate), true, 'Past multi-day event must be finished');
console.log('✔ Case 1A passed: Past multi-day event identified as finished');

// Case 1B: Event today that finished earlier at 11:00 AM (refDate is 14:00)
const todayFinishedEvent = {
  id: 'e2',
  title: 'Morning Seminar',
  event_start_date: '2026-09-12',
  time: '11:00 AM',
  status: 'active',
};
assert.equal(isEventFinished(todayFinishedEvent, refDate), true, 'Today morning event must be finished at 2 PM');
console.log('✔ Case 1B passed: Event with earlier time today identified as finished');

// Case 1C: Event today in the future at 6:00 PM (refDate is 14:00)
const todayUpcomingEvent = {
  id: 'e3',
  title: 'Evening Meetup',
  event_start_date: '2026-09-12',
  time: '6:00 PM',
  status: 'active',
};
assert.equal(isEventFinished(todayUpcomingEvent, refDate), false, 'Today evening event must NOT be finished at 2 PM');
console.log('✔ Case 1C passed: Event later today identified as active');

// Case 1D: Multi-day Hackathon spanning across today to tomorrow
const hackathon = {
  id: 'e4',
  title: 'HackMIT 2026',
  event_start_date: '2026-09-12',
  event_end_date: '2026-09-13',
  status: 'active',
};
assert.equal(isEventFinished(hackathon, refDate), false, 'Hackathon ending tomorrow must NOT be finished');
console.log('✔ Case 1D passed: Ongoing multi-day hackathon identified as active');

// Case 1E: Explicit 'past' status
const explicitlyPast = {
  id: 'e5',
  title: 'Old Meetup',
  event_start_date: '2026-09-20',
  status: 'past',
};
assert.equal(isEventFinished(explicitlyPast, refDate), true, 'Explicit past status must be finished');
console.log('✔ Case 1E passed: Status "past" correctly flagged finished');

// Test 2: Deadline Activity Detection
console.log('\n--- Test Suite 2: Deadline Activity (isDeadlineActive) ---');

// Case 2A: Deadline yesterday
assert.equal(isDeadlineActive('2026-09-11', null, refDate), false, 'Yesterday deadline must be inactive');
console.log('✔ Case 2A passed: Yesterday deadline is inactive');

// Case 2B: Deadline tomorrow
assert.equal(isDeadlineActive('2026-09-13', null, refDate), true, 'Tomorrow deadline must be active');
console.log('✔ Case 2B passed: Tomorrow deadline is active');

// Case 2C: Deadline today with passed time (10:00 AM vs 14:00)
assert.equal(isDeadlineActive('2026-09-12', '10:00 AM', refDate), false, 'Passed deadline time today must be inactive');
console.log('✔ Case 2C passed: Passed deadline time today is inactive');

// Case 2D: Deadline today with future time (11:59 PM vs 14:00)
assert.equal(isDeadlineActive('2026-09-12', '11:59 PM', refDate), true, 'Future deadline time today must be active');
console.log('✔ Case 2D passed: Future deadline time today is active');

// Test 3: Urgency Calculation & Negative Countdowns
console.log('\n--- Test Suite 3: Urgency & Non-Negative Countdown Guard ---');

const passedEvent = {
  id: 'e6',
  title: 'Expired Hackathon',
  event_start_date: '2026-09-08',
  registration_deadline: '2026-09-09',
  status: 'active',
};
const urgencyInfo = getUrgencyInfo(passedEvent, refDate);
assert.ok(urgencyInfo.daysRemaining >= 0, 'Days remaining must never be negative');
assert.equal(urgencyInfo.urgencyLevel, 'passed', 'Passed event urgencyLevel must be "passed"');
console.log('✔ Test 3 passed: Never produces negative days remaining in getUrgencyInfo');

// Test 4: Canonical Client-Side Firestore ID Generator
console.log('\n--- Test Suite 4: Canonical Client-Side Firestore ID Generation ---');

const generatedId1 = generateEventId();
const generatedId2 = generateEventId('test_uid_123');
assert.equal(typeof generatedId1, 'string', 'Generated ID must be a string');
assert.equal(generatedId1.length, 20, 'Firestore auto-generated ID must be 20 characters');
assert.match(generatedId1, /^[a-zA-Z0-9]{20}$/, 'Firestore ID must only contain alphanumeric characters');
assert.notEqual(generatedId1, generatedId2, 'Subsequent generated IDs must be unique');
console.log(`✔ Test 4 passed: Generated canonical Firestore IDs: ${generatedId1}, ${generatedId2}`);

// Test 5: Outbox FIFO Queue & ID Reconciliation Simulation
console.log('\n--- Test Suite 5: Outbox FIFO Drain & ID Reconciliation ---');

// Simulated outbox queue
let queue = [
  { id: 'w1', action: 'add', eventId: 'local_temp_99', payload: { title: 'New Offline Event' } },
  { id: 'w2', action: 'edit', eventId: 'local_temp_99', payload: { title: 'New Offline Event (Renamed)' } },
  { id: 'w3', action: 'delete', eventId: 'local_temp_99' },
  { id: 'w4', action: 'add', eventId: 'local_temp_100', payload: { title: 'Second Event' } },
];

// Reconciliation function matching EventsContext.tsx
function simulateReconciliation(tempId, realId) {
  queue = queue.map((item) =>
    item.eventId === tempId ? { ...item, eventId: realId } : item
  );
}

// Drain first item (add local_temp_99) -> returns real Firestore ID 'firestore_doc_xyz123'
const tempId = queue[0].eventId;
const realId = 'firestore_doc_xyz123';
queue.shift(); // item 1 synced
simulateReconciliation(tempId, realId);

// Verify subsequent items for tempId were atomically updated to realId
assert.equal(queue[0].eventId, realId, 'Subsequent edit write must have remapped eventId');
assert.equal(queue[1].eventId, realId, 'Subsequent delete write must have remapped eventId');
assert.equal(queue[2].eventId, 'local_temp_100', 'Unrelated item must preserve its eventId');
console.log('✔ Test 5 passed: Outbox queue atomically reconciles temporary IDs to canonical Firestore IDs');

// Test 6: Passed Date Conflict Expiration (detectClashes)
console.log('\n--- Test Suite 6: Passed Date Conflict Expiration (detectClashes) ---');

// Case 6A: Two past events on the same date (2026-09-10, refDate is 2026-09-12)
const pastClashA = { id: 'c1', title: 'Old Hackathon A', event_start_date: '2026-09-10', status: 'upcoming' };
const pastClashB = { id: 'c2', title: 'Old Hackathon B', event_start_date: '2026-09-10', status: 'upcoming' };
const pastClashes = detectClashes([pastClashA, pastClashB], refDate);
assert.equal(pastClashes.length, 0, 'Past events on the same day must NOT produce an active clash');
console.log('✔ Case 6A passed: Historical/passed event dates produce 0 conflicts');

// Case 6B: One past event and one future event
const futureClashA = { id: 'c3', title: 'Future Conf A', event_start_date: '2026-09-15', status: 'upcoming' };
const mixedClashes = detectClashes([pastClashA, futureClashA], refDate);
assert.equal(mixedClashes.length, 0, 'Past event vs future event must NOT produce a clash');
console.log('✔ Case 6B passed: Past event vs future event produces 0 conflicts');

// Case 6C: Two upcoming events on the same day (2026-09-15)
const futureClashB = { id: 'c4', title: 'Future Conf B', event_start_date: '2026-09-15', status: 'upcoming' };
const activeClashes = detectClashes([futureClashA, futureClashB], refDate);
assert.equal(activeClashes.length, 1, 'Upcoming events on the same day must produce 1 conflict');
assert.equal(activeClashes[0].reason, 'same_day_event');
console.log('✔ Case 6C passed: Upcoming events on the same day produce active conflict');

// Case 6D: Advancing reference date past the event date causes the conflict to automatically expire
const laterDate = new Date(2026, 8, 16, 0, 0, 0); // 2026-09-16 (day after 2026-09-15)
const expiredClashes = detectClashes([futureClashA, futureClashB], laterDate);
assert.equal(expiredClashes.length, 0, 'Conflict must automatically expire and drop to 0 once the date passes');
console.log('✔ Case 6D passed: Conflict automatically drops to 0 once event date passes');

console.log('\n🎉 ALL LIFECYCLE, OUTBOX, DEADLINE, & CLASH EXPIRATION TESTS PASSED SUCCESSFULLY!\n');
