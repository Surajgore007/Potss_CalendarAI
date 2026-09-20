import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarEvent, isEventFinished } from '@eventpulse/shared';

// Lazy loader for notifications on native platforms
let notificationsModule: typeof import('expo-notifications') | null = null;
function getNotifications(): typeof import('expo-notifications') | null {
  if (Platform.OS === 'web') return null;
  if (!notificationsModule) {
    try {
      notificationsModule = require('expo-notifications');
      notificationsModule?.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      if (Platform.OS === 'android') {
        notificationsModule?.setNotificationChannelAsync('vanko_reminders', {
          name: 'Reminders & Deadlines',
          description: 'Timely reminders for upcoming event dates and registration deadlines.',
          importance: notificationsModule.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#18181B',
          enableLights: true,
          enableVibrate: true,
        });
      }
    } catch {
      notificationsModule = null;
    }
  }
  return notificationsModule;
}

const LEGACY_PURGE_KEY = '@vanko_legacy_notifs_purged_v1';

/**
 * One-time cleanup: purge legacy random-UUID notifications scheduled before deterministic IDs
 */
export async function ensureLegacyNotificationsPurged(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const purged = await AsyncStorage.getItem(LEGACY_PURGE_KEY);
    if (!purged) {
      const notif = getNotifications();
      if (notif) {
        await notif.cancelAllScheduledNotificationsAsync();
      }
      await AsyncStorage.setItem(LEGACY_PURGE_KEY, 'true');
    }
  } catch {
    // Ignored
  }
}

/**
 * Request notification permissions (local alarms & notifications)
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') return true;
        if (Notification.permission !== 'denied') {
          const res = await Notification.requestPermission();
          return res === 'granted';
        }
      }
      return false;
    }

    const notif = getNotifications();
    if (!notif) return false;

    const { status: existingStatus } = await notif.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await notif.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (e) {
    console.warn('Could not request notification permissions:', e);
    return false;
  }
}

/**
 * Helper to get target Date timestamp for an event date and optional time string (12H "6:00 PM" or 24H "18:00")
 */
function getTargetDateTime(dateStr: string, timeStr?: string | null, defaultHour = 9, defaultMinute = 0): Date {
  let hours = defaultHour;
  let minutes = defaultMinute;

  if (timeStr) {
    const trimmed = timeStr.trim();
    // 12-hour format: "6:00 PM", "10:30 AM", "12:00 pm"
    const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (match12) {
      let h = parseInt(match12[1], 10);
      const m = parseInt(match12[2], 10);
      const isPm = match12[3].toLowerCase() === 'pm';
      if (isPm && h < 12) h += 12;
      if (!isPm && h === 12) h = 0;
      if (!isNaN(h) && !isNaN(m)) {
        hours = h;
        minutes = m;
      }
    } else {
      // 24-hour format: "18:00", "09:30"
      const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if (match24) {
        const h = parseInt(match24[1], 10);
        const m = parseInt(match24[2], 10);
        if (!isNaN(h) && !isNaN(m)) {
          hours = h;
          minutes = m;
        }
      }
    }
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

const TIERS = [
  { offsetHours: 24, label: '24 hours', prefix: 'In 24 Hours' },
  { offsetHours: 12, label: '12 hours', prefix: 'In 12 Hours' },
  { offsetHours: 2, label: '2 hours', prefix: 'Starting Soon (2h)' },
];

/**
 * Schedule smart 3-tier reminder alerts for an event using deterministic IDs.
 * If an alert with the same ID already exists, expo-notifications replaces/updates it.
 */
export async function scheduleEventNotifications(event: CalendarEvent, hasPermission = false): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!event || !event.id) return;

  // Never schedule notifications for finished or skipped events
  if (isEventFinished(event) || event.status === 'skipped') {
    await cancelEventNotifications(event.id);
    return;
  }

  try {
    const notif = getNotifications();
    if (!notif) return;

    if (!hasPermission && !(await requestNotificationPermissions())) return;

    const nowMs = Date.now();
    const MIN_FUTURE_BUFFER_MS = 60 * 1000; // Must be at least 1 minute in the future
    const scheduledTimes: number[] = [];

    // 1. Registration Deadline Alerts (24h, 12h, 2h before deadline)
    if (event.registration_deadline) {
      const deadlineTarget = getTargetDateTime(event.registration_deadline, event.time, 23, 59);

      for (const tier of TIERS) {
        const alertTimeMs = deadlineTarget.getTime() - tier.offsetHours * 60 * 60 * 1000;

        if (alertTimeMs > nowMs + MIN_FUTURE_BUFFER_MS) {
          scheduledTimes.push(alertTimeMs);
          const isUrgent = tier.offsetHours <= 2;
          const identifier = `vanko_notif_${event.id}_dl_${tier.offsetHours}`;

          await notif.scheduleNotificationAsync({
            identifier,
            content: {
              title: isUrgent
                ? `🚨 Final Call: Registration Closes in 2h - ${event.title}`
                : `⏰ Deadline ${tier.prefix}: ${event.title}`,
              body: isUrgent
                ? `Registration closes in 2 hours for "${event.title}". Submit your entry now!`
                : `Registration for "${event.title}" closes in ${tier.label}. Don't miss out!`,
              data: { eventId: event.id, type: 'deadline', tier: tier.offsetHours },
              sound: true,
            },
            trigger: {
              type: notif.SchedulableTriggerInputTypes.DATE,
              date: new Date(alertTimeMs),
              channelId: 'vanko_reminders',
            } as any,
          });
        }
      }
    }

    // 2. Event Start Alerts (24h, 12h, 2h before event start)
    if (event.event_start_date) {
      const startTarget = getTargetDateTime(event.event_start_date, event.time, 9, 0);

      for (const tier of TIERS) {
        const alertTimeMs = startTarget.getTime() - tier.offsetHours * 60 * 60 * 1000;

        // Deduplicate: If an alert is already scheduled within 5 minutes of this time for this event, skip
        const isDuplicateTime = scheduledTimes.some((t) => Math.abs(t - alertTimeMs) < 5 * 60 * 1000);

        if (alertTimeMs > nowMs + MIN_FUTURE_BUFFER_MS && !isDuplicateTime) {
          scheduledTimes.push(alertTimeMs);
          const isUrgent = tier.offsetHours <= 2;
          const identifier = `vanko_notif_${event.id}_start_${tier.offsetHours}`;

          await notif.scheduleNotificationAsync({
            identifier,
            content: {
              title: isUrgent
                ? `🚀 Starting in 2 Hours: ${event.title}`
                : `📅 ${tier.prefix}: ${event.title}`,
              body: isUrgent
                ? `"${event.title}" starts in 2 hours${event.location ? ` at ${event.location}` : ''}! Get ready.`
                : `"${event.title}" kicks off in ${tier.label}. Check schedule and details!`,
              data: { eventId: event.id, type: 'event_start', tier: tier.offsetHours },
              sound: true,
            },
            trigger: {
              type: notif.SchedulableTriggerInputTypes.DATE,
              date: new Date(alertTimeMs),
              channelId: 'vanko_reminders',
            } as any,
          });
        }
      }
    }
  } catch (err) {
    console.warn('Error scheduling local notifications for event:', err);
  }
}

/**
 * Cancel all scheduled notifications for a specific event
 */
export async function cancelEventNotifications(eventId: string): Promise<void> {
  if (Platform.OS === 'web' || !eventId) return;

  try {
    const notif = getNotifications();
    if (!notif) return;

    // 1. Cancel deterministic IDs directly
    for (const tier of [24, 12, 2]) {
      await notif.cancelScheduledNotificationAsync(`vanko_notif_${eventId}_dl_${tier}`).catch(() => {});
      await notif.cancelScheduledNotificationAsync(`vanko_notif_${eventId}_start_${tier}`).catch(() => {});
    }

    // 2. Also check scheduled items for any matching eventId in data (cleanup legacy entries)
    const scheduled = await notif.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if (item.content.data?.eventId === eventId || item.identifier.includes(eventId)) {
        await notif.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Error cancelling event notifications:', err);
  }
}

/**
 * Re-register notifications under a new ID when an event ID is reconciled
 */
export async function remapNotificationIds(oldId: string, newId: string, event: CalendarEvent): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelEventNotifications(oldId);
  if (!isEventFinished(event)) {
    await scheduleEventNotifications({ ...event, id: newId }, true);
  }
}

export interface SyncNotificationOptions {
  allowPurgeAll?: boolean;
}

// Mutex & Debounce state to serialize sync calls
let isSyncing = false;
let hasQueuedSync = false;
let queuedEvents: CalendarEvent[] | null = null;
let queuedOptions: SyncNotificationOptions | undefined = undefined;

/**
 * Sync all notifications for active events with concurrency lock and legacy purge.
 * CRITICAL SAFETY: If events is empty, will NOT cancel notifications unless options?.allowPurgeAll is explicitly true.
 */
export async function syncAllEventNotifications(
  events: CalendarEvent[],
  options?: SyncNotificationOptions
): Promise<void> {
  if (Platform.OS === 'web') return;

  // CRITICAL SAFETY GUARD: Prevent unhydrated or empty states from purging Android OS alarms
  if (events.length === 0 && !options?.allowPurgeAll) {
    console.warn(
      '[NotificationService] syncAllEventNotifications called with empty events array without allowPurgeAll: true. Preserving existing OS alarms.'
    );
    return;
  }

  // If already syncing, queue the latest events payload and options
  if (isSyncing) {
    hasQueuedSync = true;
    queuedEvents = events;
    queuedOptions = options;
    return;
  }

  isSyncing = true;
  try {
    const notif = getNotifications();
    if (!notif) return;

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    // Ensure one-time purge of legacy random-UUID notifications
    await ensureLegacyNotificationsPurged();

    // Filter only active, non-finished events
    const activeEvents = events.filter((e) => e.status !== 'skipped' && !isEventFinished(e));

    // Cancel notifications for finished/skipped events that shouldn't be scheduled
    const activeIds = new Set(activeEvents.map((e) => e.id));
    const allScheduled = await notif.getAllScheduledNotificationsAsync();
    for (const item of allScheduled) {
      const evId = item.content.data?.eventId as string | undefined;
      if (evId && !activeIds.has(evId)) {
        await notif.cancelScheduledNotificationAsync(item.identifier).catch(() => {});
      }
    }

    // Schedule or update each active event with deterministic IDs
    for (const event of activeEvents) {
      await scheduleEventNotifications(event, true);
    }
  } catch (err) {
    console.warn('Error syncing notifications:', err);
  } finally {
    isSyncing = false;
    // Process any sync that was queued while this one was running
    if (hasQueuedSync && queuedEvents) {
      hasQueuedSync = false;
      const nextEvents = queuedEvents;
      const nextOptions = queuedOptions;
      queuedEvents = null;
      queuedOptions = undefined;
      syncAllEventNotifications(nextEvents, nextOptions).catch(() => {});
    }
  }
}

