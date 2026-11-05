/**
 * test_security_audit.mjs
 * Comprehensive pre-release security, rate limiting, and auth guard verification.
 */

const WORKER_BASE = 'https://vanko-api.vanko-app.workers.dev';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✔ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runSecuritySuite() {
  console.log('🔒 ==========================================');
  console.log('🔒 Running Pre-Release Security & API Verification');
  console.log('🔒 Target:', WORKER_BASE);
  console.log('🔒 ==========================================\n');

  // 1. MCP Endpoints Auth Guard Tests
  console.log('--- 1. Testing MCP Auth Guards & Route Protection ---');

  // Test 1.1: GET /api/mcp without token
  try {
    const res = await fetch(`${WORKER_BASE}/api/mcp`);
    assert(res.status === 401, `GET /api/mcp without auth returned 401 (got ${res.status})`);
  } catch (e) {
    assert(false, `GET /api/mcp network failure: ${e.message}`);
  }

  // Test 1.2: GET /api/mcp with forged bearer token
  try {
    const res = await fetch(`${WORKER_BASE}/api/mcp`, {
      headers: { Authorization: 'Bearer forged.fake.jwt.token' },
    });
    assert(res.status === 401, `GET /api/mcp with forged Bearer returned 401 (got ${res.status})`);
  } catch (e) {
    assert(false, `Forged token test error: ${e.message}`);
  }

  // Test 1.3: GET /api/mcp with invalid ?key= query parameter
  try {
    const res = await fetch(`${WORKER_BASE}/api/mcp?key=vnk_live_invalidkey12345`);
    assert(res.status === 401, `GET /api/mcp with invalid ?key= returned 401 (got ${res.status})`);
  } catch (e) {
    assert(false, `Invalid key test error: ${e.message}`);
  }

  // Test 1.4: POST /api/mcp/permanent-key without auth
  try {
    const res = await fetch(`${WORKER_BASE}/api/mcp/permanent-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(res.status === 401, `POST /api/mcp/permanent-key without auth returned 401 (got ${res.status})`);
  } catch (e) {
    assert(false, `Permanent key auth test error: ${e.message}`);
  }

  // 2. Information Disclosure & Error Shielding
  console.log('\n--- 2. Testing Information Disclosure & Error Shielding ---');

  // Test 2.1: Malformed JSON to /api/extract
  try {
    const res = await fetch(`${WORKER_BASE}/api/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test.token',
      },
      body: '{{malformed_json::',
    });
    const text = await res.text();
    assert(res.status >= 400 && res.status < 500, `Malformed JSON rejected with 4xx client error (got ${res.status})`);
    assert(!text.includes('at ') && !text.includes('node_modules'), 'Error response does not leak stack trace or internal paths');
    assert(!text.includes('CLOUDFLARE') && !text.includes('SECRET'), 'No environment secrets leaked in error output');
  } catch (e) {
    assert(false, `Malformed JSON test error: ${e.message}`);
  }

  // Test 2.2: CORS Headers Verification
  try {
    const res = await fetch(`${WORKER_BASE}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://vanko.app',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const allowOrigin = res.headers.get('access-control-allow-origin');
    assert(allowOrigin !== null, `CORS Access-Control-Allow-Origin header present (value: ${allowOrigin})`);
  } catch (e) {
    assert(false, `CORS options test error: ${e.message}`);
  }

  // 3. Rate Limiting Verification
  console.log('\n--- 3. Testing Worker Rate Limiting ---');
  try {
    const startTime = Date.now();
    let rateLimited = false;
    let successfulCalls = 0;
    const TOTAL_BURST = 35;

    console.log(`  Sending burst of ${TOTAL_BURST} requests to test IP rate limiter...`);

    const promises = Array.from({ length: TOTAL_BURST }).map(async (_, idx) => {
      const r = await fetch(`${WORKER_BASE}/api/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer sample_test_rate_token_${idx}`,
        },
        body: JSON.stringify({ text: 'Test rate limit check' }),
      });
      if (r.status === 429) {
        rateLimited = true;
      } else if (r.status === 401) {
        successfulCalls++;
      }
      return r.status;
    });

    const statuses = await Promise.all(promises);
    const elapsed = Date.now() - startTime;
    console.log(`  Burst completed in ${elapsed}ms. Response status breakdown:`, {
      '401_Unauthorized': statuses.filter((s) => s === 401).length,
      '429_RateLimited': statuses.filter((s) => s === 429).length,
      '500_ServerError': statuses.filter((s) => s === 500).length,
    });

    assert(
      statuses.filter((s) => s === 500).length === 0,
      'Zero 500 Internal Server Errors occurred during high-concurrency burst'
    );
    assert(
      rateLimited || statuses.filter((s) => s === 401).length === TOTAL_BURST,
      'All burst requests were strictly handled by auth guards or rate limiter'
    );
  } catch (e) {
    assert(false, `Rate limiting burst error: ${e.message}`);
  }

  // 4. OpenAPI & Documentation Contract Safety
  console.log('\n--- 4. Testing API Contract & Spec Integrity ---');
  try {
    const res = await fetch(`${WORKER_BASE}/api/openapi.json`);
    assert(res.status === 200, `GET /api/openapi.json returned 200 OK`);
    const spec = await res.json();
    assert(spec.openapi?.startsWith('3.'), `Spec is OpenAPI v3 compliant (version: ${spec.openapi})`);
    assert(spec.paths && spec.paths['/api/mcp/events'], 'Spec documents /api/mcp/events endpoint');
    assert(spec.paths && spec.paths['/api/mcp/events/search'], 'Spec documents /api/mcp/events/search endpoint');
  } catch (e) {
    assert(false, `OpenAPI spec test error: ${e.message}`);
  }

  // 5. Test Summary
  console.log('\n==========================================');
  console.log(`Security Audit Summary: ${passed} passed, ${failed} failed`);
  console.log('==========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecuritySuite();
