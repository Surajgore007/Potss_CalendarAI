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
} from 'firebase/firestore';
import { CalendarEvent, ExtractedEvent } from '../types/event';

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
      console.error('Firestore subscription error:', error);
      if (onError) onError(error);
    }
  );
}
