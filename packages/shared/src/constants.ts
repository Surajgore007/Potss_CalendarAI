import { EventType, EventMode, EventStatus } from './types/event';

/** Default reminder offsets in minutes: 3 days (4320m), 1 day (1440m), day-of (0m) */
export const DEFAULT_REMINDER_OFFSETS = [4320, 1440, 0];

export const CONFIDENCE_LOW_THRESHOLD = 0.70;

export const THEME_DESIGN = {
  colors: {
    bgLight: '#F8FAFC',
    bgDark: '#0B0F19',
    surfaceLight: '#FFFFFF',
    surfaceDark: '#131B2E',
    surfaceCard: 'rgba(255, 255, 255, 0.96)',
    surfaceFrosted: 'rgba(255, 255, 255, 0.85)',
    borderLight: '#E2E8F0',
    borderSubtle: 'rgba(226, 232, 240, 0.7)',
    borderGlow: 'rgba(99, 102, 241, 0.25)',
    primary: '#4F46E5',
    primaryLight: '#6366F1',
    primaryGlow: 'rgba(79, 70, 229, 0.12)',
    accentEmerald: '#10B981',
    accentAmber: '#F59E0B',
    accentRose: '#F43F5E',
    accentCyan: '#06B6D4',
    textMain: '#0F172A',
    textMuted: '#64748B',
    textLight: '#94A3B8',
  },
  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    pill: 9999,
  },
  shadows: {
    card: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
    cardHover: {
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 4,
    },
    glow: {
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 14,
      elevation: 5,
    },
  },
};

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
    badgeBg: '#EEF2FF',
    badgeText: '#4F46E5',
    accentColor: '#6366F1',
    gradient: ['#6366F1', '#4F46E5'],
    icon: 'code-slash-outline',
    defaultUrgency: 'high',
  },
  ctf: {
    label: 'CTF Challenge',
    badgeBg: '#FFF1F2',
    badgeText: '#E11D48',
    accentColor: '#F43F5E',
    gradient: ['#F43F5E', '#BE123C'],
    icon: 'shield-checkmark-outline',
    defaultUrgency: 'high',
  },
  meetup: {
    label: 'Tech Meetup',
    badgeBg: '#ECFDF5',
    badgeText: '#059669',
    accentColor: '#10B981',
    gradient: ['#10B981', '#047857'],
    icon: 'people-outline',
    defaultUrgency: 'normal',
  },
  workshop: {
    label: 'Workshop',
    badgeBg: '#F0F9FF',
    badgeText: '#0284C7',
    accentColor: '#0EA5E9',
    gradient: ['#0EA5E9', '#0369A1'],
    icon: 'school-outline',
    defaultUrgency: 'medium',
  },
  deadline: {
    label: 'Deadline',
    badgeBg: '#FFFBEB',
    badgeText: '#D97706',
    accentColor: '#F59E0B',
    gradient: ['#F59E0B', '#B45309'],
    icon: 'alarm-outline',
    defaultUrgency: 'critical',
  },
  other: {
    label: 'Tech Event',
    badgeBg: '#F8FAFC',
    badgeText: '#475569',
    accentColor: '#64748B',
    gradient: ['#64748B', '#334155'],
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
    badgeBg: '#F0F9FF',
    badgeText: '#0284C7',
    icon: 'globe-outline',
  },
  offline: {
    label: 'In-Person',
    badgeBg: '#ECFDF5',
    badgeText: '#059669',
    icon: 'location-outline',
  },
  hybrid: {
    label: 'Hybrid',
    badgeBg: '#FAF5FF',
    badgeText: '#9333EA',
    icon: 'shuffle-outline',
  },
};

export const EVENT_STATUS_CONFIG: Record<
  EventStatus,
  {
    label: string;
    color: string;
    icon: string;
  }
> = {
  upcoming: {
    label: 'Upcoming',
    color: '#4F46E5',
    icon: 'time-outline',
  },
  registered: {
    label: 'Registered',
    color: '#10B981',
    icon: 'checkmark-circle-outline',
  },
  skipped: {
    label: 'Skipped',
    color: '#94A3B8',
    icon: 'close-circle-outline',
  },
  past: {
    label: 'Past',
    color: '#64748B',
    icon: 'archive-outline',
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
          title: { type: 'STRING' },
          type: {
            type: 'STRING',
            enum: ['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'],
          },
          event_start_date: { type: 'STRING' },
          event_end_date: { type: 'STRING' },
          registration_deadline: { type: 'STRING' },
          time: { type: 'STRING' },
          mode: {
            type: 'STRING',
            enum: ['online', 'offline', 'hybrid'],
          },
          location: { type: 'STRING' },
          registration_link: { type: 'STRING' },
          source_group: { type: 'STRING' },
          confidence_score: { type: 'NUMBER' },
          tags: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
        },
        required: ['title', 'type', 'mode', 'confidence_score'],
      },
    },
  },
  required: ['events'],
};

export const SAMPLE_WHATSAPP_MESSAGES = [
  {
    title: 'Hackathon & Registration',
    text: `🚀 *HackNITR 6.0 is LIVE!* 🚀\n\nJoin India's biggest student-run hackathon!\n\n📅 *Event Dates:* Oct 18 - Oct 20, 2026\n⏰ *Time:* 10:00 AM IST\n📍 *Mode:* Hybrid (NIT Rourkela + Discord)\n🏆 *Prizes:* ₹5,00,000+ in cash & swags!\n\n⚠️ *Registration Deadline:* Oct 10, 2026 at 11:59 PM IST\n\n👉 Register now: https://hacknitr.devfolio.co\nDon't miss out! Teams of 2-4 allowed.`,
  },
  {
    title: 'CTF Challenge',
    text: `🚩 *nullcon HackIM CTF 2026 Announced!* 🚩\n\nGet ready for 48 hours of intense jeopardy-style CTF.\n\n🗓️ *Date:* Nov 5, 2026\n⏰ *Starts:* 18:00 UTC\n🌐 *Platform:* Online\n🎯 *Categories:* Web, Pwn, Reverse, Crypto, Forensics\n\n📌 *Register before:* Nov 1, 2026\n🔗 Link: https://ctf.nullcon.net\nOrganized by @nullcommunity`,
  },
  {
    title: 'Hands-on AI Workshop',
    text: `🤖 *Free Workshop: Building Full-Stack LLM Apps with LangChain & Next.js*\n\nHey everyone! GDG Pune is hosting a free hands-on workshop.\n\n📅 *Date:* Sep 28, 2026\n🕒 *Time:* 2:00 PM - 5:00 PM IST\n📍 *Venue:* Cummins College of Engineering, Pune (Offline)\n\n⚡ *Seats limited to 80 people!*\n⏳ *Registration Closes:* Sep 25, 2026\n🎟️ RSVP here: https://gdg.community.dev/events/pune-ai-workshop\nBring your laptops!`,
  },
];
