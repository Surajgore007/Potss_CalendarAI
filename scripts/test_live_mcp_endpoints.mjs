import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 1. Extract device token
const tempDb = path.resolve('temp_rk.db');
execSync(`adb exec-out run-as com.suraj.eventpulse cat databases/RKStorage > "${tempDb}"`);
const content = fs.readFileSync(tempDb).toString('utf8');
if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);

const matches = content.match(/eyJh[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
let token = null;

for (const t of matches) {
  try {
    const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString('utf8'));
    if (p.iss?.includes('securetoken.google.com') && p.exp * 1000 > Date.now()) {
      token = t;
      break;
    }
  } catch (e) {}
}

if (!token) {
  console.error('No active token found.');
  process.exit(1);
}

console.log('Using live Firebase Bearer Token from device!');

// 2. Test OpenAPI endpoint (public)
console.log('\n--- 1. Testing GET /api/openapi.json ---');
const openApiRes = await fetch('https://vanko-api.vanko-app.workers.dev/api/openapi.json');
console.log('Status:', openApiRes.status);
if (openApiRes.ok) {
  const schema = await openApiRes.json();
  console.log('Title:', schema.info?.title);
  console.log('Endpoints count:', Object.keys(schema.paths || {}).length);
} else {
  console.log('OpenAPI not yet deployed to cloud, worker has local changes.');
}

// 3. Test Local MCP Server with Token
import { spawn } from 'child_process';
console.log('\n--- 2. Testing MCP Server tool call (list_events) via stdio ---');

const proc = spawn('node', ['packages/mcp/dist/cli.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    VANKO_AUTH_TOKEN: token,
  },
});

proc.stdout.on('data', (d) => {
  console.log('MCP Response:\n', d.toString().slice(0, 500));
  proc.kill();
  process.exit(0);
});

// Init
proc.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
}) + '\n');

// Call list_events tool
setTimeout(() => {
  proc.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'list_events',
      arguments: { limit: 5 }
    }
  }) + '\n');
}, 500);

setTimeout(() => {
  console.error('Timeout');
  proc.kill();
  process.exit(1);
}, 6000);

