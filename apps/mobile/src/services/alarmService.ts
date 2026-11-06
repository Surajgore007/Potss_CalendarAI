import { NativeModules, Platform } from 'react-native';
import { CalendarEvent, isEventFinished } from '@eventpulse/shared';

const { VankoAlarmModule } = NativeModules;

export interface AlarmVolumeInfo {
  volume: number;
  maxVolume: number;
  isMuted: boolean;
}

export interface ScheduledAlarmRecord {
  alarmId: string;
  eventId: string;
  title: string;
  triggerTimeMs: number;
  targetDeadlineMs: number;
  stage: number;
  registrationUrl: string;
}

/**
 * Helper to compute target Date timestamp from YYYY-MM-DD and optional time string
 */
export function getTargetTimestamp(
  dateStr: string,
  timeStr?: string | null,
  defaultHour = 23,
  defaultMinute = 59
): number {
  let hours = defaultHour;
  let minutes = defaultMinute;

  if (timeStr) {
    const trimmed = timeStr.trim();
    // 12-hour format: "6:00 PM", "10:30 AM"
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
  const targetDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return targetDate.getTime();
}

/**
 * Check if the native alarm module is available (Android native)
 */
export function isNativeAlarmSupported(): boolean {
  return Platform.OS === 'android' && Boolean(VankoAlarmModule);
}

/**
 * Check if exact alarms can be scheduled on Android
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (!isNativeAlarmSupported()) return true;
  try {
    return await VankoAlarmModule.canScheduleExactAlarms();
  } catch {
    return true;
  }
}

/**
 * Check if device allows background activity without aggressive battery killing
 */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!isNativeAlarmSupported()) return true;
  try {
    return await VankoAlarmModule.isIgnoringBatteryOptimizations();
  } catch {
    return true;
  }
}

/**
 * Get device alarm stream volume status
 */
export async function getAlarmVolumeInfo(): Promise<AlarmVolumeInfo> {
  if (!isNativeAlarmSupported()) {
    return { volume: 5, maxVolume: 7, isMuted: false };
  }
  try {
    return await VankoAlarmModule.getAlarmVolume();
  } catch {
    return { volume: 5, maxVolume: 7, isMuted: false };
  }
}

/**
 * Open Android system battery optimization list screen
 */
export function openBatteryOptimizationSettings(): void {
  if (isNativeAlarmSupported()) {
    VankoAlarmModule.openBatteryOptimizationSettings();
  }
}

/**
 * Open Android system exact alarm permission screen
 */
export function openExactAlarmSettings(): void {
  if (isNativeAlarmSupported()) {
    VankoAlarmModule.openExactAlarmSettings();
  }
}

/**
 * Open Android notification channel settings for Vanko Critical Alarms
 */
export function openAlarmChannelSettings(): void {
  if (isNativeAlarmSupported()) {
    VankoAlarmModule.openAlarmChannelSettings();
  }
}

/**
 * Calculate dynamic alarm triggers for an event:
 * Supports 2-Stage escalation (default: 120m and 15m before deadline/start)
 * Gracefully adapts if deadline is less than 2 hours away.
 */
export function computeAlarmSchedule(event: CalendarEvent): {
  targetMs: number;
  triggers: { stage: number; offsetMinutes: number; triggerTimeMs: number }[];
  isTimeAssumed: boolean;
} | null {
  const targetDateStr = event.registration_deadline || event.event_start_date;
  if (!targetDateStr) return null;

  const isDeadline = Boolean(event.registration_deadline);
  const defaultHour = isDeadline ? 23 : 9;
  const defaultMin = isDeadline ? 59 : 0;
  const isTimeAssumed = !event.time;

  const targetMs = getTargetTimestamp(targetDateStr, event.time, defaultHour, defaultMin);
  const nowMs = Date.now();
  const MIN_BUFFER_MS = 60 * 1000; // Must be at least 1 minute in the future

  if (targetMs <= nowMs + MIN_BUFFER_MS) {
    // Event/deadline is already in the past
    return null;
  }

  const requestedOffsets = (event.alarm_offsets && event.alarm_offsets.length > 0)
    ? event.alarm_offsets
    : [120, 15]; // Default 2-stage: 2 hours and 15 minutes before

  const triggers: { stage: number; offsetMinutes: number; triggerTimeMs: number }[] = [];

  for (let i = 0; i < requestedOffsets.length; i++) {
    const offsetMin = requestedOffsets[i];
    const proposedTriggerMs = targetMs - offsetMin * 60 * 1000;
    const stageNum = i + 1;

    if (proposedTriggerMs > nowMs + MIN_BUFFER_MS) {
      triggers.push({
        stage: stageNum,
        offsetMinutes: offsetMin,
        triggerTimeMs: proposedTriggerMs,
      });
    }
  }

  // Short-notice fallback: If requested offsets (e.g. 2h) are already in the past,
  // but deadline is still in future:
  if (triggers.length === 0) {
    const remainingMs = targetMs - nowMs;
    if (remainingMs > 16 * 60 * 1000) {
      // More than 16 minutes left: schedule 15m emergency alarm
      triggers.push({
        stage: 2,
        offsetMinutes: 15,
        triggerTimeMs: targetMs - 15 * 60 * 1000,
      });
    } else {
      // Very close deadline: schedule immediate alarm 1 minute ahead
      triggers.push({
        stage: 2,
        offsetMinutes: Math.max(1, Math.round(remainingMs / 60000)),
        triggerTimeMs: nowMs + MIN_BUFFER_MS,
      });
    }
  }

  return { targetMs, triggers, isTimeAssumed };
}

/**
 * Schedule critical deadline alarms for an event on native Android via setAlarmClock()
 */
export async function scheduleEventCriticalAlarm(event: CalendarEvent, userId?: string): Promise<boolean> {
  if (!isNativeAlarmSupported()) return false;
  if (!event || !event.id) return false;

  // Never schedule alarms for finished, registered, or skipped events
  if (isEventFinished(event) || event.status === 'registered' || event.status === 'skipped') {
    await cancelEventCriticalAlarm(event.id);
    return false;
  }

  if (!event.has_critical_alarm) {
    await cancelEventCriticalAlarm(event.id);
    return false;
  }

  const schedule = computeAlarmSchedule(event);
  if (!schedule || schedule.triggers.length === 0) {
    console.warn(`[AlarmService] Cannot schedule alarm for event ${event.id}: no valid future triggers.`);
    return false;
  }

  try {
    // 1. Cancel existing alarms for this event to avoid duplicates
    await VankoAlarmModule.cancelAlarmsForEvent(event.id);

    // 2. Schedule each stage
    for (const t of schedule.triggers) {
      const alarmId = `vanko_alarm_${event.id}_stage_${t.stage}`;
      await VankoAlarmModule.scheduleAlarm(
        alarmId,
        event.id,
        event.title || 'Event Deadline',
        t.triggerTimeMs,
        schedule.targetMs,
        t.stage,
        event.registration_link || null,
        userId || event.userId || null
      );
    }
    return true;
  } catch (err) {
    console.error('[AlarmService] Error scheduling alarm for event:', event.id, err);
    return false;
  }
}

/**
 * Cancel all critical alarms for an event
 */
export async function cancelEventCriticalAlarm(eventId: string): Promise<boolean> {
  if (!isNativeAlarmSupported() || !eventId) return false;
  try {
    return await VankoAlarmModule.cancelAlarmsForEvent(eventId);
  } catch (err) {
    console.warn('[AlarmService] Error cancelling alarms for event:', eventId, err);
    return false;
  }
}

/**
 * Cancel all critical alarms across all events (e.g. on user sign-out)
 */
export async function cancelAllCriticalAlarms(): Promise<boolean> {
  if (!isNativeAlarmSupported()) return false;
  try {
    return await VankoAlarmModule.cancelAllAlarms();
  } catch (err) {
    console.warn('[AlarmService] Error cancelling all alarms:', err);
    return false;
  }
}

/**
 * Query active scheduled alarms from native store
 */
export async function getActiveScheduledAlarms(): Promise<ScheduledAlarmRecord[]> {
  if (!isNativeAlarmSupported()) return [];
  try {
    return await VankoAlarmModule.getScheduledAlarms();
  } catch {
    return [];
  }
}

/**
 * Drain pending native actions queued by notification buttons while app was terminated
 * (e.g. user tapped "Mark as Submitted" on the ringing alarm notification).
 */
export async function drainPendingAlarmActions(): Promise<{ action: string; eventId: string }[]> {
  if (!isNativeAlarmSupported()) return [];
  try {
    return await VankoAlarmModule.drainPendingActions();
  } catch {
    return [];
  }
}

/**
 * Set the currently authenticated user in the native alarm layer.
 * If userId is null (sign out) or changes (account switch), stale alarms are cleared.
 */
export async function setNativeActiveUser(userId: string | null): Promise<boolean> {
  if (!isNativeAlarmSupported()) return false;
  try {
    return await VankoAlarmModule.setActiveUser(userId);
  } catch (err) {
    console.warn('[AlarmService] Error setting native active user:', err);
    return false;
  }
}

/**
 * Synchronize all critical alarms for a list of calendar events
 */
export async function syncAllCriticalAlarms(events: CalendarEvent[], userId?: string): Promise<void> {
  if (!isNativeAlarmSupported()) return;

  try {
    // 1. Query all active scheduled alarms from native store
    const scheduled = await getActiveScheduledAlarms();
    const activeEventIds = new Set(
      events
        .filter((e) => e.has_critical_alarm && e.status !== 'registered' && e.status !== 'skipped' && !isEventFinished(e))
        .map((e) => e.id)
    );

    // Cancel any native alarm whose event is no longer in current user's active events
    for (const record of scheduled) {
      if (!activeEventIds.has(record.eventId)) {
        await cancelEventCriticalAlarm(record.eventId);
      }
    }

    // 2. Schedule or update valid active alarms
    for (const event of events) {
      if (activeEventIds.has(event.id)) {
        await scheduleEventCriticalAlarm(event, userId || event.userId);
      } else {
        await cancelEventCriticalAlarm(event.id);
      }
    }
  } catch (err) {
    console.warn('[AlarmService] Error syncing all critical alarms:', err);
  }
}

