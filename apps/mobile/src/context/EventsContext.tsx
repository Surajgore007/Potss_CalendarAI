import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
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
  generateEventId,
  isEventFinished,
} from '@eventpulse/shared';
import { useAuth } from './AuthContext';
import { syncAllEventNotifications, remapNotificationIds } from '../services/notificationService';
import { isOnline, subscribeToNetworkStatus } from '../services/networkService';

const EVENTS_CACHE_PREFIX = '@eventpulse_cached_events_';
const EVENTS_CACHE_LATEST = '@vanko_cached_events_latest';
const PENDING_WRITES_PREFIX = '@vanko_pending_writes_';

export interface PendingWrite {
  id: string; // Unique queue operation ID
  action: 'add' | 'edit' | 'delete';
  eventId: string;
  payload?: Partial<CalendarEvent>;
  timestamp: number;
}

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
  pendingWritesCount: number;
}

const EventsContext = createContext<EventsContextType | undefined>(undefined);

export const EventsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, firebaseUser } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pendingWrites, setPendingWrites] = useState<PendingWrite[]>([]);
  const [pendingExtractions, setPendingExtractions] = useState<ExtractedEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isDrainingRef = useRef(false);
  const drainTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  // 1. Initial Device-Level Cache Hydration (Frame 0 load)
  useEffect(() => {
    AsyncStorage.getItem(EVENTS_CACHE_LATEST)
      .then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setEvents(parsed);
              setIsLoading(false);
            }
          } catch {
            // Ignored
          }
        }
      })
      .catch(() => {});
  }, []);

  // Sync notifications whenever active events change
  useEffect(() => {
    syncAllEventNotifications(events).catch(() => {});
  }, [events]);

  const saveToStorage = async (updatedList: CalendarEvent[]) => {
    try {
      await AsyncStorage.setItem(EVENTS_CACHE_LATEST, JSON.stringify(updatedList));
      if (user) {
        await AsyncStorage.setItem(`${EVENTS_CACHE_PREFIX}${user.uid}`, JSON.stringify(updatedList));
      }
    } catch {
      // Ignored
    }
  };

  const savePendingWritesToStorage = async (queue: PendingWrite[]) => {
    if (!user) return;
    try {
      await AsyncStorage.setItem(`${PENDING_WRITES_PREFIX}${user.uid}`, JSON.stringify(queue));
    } catch {
      // Ignored
    }
  };

  // Helper to remap temporary local ID to real Firestore ID across state, outbox, and notifications
  const reconcileEventId = useCallback(async (tempId: string, realId: string, updatedEvent: CalendarEvent) => {
    if (!tempId || !realId || tempId === realId) return;

    // 1. Update remaining pending writes
    setPendingWrites((prevQueue) => {
      const updatedQueue = prevQueue.map((item) =>
        item.eventId === tempId ? { ...item, eventId: realId } : item
      );
      savePendingWritesToStorage(updatedQueue).catch(() => {});
      return updatedQueue;
    });

    // 2. Update React state & persistent cache
    setEvents((prevEvents) => {
      const updatedEvents = prevEvents.map((e) =>
        e.id === tempId ? { ...e, ...updatedEvent, id: realId } : e
      );
      saveToStorage(updatedEvents).catch(() => {});
      return updatedEvents;
    });

    // 3. Remap scheduled notifications
    remapNotificationIds(tempId, realId, updatedEvent).catch(() => {});
  }, [user]);

  // Drain the pending writes outbox sequentially (FIFO)
  const drainPendingWrites = useCallback(async () => {
    if (!user || !firebaseUser || isDrainingRef.current) return;

    const online = await isOnline();
    if (!online) return;

    isDrainingRef.current = true;
    try {
      const queueKey = `${PENDING_WRITES_PREFIX}${user.uid}`;
      const storedQueueRaw = await AsyncStorage.getItem(queueKey);
      if (!storedQueueRaw) {
        isDrainingRef.current = false;
        return;
      }

      let currentQueue: PendingWrite[] = [];
      try {
        currentQueue = JSON.parse(storedQueueRaw) || [];
      } catch {
        currentQueue = [];
      }

      if (currentQueue.length === 0) {
        isDrainingRef.current = false;
        return;
      }

      // Process items one-by-one in strict FIFO order
      while (currentQueue.length > 0) {
        const item = currentQueue[0];
        try {
          if (item.action === 'add' && item.payload) {
            const saved = await saveEvent(firebaseUser.uid, item.payload as any);
            if (saved.id && saved.id !== item.eventId) {
              await reconcileEventId(item.eventId, saved.id, saved);
            }
          } else if (item.action === 'edit' && item.payload) {
            await updateEvent(firebaseUser.uid, item.eventId, item.payload);
          } else if (item.action === 'delete') {
            await deleteEvent(firebaseUser.uid, item.eventId);
          }

          // Item succeeded: shift from queue and update storage
          currentQueue.shift();
          await AsyncStorage.setItem(queueKey, JSON.stringify(currentQueue));
          setPendingWrites([...currentQueue]);
          retryCountRef.current = 0; // Reset retry counter on successful write
        } catch (err: any) {
          const isNetworkError =
            err?.code === 'unavailable' ||
            err?.code === 'auth/network-request-failed' ||
            err?.message?.includes('network') ||
            !(await isOnline());

          if (isNetworkError) {
            // STOP immediately to preserve FIFO order and prevent write reordering
            const backoffDelays = [3000, 10000, 30000];
            const delayMs = backoffDelays[Math.min(retryCountRef.current, backoffDelays.length - 1)];
            retryCountRef.current += 1;

            if (drainTimeoutRef.current) clearTimeout(drainTimeoutRef.current);
            drainTimeoutRef.current = setTimeout(() => {
              drainPendingWrites().catch(() => {});
            }, delayMs);

            break; // Exit the FIFO loop
          } else {
            // Non-transient / validation error: drop poisoned item to keep queue healthy
            console.warn('Dropping invalid pending write:', err);
            currentQueue.shift();
            await AsyncStorage.setItem(queueKey, JSON.stringify(currentQueue));
            setPendingWrites([...currentQueue]);
          }
        }
      }
    } finally {
      isDrainingRef.current = false;
    }
  }, [user, firebaseUser, reconcileEventId]);

  // Load user events & pending writes, listen to Firestore and network changes
  useEffect(() => {
    if (!user) {
      setEvents([]);
      setPendingWrites([]);
      syncAllEventNotifications([]).catch(() => {});
      setIsLoading(false);
      return;
    }

    const cacheKey = `${EVENTS_CACHE_PREFIX}${user.uid}`;
    const queueKey = `${PENDING_WRITES_PREFIX}${user.uid}`;

    // 1. Hydrate user-specific cache and pending outbox queue
    AsyncStorage.multiGet([cacheKey, queueKey])
      .then(([cachedEventsRes, queueRes]) => {
        if (cachedEventsRes[1]) {
          try {
            const parsed = JSON.parse(cachedEventsRes[1]);
            if (Array.isArray(parsed)) {
              setEvents(parsed);
              setIsLoading(false);
            }
          } catch {
            // Ignored
          }
        }

        if (queueRes[1]) {
          try {
            const parsedQueue = JSON.parse(queueRes[1]);
            if (Array.isArray(parsedQueue)) {
              setPendingWrites(parsedQueue);
            }
          } catch {
            // Ignored
          }
        }
      })
      .catch(() => {});

    // 2. Setup Firestore real-time listener if authenticated
    let unsubscribeFirestore = () => {};
    if (firebaseUser && firebaseUser.uid === user.uid) {
      try {
        unsubscribeFirestore = subscribeToUserEvents(
          firebaseUser.uid,
          async (fetchedEvents) => {
            // Merge with any un-drained local additions so they aren't prematurely overwritten
            setEvents((currentEvents) => {
              const fetchedMap = new Map(fetchedEvents.map((e) => [e.id, e]));
              // Keep any events currently in local state that are still in the pending add queue
              const merged = [...fetchedEvents];
              for (const e of currentEvents) {
                if (!fetchedMap.has(e.id) && pendingWrites.some((w) => w.eventId === e.id && w.action === 'add')) {
                  merged.push(e);
                }
              }
              saveToStorage(merged).catch(() => {});
              return merged;
            });
            setIsLoading(false);
            setError(null);
          },
          () => {
            setIsLoading(false);
          }
        );
      } catch {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }

    // 3. Multi-Trigger Outbox Drain Listeners:
    // Trigger A: Network status transition to online
    const unsubscribeNet = subscribeToNetworkStatus((online) => {
      if (online) {
        if (drainTimeoutRef.current) {
          clearTimeout(drainTimeoutRef.current);
          drainTimeoutRef.current = null;
        }
        retryCountRef.current = 0;
        drainPendingWrites().catch(() => {});
      }
    });

    // Trigger B: AppState transition to 'active' (foreground return)
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        if (drainTimeoutRef.current) {
          clearTimeout(drainTimeoutRef.current);
          drainTimeoutRef.current = null;
        }
        retryCountRef.current = 0;
        drainPendingWrites().catch(() => {});
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // Trigger C: Startup online drain attempt
    drainPendingWrites().catch(() => {});

    return () => {
      unsubscribeFirestore();
      unsubscribeNet();
      appStateSub.remove();
      if (drainTimeoutRef.current) clearTimeout(drainTimeoutRef.current);
    };
  }, [user, firebaseUser, drainPendingWrites]);

  // Add Event with client-side canonical ID generation and outbox queuing
  const addEvent = async (
    eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<CalendarEvent> => {
    if (!user) throw new Error('User not logged in');

    const now = new Date().toISOString();
    // Canonical 20-character Firestore ID generated client-side
    const eventId = eventData.id || generateEventId(user.uid);

    const saved: CalendarEvent = {
      ...eventData,
      id: eventId,
      userId: user.uid,
      tags: eventData.tags || [],
      reminder_offsets: eventData.reminder_offsets || [4320, 1440, 0],
      status: eventData.status || 'upcoming',
      created_at: now,
      updated_at: now,
    };

    // Optimistically update local state & cache immediately
    const updated = [saved, ...events.filter((e) => e.id !== saved.id)];
    setEvents(updated);
    await saveToStorage(updated);

    const online = await isOnline();
    if (online && firebaseUser) {
      try {
        await saveEvent(firebaseUser.uid, saved);
      } catch {
        // Network drop: queue to pendingWrites outbox
        const newWrite: PendingWrite = {
          id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          action: 'add',
          eventId: saved.id,
          payload: saved,
          timestamp: Date.now(),
        };
        const nextQueue = [...pendingWrites, newWrite];
        setPendingWrites(nextQueue);
        await savePendingWritesToStorage(nextQueue);
      }
    } else {
      // Offline: queue to pendingWrites outbox
      const newWrite: PendingWrite = {
        id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        action: 'add',
        eventId: saved.id,
        payload: saved,
        timestamp: Date.now(),
      };
      const nextQueue = [...pendingWrites, newWrite];
      setPendingWrites(nextQueue);
      await savePendingWritesToStorage(nextQueue);
    }

    return saved;
  };

  // Add Batch Events with canonical client-side IDs
  const addBatchEvents = async (extracted: ExtractedEvent[]): Promise<CalendarEvent[]> => {
    if (!user) throw new Error('User not logged in');

    const now = new Date().toISOString();
    const savedList: CalendarEvent[] = extracted.map((ext) => ({
      id: generateEventId(user.uid),
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
      userId: user.uid,
    }));

    const updated = [...savedList, ...events];
    setEvents(updated);
    await saveToStorage(updated);

    const online = await isOnline();
    if (online && firebaseUser) {
      try {
        await batchSaveExtractedEvents(firebaseUser.uid, extracted);
      } catch {
        // Queue individual writes to outbox
        const newWrites: PendingWrite[] = savedList.map((e) => ({
          id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          action: 'add',
          eventId: e.id,
          payload: e,
          timestamp: Date.now(),
        }));
        const nextQueue = [...pendingWrites, ...newWrites];
        setPendingWrites(nextQueue);
        await savePendingWritesToStorage(nextQueue);
      }
    } else {
      const newWrites: PendingWrite[] = savedList.map((e) => ({
        id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        action: 'add',
        eventId: e.id,
        payload: e,
        timestamp: Date.now(),
      }));
      const nextQueue = [...pendingWrites, ...newWrites];
      setPendingWrites(nextQueue);
      await savePendingWritesToStorage(nextQueue);
    }

    return savedList;
  };

  // Edit Event with optimistic local update and outbox queuing
  const editEvent = async (id: string, updates: Partial<CalendarEvent>): Promise<void> => {
    if (!user) throw new Error('User not logged in');

    const updated = events.map((e) =>
      e.id === id ? { ...e, ...updates, updated_at: new Date().toISOString() } : e
    );
    setEvents(updated);
    await saveToStorage(updated);

    const online = await isOnline();
    if (online && firebaseUser) {
      try {
        await updateEvent(firebaseUser.uid, id, updates);
      } catch {
        // Queue edit to outbox
        const newWrite: PendingWrite = {
          id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          action: 'edit',
          eventId: id,
          payload: updates,
          timestamp: Date.now(),
        };
        const nextQueue = [...pendingWrites, newWrite];
        setPendingWrites(nextQueue);
        await savePendingWritesToStorage(nextQueue);
      }
    } else {
      const newWrite: PendingWrite = {
        id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        action: 'edit',
        eventId: id,
        payload: updates,
        timestamp: Date.now(),
      };
      const nextQueue = [...pendingWrites, newWrite];
      setPendingWrites(nextQueue);
      await savePendingWritesToStorage(nextQueue);
    }
  };

  // Remove Event with optimistic local update and outbox queuing
  const removeEvent = async (id: string): Promise<void> => {
    if (!user) throw new Error('User not logged in');

    const updated = events.filter((e) => e.id !== id);
    setEvents(updated);
    await saveToStorage(updated);

    const online = await isOnline();
    if (online && firebaseUser) {
      try {
        await deleteEvent(firebaseUser.uid, id);
      } catch {
        const newWrite: PendingWrite = {
          id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          action: 'delete',
          eventId: id,
          timestamp: Date.now(),
        };
        const nextQueue = [...pendingWrites, newWrite];
        setPendingWrites(nextQueue);
        await savePendingWritesToStorage(nextQueue);
      }
    } else {
      const newWrite: PendingWrite = {
        id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        action: 'delete',
        eventId: id,
        timestamp: Date.now(),
      };
      const nextQueue = [...pendingWrites, newWrite];
      setPendingWrites(nextQueue);
      await savePendingWritesToStorage(nextQueue);
    }
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
        pendingWritesCount: pendingWrites.length,
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
