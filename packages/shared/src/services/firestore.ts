import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  orderBy,
  onSnapshot,
  where,
  limit,
  Firestore,
  writeBatch,
  Unsubscribe,
  QuerySnapshot,
  DocumentData,
  FirestoreError,
  increment,
  arrayUnion,
  arrayRemove,
  deleteField,
  getCountFromServer,
  runTransaction,
} from 'firebase/firestore';

import {
  CalendarEvent,
  ExtractedEvent,
  CommunityEvent,
  UserRole,
  BroadcastNotificationRequest,
  BroadcastNotificationResponse,
  EventAttendeeReminderRequest,
  EventAttendeeReminderResponse,
} from '../types/event';

// Suppress noisy internal WebChannel connection retry dumps and offline state transitions
try {
  setLogLevel('silent');
} catch {
  // Ignored in non-browser/unsupported environments
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

let firebaseApp: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;

function getOrInitFirestore(app: FirebaseApp): Firestore {
  try {
    // Force long polling on React Native to avoid WebChannel stream transport errors and WatchChangeAggregator assertion failure
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    });
  } catch {
    return getFirestore(app);
  }
}

export function initFirebase(config?: Partial<FirebaseConfig>): { app: FirebaseApp; db: Firestore } {
  if (getApps().length > 0) {
    firebaseApp = getApp();
    firestoreDb = getOrInitFirestore(firebaseApp);
    return { app: firebaseApp, db: firestoreDb };
  }

  const finalConfig: FirebaseConfig = {
    apiKey: config?.apiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: config?.authDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: config?.projectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: config?.storageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: config?.messagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: config?.appId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
  };

  firebaseApp = initializeApp(finalConfig);
  firestoreDb = getOrInitFirestore(firebaseApp);
  return { app: firebaseApp, db: firestoreDb };
}

export function getDb(): Firestore {
  if (!firestoreDb) {
    initFirebase();
  }
  return firestoreDb!;
}

/** Get reference to user events collection: /users/{uid}/events */
export function getUserEventsRef(uid: string) {
  const db = getDb();
  return collection(db, 'users', uid, 'events');
}

/** Generate a canonical Firestore document ID completely offline on the client */
export function generateEventId(uid?: string): string {
  const db = getDb();
  if (uid) {
    return doc(collection(db, 'users', uid, 'events')).id;
  }
  return doc(collection(db, 'events')).id;
}

/** Save a single event to Firestore under /users/{uid}/events/{eventId} */
export async function saveEvent(
  uid: string,
  eventData: Omit<CalendarEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<CalendarEvent> {
  const db = getDb();
  const eventsCol = collection(db, 'users', uid, 'events');
  const eventDoc = eventData.id ? doc(eventsCol, eventData.id) : doc(eventsCol);
  const now = new Date().toISOString();

  const finalEvent: CalendarEvent = {
    ...eventData,
    id: eventDoc.id,
    created_at: now,
    updated_at: now,
    userId: uid,
    tags: eventData.tags || [],
    reminder_offsets: eventData.reminder_offsets || [4320, 1440, 0],
    status: eventData.status || 'upcoming',
    type: (['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'].includes(eventData.type)
      ? eventData.type
      : 'other') as any,
    mode: (['online', 'offline', 'hybrid'].includes(eventData.mode)
      ? eventData.mode
      : 'offline') as any,
    confidence_score:
      typeof eventData.confidence_score === 'number' &&
      eventData.confidence_score >= 0 &&
      eventData.confidence_score <= 1
        ? eventData.confidence_score
        : 1.0,
  };

  await setDoc(eventDoc, finalEvent);
  return finalEvent;
}

/** Batch save multiple confirmed events (e.g. from a digest) */
export async function batchSaveExtractedEvents(
  uid: string,
  extractedEvents: ExtractedEvent[]
): Promise<CalendarEvent[]> {
  const db = getDb();
  const batch = writeBatch(db);
  const eventsCol = collection(db, 'users', uid, 'events');
  const now = new Date().toISOString();
  const savedEvents: CalendarEvent[] = [];

  for (const item of extractedEvents) {
    const eventDoc = doc(eventsCol);
    const event: CalendarEvent = {
      id: eventDoc.id,
      title: item.title,
      type: (['hackathon', 'ctf', 'meetup', 'workshop', 'deadline', 'other'].includes(item.type)
        ? item.type
        : 'other') as any,
      event_start_date: item.event_start_date,
      event_end_date: item.event_end_date,
      registration_deadline: item.registration_deadline,
      time: item.time,
      mode: (['online', 'offline', 'hybrid'].includes(item.mode) ? item.mode : 'offline') as any,
      location: item.location,
      registration_link: item.registration_link,
      source_group: item.source_group,
      raw_text: item.raw_text || '',
      confidence_score:
        typeof item.confidence_score === 'number' &&
        item.confidence_score >= 0 &&
        item.confidence_score <= 1
          ? item.confidence_score
          : 1.0,
      tags: item.tags || [item.type, item.mode],
      reminder_offsets: item.reminder_offsets || [4320, 1440, 0],
      created_at: now,
      updated_at: now,
      status: 'upcoming',
      userId: uid,
    };

    batch.set(eventDoc, event);
    savedEvents.push(event);
  }

  await batch.commit();
  return savedEvents;
}

/** Update an existing event */
export async function updateEvent(
  uid: string,
  eventId: string,
  updates: Partial<CalendarEvent>
): Promise<void> {
  const db = getDb();
  const eventDoc = doc(db, 'users', uid, 'events', eventId);
  await updateDoc(eventDoc, {
    ...updates,
    updated_at: new Date().toISOString(),
  });
}

/** Delete an event */
export async function deleteEvent(uid: string, eventId: string): Promise<void> {
  const db = getDb();
  const eventDoc = doc(db, 'users', uid, 'events', eventId);
  await deleteDoc(eventDoc);
}

/** Get single event */
export async function getEventById(uid: string, eventId: string): Promise<CalendarEvent | null> {
  const db = getDb();
  const eventDoc = doc(db, 'users', uid, 'events', eventId);
  const snap = await getDoc(eventDoc);
  if (!snap.exists()) return null;
  return snap.data() as CalendarEvent;
}

/** Subscribe to real-time updates for a user's events */
export function subscribeToUserEvents(
  uid: string,
  onUpdate: (events: CalendarEvent[], fromCache?: boolean) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getDb();
  // Query collection directly without orderBy so documents missing created_at are never omitted
  const eventsCol = collection(db, 'users', uid, 'events');

  return onSnapshot(
    eventsCol,
    (snapshot: QuerySnapshot<DocumentData>) => {
      const events: CalendarEvent[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        events.push({
          id: docSnap.id,
          ...data,
          userId: data.userId || uid,
        } as CalendarEvent);
      });

      // Sort in memory by created_at or event_start_date descending
      events.sort((a, b) => {
        const dateA = a.created_at || a.event_start_date || '';
        const dateB = b.created_at || b.event_start_date || '';
        return dateB.localeCompare(dateA);
      });

      onUpdate(events, snapshot.metadata.fromCache);
    },
    (error: FirestoreError) => {
      if (error.code !== 'unavailable') {
        console.warn('Firestore subscription status:', error.message);
      }
      if (onError) onError(error);
    }
  );
}

/** Subscribe to real-time live platform user count from Firestore */
export function subscribeToLiveUserCount(
  onUpdate: (count: number | null) => void
): Unsubscribe {
  const db = getDb();
  const statsDoc = doc(db, 'public_stats', 'platform');

  return onSnapshot(
    statsDoc,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (typeof data.totalUsers === 'number' && data.totalUsers > 0) {
          onUpdate(data.totalUsers);
        } else {
          onUpdate(null); // Doc exists but count not set yet
        }
      } else {
        onUpdate(null); // Doc doesn't exist yet — no users counted yet
      }
    },
    (err) => {
      // Quietly handle offline state without polluting console
      onUpdate(null);
    }
  );
}

/** Fetch user role ('admin' | 'student') from Firestore */
export async function fetchUserRole(uid: string): Promise<UserRole> {
  try {
    const db = getDb();
    const userDoc = doc(db, 'users', uid);
    const snap = await getDoc(userDoc);
    if (snap.exists()) {
      const data = snap.data();
      if (data.role === 'admin') return 'admin';
    }
  } catch (e: any) {
    if (e?.code !== 'unavailable') {
      console.warn('Could not fetch user role, defaulting to student:', e?.message || e);
    }
  }
  return 'student';
}

/** Subscribe to live community events for a specific college (e.g. SIES_GST) */
export function subscribeToCommunityEvents(
  college: string = 'SIES_GST',
  onUpdate: (events: CommunityEvent[], fromCache?: boolean) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getDb();
  // Query collection directly without orderBy so documents missing created_at are never omitted
  const colRef = collection(db, 'communityEvents');

  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: CommunityEvent[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CommunityEvent;
        if (!college || data.college === college) {
          list.push({ ...data, id: docSnap.id });
        }
      });

      // Sort in memory by created_at or event_start_date descending
      list.sort((a, b) => {
        const dateA = a.created_at || a.event_start_date || '';
        const dateB = b.created_at || b.event_start_date || '';
        return dateB.localeCompare(dateA);
      });

      onUpdate(list, snapshot.metadata.fromCache);
    },
    (error: FirestoreError) => {
      if (error.code !== 'unavailable') {
        console.warn('Community events subscription note:', error.message);
      }
      if (onError) onError(error);
    }
  );
}

/** Create a new community event (Admin only) */
export async function createCommunityEvent(
  eventData: Omit<CommunityEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<CommunityEvent> {
  const db = getDb();
  const colRef = collection(db, 'communityEvents');
  const eventDoc = eventData.id ? doc(colRef, eventData.id) : doc(colRef);
  const now = new Date().toISOString();

  const finalEvent: CommunityEvent = {
    ...eventData,
    id: eventDoc.id,
    created_at: now,
    updated_at: now,
    college: eventData.college || 'SIES_GST',
    tags: eventData.tags || [],
    attendeesCount: 0,
    attendees: [],
    attendeePreviews: {},
  };

  await setDoc(eventDoc, finalEvent);
  return finalEvent;
}

/** Batch publish extracted events to community feed (Admin only) */
export async function batchPublishCommunityEvents(
  extractedEvents: ExtractedEvent[],
  adminUid: string,
  college: string = 'SIES_GST'
): Promise<CommunityEvent[]> {
  const db = getDb();
  const batch = writeBatch(db);
  const colRef = collection(db, 'communityEvents');
  const now = new Date().toISOString();
  const published: CommunityEvent[] = [];

  for (const ext of extractedEvents) {
    const eventDoc = doc(colRef);
    const item: CommunityEvent = {
      id: eventDoc.id,
      title: ext.title,
      type: ext.type,
      event_start_date: ext.event_start_date,
      event_end_date: ext.event_end_date,
      registration_deadline: ext.registration_deadline,
      time: ext.time,
      mode: ext.mode,
      location: ext.location,
      registration_link: ext.registration_link,
      description: ext.raw_text,
      college,
      createdBy: adminUid,
      created_at: now,
      updated_at: now,
      source_group: ext.source_group,
      tags: ext.tags || [],
      attendeesCount: 0,
      attendees: [],
      attendeePreviews: {},
    };
    batch.set(eventDoc, item);
    published.push(item);
  }

  await batch.commit();
  return published;
}

/** Delete a community event (Admin only) */
export async function deleteCommunityEvent(eventId: string): Promise<void> {
  const db = getDb();
  const eventDoc = doc(db, 'communityEvents', eventId);
  await deleteDoc(eventDoc);
}

/**
 * Toggle student attendance ("I'm Going") on a community event:
 * - Updates attendees bare UID array via arrayUnion/arrayRemove
 * - Updates single field path attendeePreviews.${userId} with user initials
 * - Atomically increments/decrements attendeesCount
 */
export async function toggleCommunityEventAttendance(
  eventId: string,
  userId: string,
  userInitials: string,
  isJoining: boolean
): Promise<void> {
  const db = getDb();
  const eventDoc = doc(db, 'communityEvents', eventId);
  const now = new Date().toISOString();
  const cleanInitials = (userInitials || 'ST').toUpperCase().slice(0, 4);

  if (isJoining) {
    await updateDoc(eventDoc, {
      attendees: arrayUnion(userId),
      [`attendeePreviews.${userId}`]: cleanInitials,
      attendeesCount: increment(1),
      updated_at: now,
    });
  } else {
    await updateDoc(eventDoc, {
      attendees: arrayRemove(userId),
      [`attendeePreviews.${userId}`]: deleteField(),
      attendeesCount: increment(-1),
      updated_at: now,
    });
  }
}

/** Track user registration count in live platform stats with atomic transaction */
export async function trackUserRegistration(uid: string): Promise<void> {
  try {
    const db = getDb();
    const userDoc = doc(db, 'users', uid);
    const statsDoc = doc(db, 'public_stats', 'platform');

    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userDoc);
      const isAlreadyCounted = userSnap.exists() && userSnap.data()?.counted_in_stats === true;

      if (isAlreadyCounted) {
        return; // Already counted, do nothing
      }

      tx.set(
        userDoc,
        {
          uid,
          registered_at: userSnap.exists() ? (userSnap.data()?.registered_at || new Date().toISOString()) : new Date().toISOString(),
          counted_in_stats: true,
        },
        { merge: true }
      );

      tx.set(
        statsDoc,
        {
          totalUsers: increment(1),
          last_active: new Date().toISOString(),
        },
        { merge: true }
      );
    });
  } catch (e) {
    // Non-critical background telemetry
  }
}

/** Decrement user registration count in live platform stats when an account is deleted */
export async function decrementUserRegistration(uid?: string): Promise<void> {
  try {
    const db = getDb();
    const statsDoc = doc(db, 'public_stats', 'platform');
    await updateDoc(statsDoc, {
      totalUsers: increment(-1),
      last_active: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('Error decrementing platform user count:', e);
  }
}

/** Save or clear Expo push token for a user in Firestore (/users/{uid}) */
export async function saveUserPushToken(
  uid: string,
  pushToken: string | null,
  college: string = 'SIES_GST'
): Promise<void> {
  const db = getDb();
  const userDoc = doc(db, 'users', uid);
  const now = new Date().toISOString();

  await setDoc(
    userDoc,
    {
      pushToken: pushToken || null,
      pushTokenUpdatedAt: pushToken ? now : null,
      college: college || 'SIES_GST',
      updated_at: now,
    },
    { merge: true }
  );
}

/** Update user's displayName in Firestore (/users/{uid}) */
export async function updateUserDisplayNameInFirestore(
  uid: string,
  displayName: string
): Promise<void> {
  const db = getDb();
  const userDoc = doc(db, 'users', uid);
  await setDoc(
    userDoc,
    {
      displayName,
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
}

/** Broadcast an announcement push notification to all students in a college via Cloudflare Worker */
export async function broadcastCommunityPushNotification(
  workerUrl: string,
  idToken: string,
  payload: BroadcastNotificationRequest
): Promise<BroadcastNotificationResponse> {
  const url = `${workerUrl.replace(/\/$/, '')}/api/admin/broadcast-notification`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Broadcast failed' })) as any;
    throw new Error(errorData.error || `Broadcast failed with status ${response.status}`);
  }

  return (await response.json()) as BroadcastNotificationResponse;
}

/** Send targeted manual reminder or promotional push notification to attendees who saved an event */
export async function sendEventAttendeeReminder(
  workerUrl: string,
  idToken: string,
  payload: EventAttendeeReminderRequest
): Promise<EventAttendeeReminderResponse> {
  const url = `${workerUrl.replace(/\/$/, '')}/api/admin/event-reminder`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({ error: 'Reminder dispatch failed' }))) as any;
    throw new Error(errorData.message || errorData.error || `Reminder dispatch failed with status ${response.status}`);
  }

  return (await response.json()) as EventAttendeeReminderResponse;
}

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  eventId?: string;
  type?: string;
  createdAt: string;
  read?: boolean;
  college?: string;
}

/** Subscribe in real-time to campus announcements for a college (e.g. SIES_GST) */
export function subscribeCollegeAnnouncements(
  college: string = 'SIES_GST',
  onUpdate: (announcements: InAppNotification[]) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  const db = getDb();
  const annCol = collection(db, 'collegeAnnouncements');
  const q = query(annCol, orderBy('createdAt', 'desc'), limit(50));

  return onSnapshot(
    q,
    (snap) => {
      const items: InAppNotification[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (college && d.college && d.college !== college) return;
        items.push({
          id: d.id || docSnap.id,
          title: d.title || 'Campus Update',
          message: d.message || '',
          eventId: d.eventId,
          type: d.type || 'community_event',
          createdAt: d.createdAt || new Date().toISOString(),
          college: d.college || college,
        });
      });
      onUpdate(items);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/** Subscribe in real-time to a user's private notification subcollection (/users/{uid}/notifications) */
export function subscribeUserPrivateNotifications(
  uid: string,
  onUpdate: (notifications: InAppNotification[]) => void,
  onError?: (err: FirestoreError) => void
): Unsubscribe {
  const db = getDb();
  const notifCol = collection(db, 'users', uid, 'notifications');
  const q = query(notifCol, orderBy('createdAt', 'desc'), limit(25));

  return onSnapshot(
    q,
    (snap) => {
      const items: InAppNotification[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        items.push({
          id: d.id || docSnap.id,
          title: d.title || 'Notification',
          message: d.message || '',
          eventId: d.eventId,
          type: d.type || 'event_reminder',
          createdAt: d.createdAt || new Date().toISOString(),
          read: d.read || false,
        });
      });
      onUpdate(items);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

/** Publish a college announcement directly from admin client */
export async function saveCollegeAnnouncement(
  announcement: {
    college: string;
    title: string;
    message: string;
    eventId?: string;
    type?: string;
    adminUid?: string;
  }
): Promise<void> {
  const db = getDb();
  const announceId = `announce_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const annDoc = doc(db, 'collegeAnnouncements', announceId);
  await setDoc(annDoc, {
    id: announceId,
    college: announcement.college || 'SIES_GST',
    title: announcement.title,
    message: announcement.message,
    eventId: announcement.eventId || null,
    type: announcement.type || 'community_event',
    createdAt: new Date().toISOString(),
    adminUid: announcement.adminUid || null,
  });
}

/** Mark user private notification as read */
export async function markNotificationAsRead(uid: string, notificationId: string): Promise<void> {
  const db = getDb();
  const notifDoc = doc(db, 'users', uid, 'notifications', notificationId);
  await updateDoc(notifDoc, { read: true }).catch(() => {});
}

