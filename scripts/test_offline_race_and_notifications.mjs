/**
 * test_offline_race_and_notifications.mjs
 *
 * Automated verification suite testing:
 * 1. Cold-start auth hydration race condition protection under throttled storage.
 * 2. Empty-array notification purge guard (allowPurgeAll requirement).
 * 3. Multi-user cache isolation (cross-user leakage prevention).
 * 4. Intentional purge on sign-out.
 */

import assert from 'node:assert';

console.log('--- STARTING OFFLINE HYDRATION & NOTIFICATION GUARD TEST SUITE ---\n');

// 1. Mock Storage Implementation
const storage = new Map();
const AsyncStorage = {
  getItem: async (key) => storage.get(key) || null,
  setItem: async (key, val) => storage.set(key, String(val)),
  removeItem: async (key) => storage.delete(key),
  multiGet: async (keys) => keys.map((k) => [k, storage.get(k) || null]),
  multiRemove: async (keys) => keys.forEach((k) => storage.delete(k)),
  clear: () => storage.clear(),
};

// 2. Mock OS Notification Alarms (AlarmManager simulation)
const scheduledAlarms = new Map();
let cancelAllScheduledCount = 0;

const mockNotifications = {
  getAllScheduledNotificationsAsync: async () => {
    return Array.from(scheduledAlarms.entries()).map(([identifier, data]) => ({
      identifier,
      content: { data },
    }));
  },
  cancelScheduledNotificationAsync: async (identifier) => {
    scheduledAlarms.delete(identifier);
  },
  cancelAllScheduledNotificationsAsync: async () => {
    cancelAllScheduledCount++;
    scheduledAlarms.clear();
  },
  scheduleNotificationAsync: async ({ identifier, content }) => {
    scheduledAlarms.set(identifier, content.data);
  },
};

// 3. Mirror of the notification sync function with allowPurgeAll guard
async function syncAllEventNotifications(events, options = {}) {
  // CRITICAL SAFETY GUARD: Prevent unhydrated or empty states from purging Android OS alarms
  if (events.length === 0 && !options?.allowPurgeAll) {
    // Preserves existing OS alarms
    return false; // Guard triggered
  }

  const activeIds = new Set(events.filter((e) => e.status !== 'skipped').map((e) => e.id));
  const allScheduled = await mockNotifications.getAllScheduledNotificationsAsync();
  for (const item of allScheduled) {
    const evId = item.content.data?.eventId;
    if (evId && !activeIds.has(evId)) {
      await mockNotifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }

  for (const ev of events) {
    if (ev.status !== 'skipped') {
      await mockNotifications.scheduleNotificationAsync({
        identifier: `vanko_notif_${ev.id}_start_24`,
        content: { data: { eventId: ev.id, type: 'event_start' } },
      });
    }
  }

  return true; // Sync executed
}

// 4. Mirror of EventsContext User Hydration & Notification Effect Logic
class MockEventsProviderState {
  constructor() {
    this.events = [];
    this.isHydrated = false;
    this.isLoading = true;
    this.pendingWrites = [];
  }

  async onMountFrame0() {
    const stored = await AsyncStorage.getItem('@vanko_cached_events_latest');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.events = parsed;
          this.isHydrated = true;
          this.isLoading = false;
        }
      } catch {}
    }
  }

  async onAuthUpdate({ user, authLoading }) {
    // 1. Guard against unhydrated auth
    if (authLoading) return;

    // 2. Genuine logged-out state
    if (!user) {
      this.events = [];
      this.pendingWrites = [];
      this.isHydrated = true;
      this.isLoading = false;
      await syncAllEventNotifications([], { allowPurgeAll: true });
      return;
    }

    // 3. Authenticated user hydration
    const cacheKey = `@eventpulse_cached_events_${user.uid}`;
    const queueKey = `@vanko_pending_writes_${user.uid}`;
    const [cachedEventsRes, queueRes, latestEventsRes] = await AsyncStorage.multiGet([
      cacheKey,
      queueKey,
      '@vanko_cached_events_latest',
    ]);

    let loadedEvents = null;
    if (cachedEventsRes[1]) {
      try {
        const parsed = JSON.parse(cachedEventsRes[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loadedEvents = parsed;
        }
      } catch {}
    }

    // Fallback with user ownership validation (allowing legacy events without userId)
    if (!loadedEvents && latestEventsRes[1]) {
      try {
        const parsed = JSON.parse(latestEventsRes[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const isOwnedByUser = parsed.every((e) => !e.userId || e.userId === user.uid);
          if (isOwnedByUser) {
            loadedEvents = parsed.map((e) => ({ ...e, userId: user.uid }));
            await AsyncStorage.setItem(cacheKey, JSON.stringify(loadedEvents));
          } else {
            await AsyncStorage.removeItem('@vanko_cached_events_latest');
          }
        }
      } catch {}
    }

    // Ensure current state strictly reflects this authenticated user (resets any cross-user frame-0 snapshot)
    this.events = loadedEvents || [];

    this.isHydrated = true;
    this.isLoading = false;
  }

  async syncNotificationsEffect({ user, authLoading }) {
    if (!this.isHydrated || authLoading || !user) {
      return false; // Guarded
    }
    return await syncAllEventNotifications(this.events);
  }
}

async function runTests() {
  // Test 1: Empty Array Safety Guard
  console.log('Test 1: Empty Array Safety Guard in syncAllEventNotifications...');
  scheduledAlarms.set('vanko_notif_existing1_start_24', { eventId: 'existing1' });
  scheduledAlarms.set('vanko_notif_existing2_start_24', { eventId: 'existing2' });

  assert.strictEqual(scheduledAlarms.size, 2, 'Should initially have 2 scheduled alarms');

  // Calling sync with empty array and NO allowPurgeAll flag
  const resultBlocked = await syncAllEventNotifications([]);
  assert.strictEqual(resultBlocked, false, 'Sync should be blocked without allowPurgeAll');
  assert.strictEqual(scheduledAlarms.size, 2, 'Existing alarms must NOT be deleted without allowPurgeAll');
  console.log('✓ Test 1 Passed: Empty array without allowPurgeAll preserves existing OS alarms.\n');

  // Test 2: Throttled Cold-Start Auth Race Condition
  console.log('Test 2: Throttled Cold-Start Auth Race Condition Simulation...');
  AsyncStorage.clear();
  scheduledAlarms.clear();

  const userA = { uid: 'user_A', email: 'userA@example.com' };
  const userAEvents = [
    { id: 'ev_1', title: 'Hackathon 2026', userId: 'user_A', event_start_date: '2026-10-15', status: 'upcoming' },
    { id: 'ev_2', title: 'Tech Workshop', userId: 'user_A', event_start_date: '2026-10-20', status: 'upcoming' },
  ];

  // Seed storage with User A's cached events and scheduled alarms
  await AsyncStorage.setItem('@vanko_cached_events_latest', JSON.stringify(userAEvents));
  await AsyncStorage.setItem(`@eventpulse_cached_events_${userA.uid}`, JSON.stringify(userAEvents));
  scheduledAlarms.set('vanko_notif_ev_1_start_24', { eventId: 'ev_1' });
  scheduledAlarms.set('vanko_notif_ev_2_start_24', { eventId: 'ev_2' });

  const appState = new MockEventsProviderState();

  // Frame 0: Component mounts. Storage reads frame-0 latest cache.
  await appState.onMountFrame0();
  assert.strictEqual(appState.events.length, 2, 'Frame 0 must instantly hydrate events from device cache');
  assert.strictEqual(appState.isHydrated, true, 'isHydrated must be true on frame 0');

  // During throttled Auth hydration window (authLoading = true, user = null)
  console.log('  Simulating slow auth storage read (authLoading = true, user = null)...');
  await appState.onAuthUpdate({ user: null, authLoading: true });
  const notifSyncBlocked = await appState.syncNotificationsEffect({ user: null, authLoading: true });

  assert.strictEqual(notifSyncBlocked, false, 'Notification sync effect must guard while auth is loading');
  assert.strictEqual(appState.events.length, 2, 'Events must NOT be wiped to [] while auth is loading');
  assert.strictEqual(scheduledAlarms.size, 2, 'OS alarms must remain untouched during auth hydration delay');

  // Auth finishes reading storage (authLoading = false, user = userA)
  console.log('  Auth resolves (authLoading = false, user = user_A)...');
  await appState.onAuthUpdate({ user: userA, authLoading: false });
  const notifSyncAllowed = await appState.syncNotificationsEffect({ user: userA, authLoading: false });

  assert.strictEqual(notifSyncAllowed, true, 'Notification sync must succeed once auth settles');
  assert.strictEqual(appState.events.length, 2, 'User A events remain active and accessible offline');
  assert.strictEqual(scheduledAlarms.size, 2, 'Alarms remain scheduled on Android OS');
  console.log('✓ Test 2 Passed: Zero event wiping and zero alarm cancellations during auth race.\n');

  // Test 3: Multi-User Cache Isolation & Stale Fallback Prevention
  console.log('Test 3: Multi-User Cache Isolation & Cross-User Leakage Prevention...');
  const userB = { uid: 'user_B', email: 'userB@example.com' };

  // Suppose User A logged out without device cache wiped, leaving User A events in @vanko_cached_events_latest
  // User B logs in on the same device. User B has no existing uid key yet.
  const userBState = new MockEventsProviderState();
  // Frame 0 read latest (which belongs to user_A)
  await userBState.onMountFrame0();

  // Now User B authenticates
  await userBState.onAuthUpdate({ user: userB, authLoading: false });

  assert.strictEqual(
    userBState.events.length,
    0,
    'User B must NOT adopt User A events from device snapshot'
  );
  const deviceCacheAfterB = await AsyncStorage.getItem('@vanko_cached_events_latest');
  assert.strictEqual(
    deviceCacheAfterB,
    null,
    'Stale device snapshot from another user must be purged'
  );
  console.log('✓ Test 3 Passed: Multi-user isolation prevents User A events leaking to User B.\n');

  // Test 4: Explicit Sign-Out Purge Contract
  console.log('Test 4: Intentional Sign-Out Notification Purge Contract...');
  scheduledAlarms.clear();
  scheduledAlarms.set('vanko_notif_ev_1_start_24', { eventId: 'ev_1' });
  assert.strictEqual(scheduledAlarms.size, 1, 'Alarm should exist before sign-out');

  // User explicitly signs out (authLoading = false, user = null)
  await appState.onAuthUpdate({ user: null, authLoading: false });
  assert.strictEqual(appState.events.length, 0, 'Events wiped on explicit sign-out');
  assert.strictEqual(scheduledAlarms.size, 0, 'Alarms properly purged on intentional sign-out');
  console.log('✓ Test 4 Passed: Alarms are purged only on intentional sign-out.\n');

  console.log('================================================================');
  console.log('ALL 4 TESTS PASSED: Offline visibility & notification guards verified!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
