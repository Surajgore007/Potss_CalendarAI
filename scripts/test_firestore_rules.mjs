import fs from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
  increment,
} from 'firebase/firestore';

async function runAdversarialRulesTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING FIRESTORE RULES EMULATOR ADVERSARIAL SUITE');
  console.log('====================================================\n');

  const rulesContent = fs.readFileSync('./firestore.rules', 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-rules-test-project',
    firestore: {
      rules: rulesContent,
      host: '127.0.0.1',
      port: 8080,
    },
  });

  const eventId = 'test-comm-event-1';

  try {
    // 0. Setup: Admin creates an initialized event
    console.log('[SETUP] Admin creating initialized community event...');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'admin_1'), { role: 'admin' });
      await setDoc(doc(db, 'users', 'student_alice'), { role: 'student' });
      await setDoc(doc(db, 'users', 'student_bob'), { role: 'student' });
      await setDoc(doc(db, 'users', 'attacker_mallory'), { role: 'student' });

      await setDoc(doc(db, 'communityEvents', eventId), {
        id: eventId,
        title: 'Hackathon 2026',
        type: 'hackathon',
        mode: 'online',
        college: 'SIES_GST',
        createdBy: 'admin_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['hackathon'],
        attendees: ['student_alice'],
        attendeesCount: 1,
        attendeePreviews: { student_alice: 'SA' },
      });
    });
    console.log('✅ Base event initialized with Alice attending.\n');

    // TEST 1: Legitimate Join (Bob joins with his own UID and initials)
    console.log('TEST 1: Legitimate Join by Bob');
    const bobContext = testEnv.authenticatedContext('student_bob');
    const bobDb = bobContext.firestore();
    await assertSucceeds(
      updateDoc(doc(bobDb, 'communityEvents', eventId), {
        attendees: arrayUnion('student_bob'),
        'attendeePreviews.student_bob': 'SB',
        attendeesCount: increment(1),
        updated_at: new Date().toISOString(),
      })
    );
    console.log('>>> Result: PASSED (Bob successfully joined)\n');

    // TEST 2: Adversarial Case (a) - Cross-user UID injection
    // Attacker Mallory tries to add Bob or victim without adding herself
    console.log('TEST 2: Adversarial Case (a) - Attacker Mallory tries to inject Victim UID without self');
    const malloryContext = testEnv.authenticatedContext('attacker_mallory');
    const malloryDb = malloryContext.firestore();
    await assertFails(
      updateDoc(doc(malloryDb, 'communityEvents', eventId), {
        attendees: arrayUnion('victim_user'),
        'attendeePreviews.victim_user': 'VU',
        attendeesCount: increment(1),
        updated_at: new Date().toISOString(),
      })
    );
    console.log('>>> Result: PASSED (Rejected - Mallory cannot inject other users)\n');

    // TEST 3: Adversarial Case (b) - Cross-user UID removal
    // Attacker Mallory tries to remove Alice from attendees
    console.log('TEST 3: Adversarial Case (b) - Attacker Mallory tries to remove Alice');
    await assertFails(
      updateDoc(doc(malloryDb, 'communityEvents', eventId), {
        attendees: arrayRemove('student_alice'),
        'attendeePreviews.student_alice': deleteField(),
        attendeesCount: increment(-1),
        updated_at: new Date().toISOString(),
      })
    );
    console.log('>>> Result: PASSED (Rejected - Mallory cannot remove Alice)\n');

    // TEST 4: Adversarial Case (c) - Cross-user initials tampering
    // Mallory tries to alter Alice\'s initials from "SA" to "XX"
    console.log('TEST 4: Adversarial Case (c) - Attacker Mallory tries to alter Alice initials');
    await assertFails(
      updateDoc(doc(malloryDb, 'communityEvents', eventId), {
        'attendeePreviews.student_alice': 'XX',
        updated_at: new Date().toISOString(),
      })
    );
    console.log('>>> Result: PASSED (Rejected - Mallory cannot modify Alice initials)\n');

    // TEST 5: Disallowed Field Write
    // Mallory tries to modify event title or dates
    console.log('TEST 5: Disallowed Field Write - Mallory tries to modify event title');
    await assertFails(
      updateDoc(doc(malloryDb, 'communityEvents', eventId), {
        title: 'Hacked Title By Mallory',
        updated_at: new Date().toISOString(),
      })
    );
    console.log('>>> Result: PASSED (Rejected - Disallowed field write)\n');

    // TEST 6: Legitimate Leave (Bob leaves his own attendance)
    console.log('TEST 6: Legitimate Leave by Bob');
    await assertSucceeds(
      updateDoc(doc(bobDb, 'communityEvents', eventId), {
        attendees: arrayRemove('student_bob'),
        'attendeePreviews.student_bob': deleteField(),
        attendeesCount: increment(-1),
        updated_at: new Date().toISOString(),
      })
    );
    console.log('>>> Result: PASSED (Bob successfully removed his own attendance)\n');

    // TEST 7: Creation-time Validation (Admin creates clean initialized event)
    console.log('TEST 7: Admin Legitimate Event Creation with Empty Initialization');
    const adminContext = testEnv.authenticatedContext('admin_1');
    const adminDb = adminContext.firestore();
    const newEventId = 'test-comm-event-clean';
    await assertSucceeds(
      setDoc(doc(adminDb, 'communityEvents', newEventId), {
        id: newEventId,
        title: 'New Clean Hackathon',
        type: 'hackathon',
        mode: 'online',
        college: 'SIES_GST',
        createdBy: 'admin_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['hackathon'],
        attendees: [],
        attendeesCount: 0,
        attendeePreviews: {},
      })
    );
    console.log('>>> Result: PASSED (Admin cleanly initialized new event)\n');

    // TEST 8: Creation-time Validation (Admin tries to create event with forged non-zero count)
    console.log('TEST 8: Adversarial Creation - Pre-seeded forged count (attendeesCount: 99)');
    const forgedEventId = 'test-comm-event-forged';
    await assertFails(
      setDoc(doc(adminDb, 'communityEvents', forgedEventId), {
        id: forgedEventId,
        title: 'Forged Hackathon',
        type: 'hackathon',
        mode: 'online',
        college: 'SIES_GST',
        createdBy: 'admin_1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['hackathon'],
        attendees: ['some_user'],
        attendeesCount: 99,
        attendeePreviews: { some_user: 'SU' },
      })
    );
    console.log('>>> Result: PASSED (Rejected - Creation must have attendees: [], attendeesCount: 0, attendeePreviews: {})\n');

    // TEST 9: Student tries to create community event
    console.log('TEST 9: Non-Admin Student Tries to Create Community Event');
    await assertFails(
      setDoc(doc(malloryDb, 'communityEvents', 'mallory-event'), {
        id: 'mallory-event',
        title: 'Unauthorized Event',
        type: 'hackathon',
        mode: 'online',
        college: 'SIES_GST',
        createdBy: 'attacker_mallory',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
        attendees: [],
        attendeesCount: 0,
        attendeePreviews: {},
      })
    );
    console.log('>>> Result: PASSED (Rejected - Only admin can create community events)\n');

    console.log('====================================================');
    console.log('🎉 ALL 9 EMULATOR SECURITY TESTS PASSED WITH 100% SUCCESS');
    console.log('====================================================');
  } finally {
    await testEnv.cleanup();
  }
}

runAdversarialRulesTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
