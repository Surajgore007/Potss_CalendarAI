import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(__dirname, '../packages/mcp/dist/cli.js');

console.log('Testing Vanko MCP Server at:', cliPath);

const proc = spawn('node', [cliPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    VANKO_API_URL: 'https://vanko-api.vanko-app.workers.dev',
  },
});

let buffer = '';

proc.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line.trim());
      console.log('\n--- Received JSON-RPC message from MCP server ---');
      console.log('ID:', msg.id);
      if (msg.result?.serverInfo) {
        console.log('Server Info:', msg.result.serverInfo);
        console.log('Protocol Version:', msg.result.protocolVersion);
        console.log('Capabilities:', Object.keys(msg.result.capabilities || {}));
      }
      if (msg.result?.tools) {
        console.log('Tools registered count:', msg.result.tools.length);
        console.log('Tools:', msg.result.tools.map((t) => t.name).join(', '));
        console.log('\nSUCCESS: Vanko MCP server passed initialization and tools/list check!');
        proc.kill();
        process.exit(0);
      }
    } catch (e) {
      console.log('Raw output:', line);
    }
  }
});

// Step 1: Send initialize request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'vanko-test-runner', version: '1.0.0' },
  },
};

proc.stdin.write(JSON.stringify(initRequest) + '\n');

// Step 2: Send initialized notification + tools/list
setTimeout(() => {
  const notif = { jsonrpc: '2.0', method: 'notifications/initialized', params: {} };
  proc.stdin.write(JSON.stringify(notif) + '\n');

  const toolsListRequest = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
  proc.stdin.write(JSON.stringify(toolsListRequest) + '\n');
}, 300);

setTimeout(() => {
  console.error('Timeout waiting for MCP response.');
  proc.kill();
  process.exit(1);
}, 5000);

