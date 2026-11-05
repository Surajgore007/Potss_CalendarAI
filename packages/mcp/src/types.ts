export interface VankoEvent {
  id: string;
  title: string;
  type: 'hackathon' | 'ctf' | 'meetup' | 'workshop' | 'deadline' | 'other';
  event_start_date: string | null;
  event_end_date: string | null;
  registration_deadline: string | null;
  time: string | null;
  mode: 'online' | 'offline' | 'hybrid';
  location: string | null;
  registration_link: string | null;
  source_group?: string | null;
  raw_text?: string;
  confidence_score?: number;
  tags?: string[];
  reminder_offsets?: number[];
  status: 'upcoming' | 'registered' | 'skipped';
  created_at: string;
  updated_at: string;
  userId?: string;
  has_critical_alarm?: boolean;
  alarm_offsets?: number[];
  alarm_time_assumed?: boolean;
}

export interface VankoFilterParams {
  time_filter?: 'all' | 'upcoming' | 'past' | 'this_week' | 'this_month';
  type?: string;
  status?: string;
  has_alarm?: boolean;
  limit?: number;
}

export interface ConflictResult {
  has_conflicts: boolean;
  conflicting_pairs: {
    event1: { id: string; title: string; date: string; time: string | null };
    event2: { id: string; title: string; date: string; time: string | null };
    reason: string;
  }[];
}

