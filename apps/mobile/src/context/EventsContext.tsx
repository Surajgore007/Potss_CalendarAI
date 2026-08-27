import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const EVENTS_CACHE_PREFIX = '@eventpulse_cached_events_';

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
  const { user, firebaseUser } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pendingExtractions, setPendingExtractions] = useState<ExtractedEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sync notifications whenever active events change
  useEffect(() => {
    syncAllEventNotifications(events).catch(() => {});
  }, [events]);

  // Load user events from local cache and Firestore
  useEffect(() => {
    if (!user) {
      setEvents([]);
      syncAllEventNotifications([]).catch(() => {});
      setIsLoading(false);
      return;
    }

    const cacheKey = `${EVENTS_CACHE_PREFIX}${user.uid}`;

    // 1. Load local cache first
    AsyncStorage.getItem(cacheKey)
      .then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            setEvents(parsed);
          } catch {
            // Ignored
          }
        }
      })
      .catch(() => {});

    // 2. Real-time Firestore sync only if authenticated with Firebase
    if (firebaseUser && firebaseUser.uid === user.uid) {
      setIsLoading(true);
      let unsubscribe = () => {};

      try {
        unsubscribe = subscribeToUserEvents(
          firebaseUser.uid,
          async (fetchedEvents) => {
            setEvents(fetchedEvents);
            setIsLoading(false);
            setError(null);
            await AsyncStorage.setItem(cacheKey, JSON.stringify(fetchedEvents));
          },
          () => {
            setIsLoading(false);
          }
        );
      } catch {
        setIsLoading(false);
      }

      return () => unsubscribe();
    } else {
      setIsLoading(false);
    }
  }, [user, firebaseUser]);

  const saveToStorage = async (updatedList: CalendarEvent[]) => {
    if (user) {
      const cacheKey = `${EVENTS_CACHE_PREFIX}${user.uid}`;
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify(updatedList));
      } catch {
        // Ignored
      }
    }
  };

  const addEvent = async (
    eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<CalendarEvent> => {
    if (!user) throw new Error('User not logged in');

    let saved: CalendarEvent;
    if (firebaseUser) {
      saved = await saveEvent(firebaseUser.uid, eventData);
    } else {
      const now = new Date().toISOString();
      saved = {
        ...eventData,
        id: eventData.id || `local_event_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        created_at: now,
        updated_at: now,
      } as CalendarEvent;
    }

    const updated = [saved, ...events.filter((e) => e.id !== saved.id)];
    setEvents(updated);
    await saveToStorage(updated);
    return saved;
  };

  const addBatchEvents = async (extracted: ExtractedEvent[]): Promise<CalendarEvent[]> => {
    if (!user) throw new Error('User not logged in');

    let savedList: CalendarEvent[];
    if (firebaseUser) {
      savedList = await batchSaveExtractedEvents(firebaseUser.uid, extracted);
    } else {
      const now = new Date().toISOString();
      savedList = extracted.map((ext, idx) => ({
        id: `local_event_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 6)}`,
        title: ext.title,
        type: ext.type,
        event_start_date: ext.event_start_date,
        event_end_date: ext.event_end_date,
        registration_deadline: ext.registration_deadline,
        time: ext.time,
        mode: ext.mode,
        location: ext.location,
        registration_link: ext.registration_link,
        source_group: ext.source_group,
        raw_text: ext.raw_text,
        confidence_score: ext.confidence_score,
        tags: ext.tags || [],
        reminder_offsets: ext.reminder_offsets || [4320, 1440, 0],
        status: 'upcoming',
        created_at: now,
        updated_at: now,
      }));
    }

    const updated = [...savedList, ...events];
    setEvents(updated);
    await saveToStorage(updated);
    return savedList;
  };

  const editEvent = async (id: string, updates: Partial<CalendarEvent>): Promise<void> => {
    if (!user) throw new Error('User not logged in');

    if (firebaseUser && firebaseUser.uid === user.uid) {
      try {
        const editableUpdates: Partial<CalendarEvent> = {
          title: updates.title,
          type: updates.type,
          event_start_date: updates.event_start_date,
          event_end_date: updates.event_end_date,
          registration_deadline: updates.registration_deadline,
          time: updates.time,
          mode: updates.mode,
          location: updates.location,
          registration_link: updates.registration_link,
          source_group: updates.source_group,
          tags: updates.tags,
          reminder_offsets: updates.reminder_offsets,
          status: updates.status,
        };
        await updateEvent(firebaseUser.uid, id, editableUpdates);
      } catch {
        // Fallback to local
      }
    }

    const updated = events.map((e) =>
      e.id === id ? { ...e, ...updates, updated_at: new Date().toISOString() } : e
    );
    setEvents(updated);
    await saveToStorage(updated);
  };

  const removeEvent = async (id: string): Promise<void> => {
    if (!user) throw new Error('User not logged in');

    if (firebaseUser) {
      try {
        await deleteEvent(firebaseUser.uid, id);
      } catch {
        // Fallback to local
      }
    }

    const updated = events.filter((e) => e.id !== id);
    setEvents(updated);
    await saveToStorage(updated);
  };

  const getEvent = (id: string): CalendarEvent | undefined => {
    return events.find((e) => e.id === id);
  };

  const checkDuplicate = (
    extracted: Pick<ExtractedEvent, 'title' | 'event_start_date' | 'registration_deadline'>
  ) => {
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

export const useEvents = () => {
  const context = useContext(EventsContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventsProvider');
  }
  return context;
};
