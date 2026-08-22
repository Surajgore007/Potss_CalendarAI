import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  CalendarEvent,
  ExtractedEvent,
  ClashDetail,
  saveEvent,
  batchSaveExtractedEvents,
  updateEvent,
  deleteEvent,
  subscribeToUserEvents,
  detectDuplicate,
  detectClashes,
  getEventsThisWeek,
} from '@eventpulse/shared';
import { useAuth } from './AuthContext';
import { syncAllEventNotifications } from '../services/notificationService';

interface EventsContextType {
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  pendingExtractions: ExtractedEvent[];
  setPendingExtractions: React.Dispatch<React.SetStateAction<ExtractedEvent[]>>;
  addEvent: (eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<CalendarEvent>;
  addBatchEvents: (extracted: ExtractedEvent[]) => Promise<CalendarEvent[]>;
  editEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  getEvent: (id: string) => CalendarEvent | undefined;
  checkDuplicate: (extracted: Pick<ExtractedEvent, 'title' | 'event_start_date' | 'registration_deadline'>) => {
    isDuplicate: boolean;
    matchedEvent?: CalendarEvent;
    similarityScore: number;
  };
  upcomingEvents: CalendarEvent[];
  clashes: ClashDetail[];
}

const EventsContext = createContext<EventsContextType | undefined>(undefined);

export const EventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isDemoUser } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pendingExtractions, setPendingExtractions] = useState<ExtractedEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync scheduled notifications whenever events change
  useEffect(() => {
    if (events.length > 0) {
      syncAllEventNotifications(events).catch((err) =>
        console.warn('Sync notifications warning:', err)
      );
    }
  }, [events]);

  // Real-time Firestore sync or local state for demo user
  useEffect(() => {
    if (!user) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    if (isDemoUser) {
      // Seed with rich realistic events for immediate testing if in demo mode
      const now = new Date();
      const formatOffsetDate = (daysAhead: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() + daysAhead);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      const demoEvents: CalendarEvent[] = [
        {
          id: 'demo_event_1',
          title: 'AI Agents & LLM Hackathon 2026',
          type: 'hackathon',
          event_start_date: formatOffsetDate(5),
          event_end_date: formatOffsetDate(7),
          registration_deadline: formatOffsetDate(2),
          time: '09:00',
          mode: 'hybrid',
          location: 'Bengaluru Tech Hub & Discord',
          registration_link: 'https://ai-agents-hack.dev/register',
          source_group: 'Bangalore Devs WhatsApp Group',
          raw_text: '🚀 AI AGENTS HACKATHON: Register by 2 days before event!',
          confidence_score: 0.95,
          tags: ['hackathon', 'ai', 'hybrid'],
          reminder_offsets: [4320, 1440, 0],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: 'upcoming',
          userId: user.uid,
        },
        {
          id: 'demo_event_2',
          title: 'Null Bangalore CTF Challenge',
          type: 'ctf',
          event_start_date: formatOffsetDate(2),
          event_end_date: null,
          registration_deadline: formatOffsetDate(1),
          time: '14:00',
          mode: 'online',
          location: 'https://ctf.null.community',
          registration_link: 'https://ctf.null.community/2026',
          source_group: 'CyberSec India Community',
          raw_text: 'Null CTF this Saturday! Online reverse engineering.',
          confidence_score: 0.92,
          tags: ['ctf', 'security', 'online'],
          reminder_offsets: [4320, 1440, 0],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: 'upcoming',
          userId: user.uid,
        },
        {
          id: 'demo_event_3',
          title: 'Rust Bangalore Meetup #14',
          type: 'meetup',
          event_start_date: formatOffsetDate(3),
          event_end_date: null,
          registration_deadline: null,
          time: '11:00',
          mode: 'offline',
          location: 'Microsoft Reactor, Lavelle Road, Bengaluru',
          registration_link: 'https://meetup.com/rust-bangalore',
          source_group: 'Rustaceans India',
          raw_text: 'Rust meetup at Microsoft Reactor.',
          confidence_score: 0.88,
          tags: ['meetup', 'rust', 'offline'],
          reminder_offsets: [4320, 1440, 0],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: 'upcoming',
          userId: user.uid,
        },
      ];

      setEvents(demoEvents);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = subscribeToUserEvents(
      user.uid,
      (fetchedEvents) => {
        setEvents(fetchedEvents);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Events subscription error:', err);
        setError('Failed to sync events from Firestore.');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isDemoUser]);

  const addEvent = async (eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<CalendarEvent> => {
    if (!user) throw new Error('User not authenticated');

    if (isDemoUser) {
      const newEvent: CalendarEvent = {
        ...eventData,
        id: eventData.id || `demo_${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        userId: user.uid,
        tags: eventData.tags || [],
        reminder_offsets: eventData.reminder_offsets || [4320, 1440, 0],
        status: eventData.status || 'upcoming',
      };
      setEvents((prev) => [newEvent, ...prev]);
      return newEvent;
    }

    return await saveEvent(user.uid, eventData);
  };

  const addBatchEvents = async (extracted: ExtractedEvent[]): Promise<CalendarEvent[]> => {
    if (!user) throw new Error('User not authenticated');

    if (isDemoUser) {
      const now = new Date().toISOString();
      const saved: CalendarEvent[] = extracted.map((item, idx) => ({
        id: `demo_${Date.now()}_${idx}`,
        title: item.title,
        type: item.type,
        event_start_date: item.event_start_date,
        event_end_date: item.event_end_date,
        registration_deadline: item.registration_deadline,
        time: item.time,
        mode: item.mode,
        location: item.location,
        registration_link: item.registration_link,
        source_group: item.source_group,
        raw_text: item.raw_text,
        confidence_score: item.confidence_score,
        tags: item.tags || [item.type, item.mode],
        reminder_offsets: item.reminder_offsets || [4320, 1440, 0],
        created_at: now,
        updated_at: now,
        status: 'upcoming',
        userId: user.uid,
      }));
      setEvents((prev) => [...saved, ...prev]);
      return saved;
    }

    return await batchSaveExtractedEvents(user.uid, extracted);
  };

  const editEvent = async (id: string, updates: Partial<CalendarEvent>): Promise<void> => {
    if (!user) throw new Error('User not authenticated');

    if (isDemoUser) {
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates, updated_at: new Date().toISOString() } : e))
      );
      return;
    }

    await updateEvent(user.uid, id, updates);
  };

  const removeEvent = async (id: string): Promise<void> => {
    if (!user) throw new Error('User not authenticated');

    if (isDemoUser) {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      return;
    }

    await deleteEvent(user.uid, id);
  };

  const getEvent = (id: string): CalendarEvent | undefined => {
    return events.find((e) => e.id === id);
  };

  const checkDuplicate = (extracted: Pick<ExtractedEvent, 'title' | 'event_start_date' | 'registration_deadline'>) => {
    return detectDuplicate(extracted, events);
  };

  const upcomingEvents = useMemo(() => {
    return getEventsThisWeek(events);
  }, [events]);

  const clashes = useMemo(() => {
    return detectClashes(events);
  }, [events]);

  return (
    <EventsContext.Provider
      value={{
        events,
        isLoading,
        error,
        pendingExtractions,
        setPendingExtractions,
        addEvent,
        addBatchEvents,
        editEvent,
        removeEvent,
        getEvent,
        checkDuplicate,
        upcomingEvents,
        clashes,
      }}
    >
      {children}
    </EventsContext.Provider>
  );
};

export const useEvents = (): EventsContextType => {
  const context = useContext(EventsContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventsProvider');
  }
  return context;
};
