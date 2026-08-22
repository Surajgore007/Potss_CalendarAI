import { EventType, EventMode, EventStatus } from './types/event';

/** Default reminder offsets in minutes: 3 days (4320m), 1 day (1440m), day-of (0m) */
export const DEFAULT_REMINDER_OFFSETS = [4320, 1440, 0];

export const CONFIDENCE_LOW_THRESHOLD = 0.70;

export const EVENT_TYPE_CONFIG: Record<
  EventType,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    accentColor: string;
    gradient: [string, string];
    icon: string;
    defaultUrgency: 'critical' | 'high' | 'medium' | 'normal';
  }
> = {
  hackathon: {
    label: 'Hackathon',
    badgeBg: '#EDE9FE',
    badgeText: '#7C3AED',
    accentColor: '#8B5CF6',
    gradient: ['#8B5CF6', '#6D28D9'],
    icon: 'code-slash-outline',
    defaultUrgency: 'high',
  },
  ctf: {
    label: 'CTF Challenge',
    badgeBg: '#FEE2E2',
    badgeText: '#DC2626',
    accentColor: '#EF4444',
    gradient: ['#EF4444', '#B91C1C'],
    icon: 'shield-checkmark-outline',
    defaultUrgency: 'high',
  },
  meetup: {
    label: 'Tech Meetup',
    badgeBg: '#D1FAE5',
    badgeText: '#059669',
    accentColor: '#10B981',
    gradient: ['#10B981', '#047857'],
    icon: 'people-outline',
    defaultUrgency: 'normal',
  },
  workshop: {
    label: 'Workshop',
    badgeBg: '#DBEAFE',
    badgeText: '#2563EB',
    accentColor: '#3B82F6',
    gradient: ['#3B82F6', '#1D4ED8'],
    icon: 'school-outline',
    defaultUrgency: 'medium',
  },
  deadline: {
    label: 'Deadline',
    badgeBg: '#FEF3C7',
    badgeText: '#D97706',
    accentColor: '#F59E0B',
    gradient: ['#F59E0B', '#B45309'],
    icon: 'alarm-outline',
    defaultUrgency: 'critical',
  },
  other: {
    label: 'Tech Event',
    badgeBg: '#F3F4F6',
    badgeText: '#4B5563',
    accentColor: '#6B7280',
    gradient: ['#6B7280', '#374151'],
    icon: 'calendar-outline',
    defaultUrgency: 'normal',
  },
};

export const EVENT_MODE_CONFIG: Record<
  EventMode,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    icon: string;
  }
> = {
  online: {
    label: 'Online',
    badgeBg: '#E0F2FE',
    badgeText: '#0284C7',
    icon: 'globe-outline',
  },
  offline: {
    label: 'In-Person',
    badgeBg: '#DCFCE7',
    badgeText: '#16A34A',
    icon: 'location-outline',
  },
  hybrid: {
    label: 'Hybrid',
    badgeBg: '#F3E8FF',
    badgeText: '#9333EA',
    icon: 'git-network-outline',
  },
};

export const EVENT_STATUS_CONFIG: Record<
  EventStatus,
  {
    label: string;
    color: string;
    bg: string;
  }
> = {
  upcoming: {
    label: 'Upcoming',
    color: '#0284C7',
    bg: '#E0F2FE',
  },
  registered: {
    label: 'Registered',
    color: '#059669',
    bg: '#D1FAE5',
  },
  skipped: {
    label: 'Skipped',
    color: '#6B7280',
    bg: '#F3F4F6',
  },
  past: {
    label: 'Past',
    color: '#9CA3AF',
    bg: '#F3F4F6',
  },
};

export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    events: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Clear title of the event or hackathon' },
          type: {
            type: 'STRING',
            enum: ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'],
            description: 'Classification of the event type'
          },
          event_start_date: {
            type: 'STRING',
            description: 'ISO 8601 YYYY-MM-DD date when the event starts. null if unknown or not specified in text.'
          },
          event_end_date: {
            type: 'STRING',
            description: 'ISO 8601 YYYY-MM-DD date when the event ends. null if single day or unknown.'
          },
          registration_deadline: {
            type: 'STRING',
            description: 'ISO 8601 YYYY-MM-DD date of the registration deadline. Separate from event_start_date! null if not mentioned.'
          },
          time: {
            type: 'STRING',
            description: 'Time string in 24h format HH:MM if available. null if not specified.'
          },
          mode: {
            type: 'STRING',
            enum: ['online', 'offline', 'hybrid'],
            description: 'Delivery mode of the event'
          },
          location: {
            type: 'STRING',
            description: 'Physical venue, city, or platform URL/server. null if not mentioned.'
          },
          registration_link: {
            type: 'STRING',
            description: 'Valid web URL link for registration or info. null if none found.'
          },
          source_group: {
            type: 'STRING',
            description: 'WhatsApp group name, channel, or community if mentioned. null if not found.'
          },
          confidence_score: {
            type: 'NUMBER',
            description: 'Confidence level between 0.0 and 1.0 regarding extraction accuracy and completeness.'
          }
        },
        required: ['title', 'type', 'mode', 'confidence_score']
      }
    }
  },
  required: ['events']
};

export const SAMPLE_WHATSAPP_MESSAGES = [
  {
    title: 'Hackathon with Registration Deadline',
    text: `🚀 *AI INNOVATION HACKATHON 2026* 🚀
Organized by DevCommunity Bangalore!
📍 Mode: Hybrid (Bengaluru / Online)
🗓 Event Dates: August 28 - August 30, 2026
⏰ Starts 10:00 AM IST
⚠️ *REGISTRATION DEADLINE: August 25, 2026 11:59 PM*
Prize Pool: ₹5,00,000 + Internship opportunities!
Form teams of 2-4.
Register now: https://ai-innovation-2026.dev/register
Forwarded from *Bangalore Tech Geeks WhatsApp Group*`,
  },
  {
    title: 'Weekend CTF & Meetup Digest',
    text: `🔥 *Weekend Tech Lineup!* 🔥

1️⃣ *Null Bangalore CTF Challenge*
Sharpen your reverse engineering and web exploitation skills.
📅 Date: This Saturday, August 23, 2026
⏰ 2:00 PM - 8:00 PM
Mode: 100% Online
Link: https://ctf.null.community/2026/round1

2️⃣ *Rust & WebAssembly Meetup #14*
Topic: Zero-cost abstractions in production.
📅 Date: Sunday, August 24, 2026
⏰ 11:00 AM
📍 Location: Microsoft Reactor, Lavelle Road, Bangalore
RSVP: https://meetup.com/rust-bangalore/events/3012948
Limited to first 60 seats!`,
  },
  {
    title: 'Community Workshop Announcement',
    text: `Hey folks, Google Cloud community is doing a hands-on Kubernetes workshop sometime next week on Zoom. Registration link is somewhere on https://gdg.community.dev. Check it out!`,
  }
];
