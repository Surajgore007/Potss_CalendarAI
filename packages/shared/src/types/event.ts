export type EventType = 'hackathon' | 'ctf' | 'meetup' | 'workshop' | 'deadline' | 'other';

export type EventMode = 'online' | 'offline' | 'hybrid';

export type EventStatus = 'upcoming' | 'past' | 'registered' | 'skipped';

export type UserRole = 'admin' | 'student';

export type PublishDestination = 'personal' | 'community' | 'both';

export interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  event_start_date: string | null; // ISO 8601 YYYY-MM-DD
  event_end_date: string | null;   // ISO 8601 YYYY-MM-DD
  registration_deadline: string | null; // ISO 8601 YYYY-MM-DD
  time: string | null;             // HH:MM in 24h
  mode: EventMode;
  location: string | null;
  registration_link: string | null;
  source_group: string | null;
  raw_text: string;
  confidence_score: number;        // 0.0 - 1.0
  tags: string[];
  reminder_offsets: number[];      // Offsets in minutes relative to target date (e.g. 4320=3d, 1440=1d, 0=day-of)
  created_at: string;              // ISO timestamp
  updated_at: string;              // ISO timestamp
  status: EventStatus;
  userId?: string;
}

export interface CommunityEvent {
  id: string;
  title: string;
  type: EventType;
  event_start_date: string | null;
  event_end_date: string | null;
  registration_deadline: string | null;
  time: string | null;
  mode: EventMode;
  location: string | null;
  registration_link: string | null;
  description?: string | null;
  college: string; // e.g. 'SIES_GST'
  createdBy: string; // admin uid
  created_at: string;
  updated_at: string;
  source_group?: string | null;
  tags: string[];
}

export interface ExtractedEvent {
  temp_id: string;
  title: string;
  type: EventType;
  event_start_date: string | null;
  event_end_date: string | null;
  registration_deadline: string | null;
  time: string | null;
  mode: EventMode;
  location: string | null;
  registration_link: string | null;
  source_group: string | null;
  raw_text: string;
  confidence_score: number;
  tags?: string[];
  reminder_offsets?: number[];
  destination?: PublishDestination;
  duplicate_warning?: {
    is_duplicate: boolean;
    matched_event_id?: string;
    matched_event_title?: string;
    similarity_score: number;
  };
}

export interface ExtractionResponse {
  events: ExtractedEvent[];
  raw_input: string;
  extracted_at: string;
  quota?: ExtractionQuotaInfo;
}

export interface ExtractionQuotaInfo {
  daily_quota: number;
  used_today: number;
  remaining: number;
  unlimited: boolean;
  reset_at: string;
}

export interface EventFilterOptions {
  searchQuery?: string;
  type?: EventType | 'all';
  status?: EventStatus | 'all';
  mode?: EventMode | 'all';
  sourceGroup?: string | 'all';
  tag?: string;
  startDate?: string;
  endDate?: string;
  onlyDeadlines?: boolean;
}

export interface ClashDetail {
  eventA: CalendarEvent;
  eventB: CalendarEvent;
  reason: 'same_day_event' | 'overlapping_dates' | 'deadline_on_event_day' | 'same_deadline';
  description: string;
  severity: 'high' | 'medium' | 'info';
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  defaultReminderOffsets: number[];
  lastSyncedAt?: string;
}
