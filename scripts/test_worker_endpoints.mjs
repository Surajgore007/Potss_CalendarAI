// Script to verify production Cloudflare Worker endpoints
const WORKER_URL = 'https://vanko-api.vanko-app.workers.dev';

async function runTests() {
  console.log('🚀 Starting Production Cloudflare Worker Endpoint Verification...');
  let passed = 0;
  let failed = 0;

  // 1. Health check
  try {
    const res = await fetch(`${WORKER_URL}/health`);
    if (res.status === 200) {
      console.log('✔ [PASS] GET /health returned 200 OK');
      passed++;
    } else {
      console.log(`❌ [FAIL] GET /health returned ${res.status}`);
      failed++;
    }
  } catch (e) {
    console.log('❌ [FAIL] GET /health threw error:', e.message);
    failed++;
  }

  // 2. Privacy policy & Terms HTML endpoints
  try {
    const res = await fetch(`${WORKER_URL}/privacy-policy`);
    const text = await res.text();
    if (res.status === 200 && text.includes('Privacy Policy') && text.includes('Vanko')) {
      console.log('✔ [PASS] GET /privacy-policy returned 200 with valid policy content');
      passed++;
    } else {
      console.log(`❌ [FAIL] GET /privacy-policy returned ${res.status}`);
      failed++;
    }
  } catch (e) {
    console.log('❌ [FAIL] GET /privacy-policy threw error:', e.message);
    failed++;
  }

  // 3. Auth Guard: POST /api/extract with No Token
  try {
    const res = await fetch(`${WORKER_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hackathon on Oct 20' }),
    });
    if (res.status === 401) {
      console.log('✔ [PASS] POST /api/extract without token rejected with 401 Unauthorized');
      passed++;
    } else {
      console.log(`❌ [FAIL] Expected 401 without token, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    console.log('❌ [FAIL] Auth guard test error:', e.message);
    failed++;
  }

  // 4. Auth Guard: POST /api/extract with Malformed Token
  try {
    const res = await fetch(`${WORKER_URL}/api/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.token.payload',
      },
      body: JSON.stringify({ text: 'Hackathon on Oct 20' }),
    });
    if (res.status === 401) {
      console.log('✔ [PASS] POST /api/extract with malformed token rejected with 401 Unauthorized');
      passed++;
    } else {
      console.log(`❌ [FAIL] Expected 401 with malformed token, got ${res.status}`);
      failed++;
    }
  } catch (e) {
    console.log('❌ [FAIL] Malformed token test error:', e.message);
    failed++;
  }

  // 5. CORS Preflight check
  try {
    const res = await fetch(`${WORKER_URL}/api/extract`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://vanko-app.vercel.app',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    if (res.status === 200 || res.status === 204) {
      console.log(`✔ [PASS] OPTIONS CORS preflight succeeded (Origin: ${allowOrigin || '*'})`);
      passed++;
    } else {
      console.log(`❌ [FAIL] OPTIONS CORS returned ${res.status}`);
      failed++;
    }
  } catch (e) {
    console.log('❌ [FAIL] CORS test error:', e.message);
    failed++;
  }

  // 6. OpenAPI specification
  try {
    const res = await fetch(`${WORKER_URL}/api/openapi.json`);
    if (res.status === 200) {
      const spec = await res.json();
      console.log(`✔ [PASS] GET /api/openapi.json returned valid OpenAPI spec (v${spec.openapi || spec.info?.version})`);
      passed++;
    } else {
      console.log(`❌ [FAIL] GET /api/openapi.json returned ${res.status}`);
      failed++;
    }
  } catch (e) {
    console.log('❌ [FAIL] OpenAPI test error:', e.message);
    failed++;
  }

  // 7. Security: Verify error responses do not leak stack traces
  try {
    const res = await fetch(`${WORKER_URL}/api/unknown-endpoint-404`);
    const body = await res.text();
    const hasStackTrace = body.includes('at ') && body.includes('.ts:');
    if (!hasStackTrace) {
      console.log('✔ [PASS] Error responses do NOT leak stack traces');
      passed++;
    } else {
      console.log('❌ [FAIL] Error response leaked stack trace!');
      failed++;
    }
  } catch (e) {
    console.log('❌ [FAIL] Stack trace test error:', e.message);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Worker Test Summary: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
}

runTests();

