import { CalendarEvent, ClashDetail } from '../types/event';

/** Get current ISO date string (YYYY-MM-DD) */
export function getTodayISODate(referenceDate: Date = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Get next day ISO date */
export function getTomorrowISODate(referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() + 1);
  return getTodayISODate(d);
}

/** Get upcoming Monday ISO date */
export function getNextMondayISODate(referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday
  const diff = day === 0 ? 1 : (8 - day);
  d.setDate(d.getDate() + diff);
  return getTodayISODate(d);
}

/** Format ISO date (YYYY-MM-DD) to friendly string like "Aug 25, 2026" or "Tue, Aug 25" */
export function formatFriendlyDate(isoDate: string | null | undefined, includeDayOfWeek = true): string {
  if (!isoDate) return 'No date specified';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  if (isNaN(d.getTime())) return isoDate;

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeDayOfWeek ? { weekday: 'short' } : {}),
  };
  return d.toLocaleDateString('en-US', options);
}

/**
 * Format any time string (24-hour "18:00" or already 12-hour "6:00 PM") to clean 12-hour format with AM/PM (e.g. "6:00 PM", "10:30 AM")
 */
export function formatTime12Hour(timeStr: string | null | undefined): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const trimmed = timeStr.trim();
  if (!trimmed) return '';

  // Match 12-hour with optional spaces before am/pm (e.g. "6:00 PM", "06:30am", "12:00PM")
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (match12) {
    const hours = parseInt(match12[1], 10);
    const minutes = match12[2];
    const period = match12[3].toUpperCase();
    return `${hours}:${minutes} ${period}`;
  }

  // Match 24-hour HH:MM
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    let hours = parseInt(match24[1], 10);
    const minutes = match24[2];
    if (hours < 0 || hours > 23) return trimmed;

    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;

    return `${hours}:${minutes} ${period}`;
  }

  return trimmed;
}

/**
 * Helper to parse target Date object for a date string and optional time string (12H "6:00 PM" or 24H "18:00").
 */
export function parseDateTime(
  dateStr: string,
  timeStr?: string | null,
  defaultHour = 23,
  defaultMinute = 59,
  defaultSecond = 59
): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  let hours = defaultHour;
  let minutes = defaultMinute;
  let seconds = defaultSecond;

  if (timeStr && typeof timeStr === 'string') {
    const trimmed = timeStr.trim();
    // 12-hour: e.g. "6:00 PM", "11:30 AM"
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
        seconds = 0;
      }
    } else {
      // 24-hour: e.g. "18:00", "09:30"
      const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if (match24) {
        const h = parseInt(match24[1], 10);
        const m = parseInt(match24[2], 10);
        if (!isNaN(h) && !isNaN(m)) {
          hours = h;
          minutes = m;
          seconds = 0;
        }
      }
    }
  }

  return new Date(year, month - 1, day, hours, minutes, seconds, 999);
}

/**
 * Check whether an event has completely finished based on end date, start date, or deadline.
 */
export function isEventFinished(
  event: Pick<CalendarEvent, 'event_end_date' | 'event_start_date' | 'registration_deadline' | 'time' | 'status'>,
  referenceDate: Date = new Date()
): boolean {
  if (event.status === 'past') return true;

  const nowMs = referenceDate.getTime();

  // 1. If event has an explicit end date, check against end date + time (default 23:59:59)
  if (event.event_end_date) {
    const endDate = parseDateTime(event.event_end_date, event.time, 23, 59, 59);
    if (endDate && endDate.getTime() < nowMs) {
      return true;
    }
    return false;
  }

  // 2. If event only has an event start date
  if (event.event_start_date) {
    // If no end date, event is considered active throughout the start day (until 23:59:59)
    const startDate = parseDateTime(event.event_start_date, event.time, 23, 59, 59);
    if (startDate && startDate.getTime() < nowMs) {
      return true;
    }
    return false;
  }

  // 3. If event has only a registration deadline (no event dates)
  if (event.registration_deadline) {
    const deadlineDate = parseDateTime(event.registration_deadline, event.time, 23, 59, 59);
    if (deadlineDate && deadlineDate.getTime() < nowMs) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Check whether a registration deadline is currently active (today or in future, not passed).
 */
export function isDeadlineActive(
  deadlineIso: string | null | undefined,
  timeStr?: string | null,
  referenceDate: Date = new Date()
): boolean {
  if (!deadlineIso) return false;
  const deadlineDate = parseDateTime(deadlineIso, timeStr, 23, 59, 59);
  if (!deadlineDate) return false;
  return deadlineDate.getTime() >= referenceDate.getTime();
}

/** Calculate days difference between target date and reference date */
export function getDaysDifference(targetIsoDate: string, referenceDate: Date = new Date()): number {
  const todayStr = getTodayISODate(referenceDate);
  if (targetIsoDate === todayStr) return 0;

  const [tY, tM, tD] = targetIsoDate.split('-').map(Number);
  const [rY, rM, rD] = todayStr.split('-').map(Number);

  const target = new Date(tY, tM - 1, tD);
  const ref = new Date(rY, rM - 1, rD);

  const diffTime = target.getTime() - ref.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/** Friendly countdown or urgency description */
export function getUrgencyInfo(
  event: Pick<CalendarEvent, 'registration_deadline' | 'event_start_date'>,
  referenceDate: Date = new Date()
): {
  targetDate: string;
  isDeadline: boolean;
  daysRemaining: number;
  label: string;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low' | 'passed';
} {
  // Check registration deadline first if active/upcoming
  if (event.registration_deadline) {
    const diff = getDaysDifference(event.registration_deadline, referenceDate);
    if (diff >= 0) {
      return {
        targetDate: event.registration_deadline,
        isDeadline: true,
        daysRemaining: Math.max(0, diff),
        label: `Deadline: ${formatDiffLabel(diff, true)}`,
        urgencyLevel: diff <= 1 ? 'critical' : diff <= 3 ? 'high' : 'medium',
      };
    }
    // Deadline passed, check if event start date is still in the future
    if (event.event_start_date) {
      const eventDiff = getDaysDifference(event.event_start_date, referenceDate);
      if (eventDiff >= 0) {
        return {
          targetDate: event.event_start_date,
          isDeadline: false,
          daysRemaining: Math.max(0, eventDiff),
          label: `Event: ${formatDiffLabel(eventDiff, false)}`,
          urgencyLevel: getUrgencyFromDiff(eventDiff),
        };
      }
      return {
        targetDate: event.event_start_date,
        isDeadline: false,
        daysRemaining: 0,
        label: `Event ended (${Math.abs(eventDiff)}d ago)`,
        urgencyLevel: 'passed',
      };
    }
    return {
      targetDate: event.registration_deadline,
      isDeadline: true,
      daysRemaining: 0,
      label: `Deadline passed (${Math.abs(diff)}d ago)`,
      urgencyLevel: 'passed',
    };
  }

  // No registration deadline - rely purely on event start date
  if (event.event_start_date) {
    const diff = getDaysDifference(event.event_start_date, referenceDate);
    return {
      targetDate: event.event_start_date,
      isDeadline: false,
      daysRemaining: Math.max(0, diff),
      label: diff >= 0 ? `Event: ${formatDiffLabel(diff, false)}` : `Event ended (${Math.abs(diff)}d ago)`,
      urgencyLevel: getUrgencyFromDiff(diff),
    };
  }

  return {
    targetDate: '',
    isDeadline: false,
    daysRemaining: 999,
    label: 'Date TBD',
    urgencyLevel: 'low',
  };
}

function formatDiffLabel(diff: number, isDeadline: boolean): string {
  if (diff <= 0) return isDeadline ? 'DEADLINE TODAY 🚨' : 'Happening Today';
  if (diff === 1) return isDeadline ? 'DEADLINE TOMORROW ⚠️' : 'Tomorrow';
  if (diff > 1) return `In ${diff} days`;
  return isDeadline ? 'Deadline Passed' : 'Event Passed';
}

function getUrgencyFromDiff(diff: number): 'critical' | 'high' | 'medium' | 'low' | 'passed' {
  if (diff < 0) return 'passed';
  if (diff === 0) return 'critical';
  if (diff <= 2) return 'high';
  if (diff <= 7) return 'medium';
  return 'low';
}

/** Check if event is happening or due within next 7 days */
export function isEventThisWeek(
  event: Pick<CalendarEvent, 'event_start_date' | 'registration_deadline'>,
  referenceDate: Date = new Date()
): boolean {
  if (event.registration_deadline) {
    const diff = getDaysDifference(event.registration_deadline, referenceDate);
    if (diff >= 0 && diff <= 7) return true;
  }
  if (event.event_start_date) {
    const diff = getDaysDifference(event.event_start_date, referenceDate);
    if (diff >= 0 && diff <= 7) return true;
  }
  return false;
}

/** Filter and sort events for "Upcoming This Week" backup dashboard */
export function getEventsThisWeek(events: CalendarEvent[], referenceDate: Date = new Date()): CalendarEvent[] {
  return events
    .filter((e) => e.status !== 'skipped' && !isEventFinished(e, referenceDate) && isEventThisWeek(e, referenceDate))
    .sort((a, b) => {
      const aInfo = getUrgencyInfo(a, referenceDate);
      const bInfo = getUrgencyInfo(b, referenceDate);
      return aInfo.daysRemaining - bInfo.daysRemaining;
    });
}

/** Detect clashes across all events (only event date collisions / overlapping event dates) */
export function detectClashes(events: CalendarEvent[]): ClashDetail[] {
  const clashes: ClashDetail[] = [];
  const activeEvents = events.filter((e) => e.status !== 'skipped');

  for (let i = 0; i < activeEvents.length; i++) {
    for (let j = i + 1; j < activeEvents.length; j++) {
      const a = activeEvents[i];
      const b = activeEvents[j];

      if (!a.event_start_date || !b.event_start_date) continue;

      const aStart = a.event_start_date;
      const aEnd = a.event_end_date || a.event_start_date;
      const bStart = b.event_start_date;
      const bEnd = b.event_end_date || b.event_start_date;

      // 1. Same Event Start Date
      if (aStart === bStart) {
        clashes.push({
          eventA: a,
          eventB: b,
          reason: 'same_day_event',
          description: `Both "${a.title}" and "${b.title}" are scheduled for ${formatFriendlyDate(aStart)}.`,
          severity: 'high',
        });
      }
      // 2. Overlapping Multi-Day Dates
      else if (aStart <= bEnd && bStart <= aEnd) {
        clashes.push({
          eventA: a,
          eventB: b,
          reason: 'overlapping_dates',
          description: `"${a.title}" (${formatFriendlyDate(aStart, false)} - ${formatFriendlyDate(aEnd, false)}) overlaps with "${b.title}" (${formatFriendlyDate(bStart, false)} - ${formatFriendlyDate(bEnd, false)}).`,
          severity: 'high',
        });
      }
    }
  }

  return clashes;
}
