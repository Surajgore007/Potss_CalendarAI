// Usage: FIREBASE_TOKEN="<token>" node scripts/test_firestore_query.mjs
// Or: node scripts/test_firestore_query.mjs <token>
const token = process.env.FIREBASE_TOKEN || process.argv[2];
if (!token) {
  console.error('Missing Firebase token. Run with: node scripts/test_firestore_query.mjs <token>');
  process.exit(1);
}
const uid = process.env.FIREBASE_UID || 'KWO2uP2g3VhOfGN1jFQgKcNI3lp2';
const projectId = process.env.FIREBASE_PROJECT_ID || 'calendarai-f5cd0';

const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}/events?pageSize=10`;
console.log('Querying:', url);

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` }
});

console.log('Status:', res.status);
const data = await res.json();
console.log('Docs count:', (data.documents || []).length);
if (data.documents) {
  for (const doc of data.documents.slice(0, 3)) {
    console.log('Title:', doc.fields?.title?.stringValue, '| Deadline:', doc.fields?.registration_deadline?.stringValue, '| Start:', doc.fields?.event_start_date?.stringValue);
  }
} else {
  console.log('Error/Response:', JSON.stringify(data, null, 2));
}

