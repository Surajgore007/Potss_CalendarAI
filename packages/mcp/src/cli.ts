#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createVankoMcpServer } from './server.js';

async function main() {
  const server = createVankoMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('Vanko Calendar MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in Vanko MCP server:', error);
  process.exit(1);
});

