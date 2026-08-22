import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CalendarEvent, getDaysDifference } from '@eventpulse/shared';

// Configure notification behavior for active app
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions
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

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  } catch (err) {
    console.warn('Failed to request notification permission:', err);
    return false;
  }
}

/**
 * Schedule exact alert notifications for an event:
 * 1. Registration Deadline Alert (1 day before or day-of at 09:00 AM)
 * 2. Event Start Alert (1 day before or day-of at 09:00 AM)
 */
export async function scheduleEventNotifications(event: CalendarEvent): Promise<void> {
  if (Platform.OS === 'web') {
    // For web, if an event deadline is today or tomorrow, show browser notification if allowed
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      if (event.registration_deadline) {
        const diff = getDaysDifference(event.registration_deadline);
        if (diff === 0 || diff === 1) {
          new Notification(diff === 0 ? `🚨 DEADLINE TODAY: ${event.title}` : `⚠️ DEADLINE TOMORROW: ${event.title}`, {
            body: `Registration deadline is ${event.registration_deadline}. Complete your registration now!`,
            icon: '/favicon.png',
          });
        }
      }
    }
    return;
  }

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    // 1. Registration Deadline Notification
    if (event.registration_deadline) {
      const daysLeft = getDaysDifference(event.registration_deadline);
      if (daysLeft >= 0) {
        const deadlineDate = new Date(event.registration_deadline + 'T09:00:00');
        // If scheduled for today or future
        if (deadlineDate.getTime() > Date.now()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `🚨 Registration Deadline: ${event.title}`,
              body: daysLeft === 0 ? `Registration closes TODAY! Don't miss out.` : `Registration deadline is in ${daysLeft} day(s).`,
              data: { eventId: event.id, type: 'deadline' },
              sound: true,
            },
            trigger: {
              date: deadlineDate,
            } as any,
          });
        }
      }
    }

    // 2. Event Start Date Notification
    if (event.event_start_date) {
      const daysLeft = getDaysDifference(event.event_start_date);
      if (daysLeft >= 0) {
        const eventStartDate = new Date(event.event_start_date + 'T08:30:00');
        if (eventStartDate.getTime() > Date.now()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `🗓️ Upcoming Event: ${event.title}`,
              body: daysLeft === 0 ? `Event is starting TODAY! Check venue / links.` : `Event starts in ${daysLeft} day(s) on ${event.event_start_date}.`,
              data: { eventId: event.id, type: 'event_start' },
              sound: true,
            },
            trigger: {
              date: eventStartDate,
            } as any,
          });
        }
      }
    }
  } catch (err) {
    console.warn('Failed to schedule notification for event:', event.id, err);
  }
}

/**
 * Resync and reschedule all active notifications across user events
 */
export async function syncAllEventNotifications(events: CalendarEvent[]): Promise<void> {
  if (Platform.OS !== 'web') {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (e) {
      console.warn('Could not cancel previous notifications:', e);
    }
  }

  const activeEvents = events.filter((e) => e.status !== 'skipped');
  for (const event of activeEvents) {
    await scheduleEventNotifications(event);
  }
}
