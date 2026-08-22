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
        daysRemaining: diff,
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
          daysRemaining: eventDiff,
          label: `Event: ${formatDiffLabel(eventDiff, false)}`,
          urgencyLevel: getUrgencyFromDiff(eventDiff),
        };
      }
      return {
        targetDate: event.event_start_date,
        isDeadline: false,
        daysRemaining: eventDiff,
        label: `Event ended (${Math.abs(eventDiff)}d ago)`,
        urgencyLevel: 'passed',
      };
    }
    return {
      targetDate: event.registration_deadline,
      isDeadline: true,
      daysRemaining: diff,
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
      daysRemaining: diff,
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
  if (diff === 0) return isDeadline ? 'DEADLINE TODAY 🚨' : 'Happening Today';
  if (diff === 1) return isDeadline ? 'DEADLINE TOMORROW ⚠️' : 'Tomorrow';
  if (diff > 1) return `In ${diff} days`;
  if (diff === -1) return 'Yesterday';
  return `${Math.abs(diff)} days ago`;
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
    .filter((e) => e.status !== 'skipped' && isEventThisWeek(e, referenceDate))
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
