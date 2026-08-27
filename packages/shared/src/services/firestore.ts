import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  orderBy,
  onSnapshot,
  Firestore,
  writeBatch,
  Unsubscribe,
  QuerySnapshot,
  DocumentData,
  FirestoreError,
  increment,
  getCountFromServer,
  runTransaction,
} from 'firebase/firestore';
import { CalendarEvent, ExtractedEvent, CommunityEvent, UserRole } from '../types/event';

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

export function initFirebase(config?: Partial<FirebaseConfig>): { app: FirebaseApp; db: Firestore } {
  if (getApps().length > 0) {
    firebaseApp = getApp();
    firestoreDb = getFirestore(firebaseApp);
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
  firestoreDb = getFirestore(firebaseApp);
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
  onUpdate: (events: CalendarEvent[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getDb();
  const eventsQuery = query(collection(db, 'users', uid, 'events'), orderBy('created_at', 'desc'));

  return onSnapshot(
    eventsQuery,
    (snapshot: QuerySnapshot<DocumentData>) => {
      const events: CalendarEvent[] = [];
      snapshot.forEach((docSnap) => {
        events.push(docSnap.data() as CalendarEvent);
      });
      onUpdate(events);
    },
    (error: FirestoreError) => {
      console.warn('Firestore subscription status:', error.message);
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
      console.warn('Live stats subscription note:', err.message);
      onUpdate(null); // On error, show nothing rather than a fake number
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
  } catch (e) {
    console.warn('Could not fetch user role, defaulting to student:', e);
  }
  return 'student';
}

/** Subscribe to live community events for a specific college (e.g. SIES_GST) */
export function subscribeToCommunityEvents(
  college: string = 'SIES_GST',
  onUpdate: (events: CommunityEvent[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, 'communityEvents'),
    orderBy('created_at', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: CommunityEvent[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CommunityEvent;
        if (!college || data.college === college) {
          list.push({ ...data, id: docSnap.id });
        }
      });
      onUpdate(list);
    },
    (error: FirestoreError) => {
      console.warn('Community events subscription note:', error.message);
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
