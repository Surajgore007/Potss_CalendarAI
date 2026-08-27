import { Platform } from 'react-native';
import { CalendarEvent, getDaysDifference } from '@eventpulse/shared';

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
 * Schedule future reminder alerts for an event:
 * - 1 day before registration deadline at 10:00 AM
 * - 1 day before event start at 09:00 AM
 */
export async function scheduleEventNotifications(event: CalendarEvent, hasPermission = false): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const notif = getNotifications();
    if (!notif) return;

    if (!hasPermission && !(await requestNotificationPermissions())) return;

    const nowMs = Date.now();
    const MIN_FUTURE_BUFFER_MS = 60 * 1000;

    // 1. Registration Deadline Alert
    if (event.registration_deadline) {
      const daysLeft = getDaysDifference(event.registration_deadline);
      if (daysLeft > 0) {
        const deadlineDate = new Date(event.registration_deadline + 'T10:00:00');
        deadlineDate.setDate(deadlineDate.getDate() - 1);

        if (deadlineDate.getTime() > nowMs + MIN_FUTURE_BUFFER_MS) {
          await notif.scheduleNotificationAsync({
            content: {
              title: `Deadline Approaching: ${event.title}`,
              body: `Registration closes tomorrow on ${event.registration_deadline}. Complete your registration now!`,
              data: { eventId: event.id, type: 'deadline' },
              sound: true,
            },
            trigger: {
              type: notif.SchedulableTriggerInputTypes.DATE,
              date: deadlineDate,
              channelId: 'vanko_reminders',
            } as any,
          });
        }
      }
    }

    // 2. Event Start Date Alert
    if (event.event_start_date) {
      const daysLeft = getDaysDifference(event.event_start_date);
      if (daysLeft > 0) {
        const startDate = new Date(event.event_start_date + 'T09:00:00');
        startDate.setDate(startDate.getDate() - 1);

        if (startDate.getTime() > nowMs + MIN_FUTURE_BUFFER_MS) {
          await notif.scheduleNotificationAsync({
            content: {
              title: `Event Tomorrow: ${event.title}`,
              body: `Starts tomorrow on ${event.event_start_date}. Check schedule and location!`,
              data: { eventId: event.id, type: 'event_start' },
              sound: true,
            },
            trigger: {
              type: notif.SchedulableTriggerInputTypes.DATE,
              date: startDate,
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
  if (Platform.OS === 'web') return;

  try {
    const notif = getNotifications();
    if (!notif) return;

    const scheduled = await notif.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if (item.content.data?.eventId === eventId) {
        await notif.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch (err) {
    console.warn('Error cancelling event notifications:', err);
  }
}

/**
 * Sync all notifications for active events
 */
export async function syncAllEventNotifications(events: CalendarEvent[]): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const notif = getNotifications();
    if (!notif) return;

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    // Clear all existing scheduled notifications and reschedule fresh
    await notif.cancelAllScheduledNotificationsAsync();

    const activeEvents = events.filter((e) => e.status !== 'skipped');
    for (const event of activeEvents) {
      await scheduleEventNotifications(event, true);
    }
  } catch (err) {
    console.warn('Error syncing notifications:', err);
  }
}
