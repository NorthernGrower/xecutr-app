'use strict';

/**
 * A minimal MCP server (Streamable HTTP transport) that runs shell commands on
 * this machine — the "full shell" bridge for the FreeMilk assistant.
 *
 *   - POST /mcp   JSON-RPC: initialize, tools/list, tools/call (run_command)
 *   - GET  /mcp   405 (stateless; no SSE stream)
 *
 * Auth: every request must carry `Authorization: <MCP_TOKEN>` (a bare token
 * also works — the Bearer prefix is optional). Commands run as root, so keep
 * the token secret and stop the container when you don't need it:
 *   docker rm -f xecutr-mcp
 *
 * Environment:
 *   MCP_TOKEN   required — the shared secret
 *   MCP_PORT    listen port (default 8888, loopback only; Caddy fronts it)
 *   MCP_CWD     working directory for commands (default /root/xecutr-app)
 */

const http = require('node:http');
const { exec } = require('node:child_process');
const crypto = require('node:crypto');

const TOKEN = process.env.MCP_TOKEN || '';
const PORT = Number(process.env.MCP_PORT || '8888');
const CWD = process.env.MCP_CWD || '/root/xecutr-app';
const MAX_TIMEOUT_MS = 120000;

if (!TOKEN) {
  console.error('[mcp] MCP_TOKEN is required — refusing to start without a secret.');
  process.exit(1);
}

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const authorized = (req) => {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  return safeEqual(token, TOKEN);
};

const runCommand = (command, timeoutSec) =>
  new Promise((resolve) => {
    const timeout = Math.min(Number(timeoutSec) || 60, MAX_TIMEOUT_MS / 1000);
    exec(command, { cwd: CWD, timeout: timeout * 1000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        content: [{ type: 'text', text: `${stdout || ''}${stderr ? `\n[stderr]\n${stderr}` : ''}`.trimEnd() || '(no output)' }],
        isError: Boolean(error),
      });
    });
  });

const TOOLS = [
  {
    name: 'run_command',
    description:
      'Run a shell command on the VPS as root, from /root/xecutr-app, and return its output. ' +
      'Use for diagnostics and admin: status, logs, systemctl, docker, ollama list, curl, git, npm.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run.' },
        timeout: { type: 'number', description: 'Seconds to wait before killing it (default 60, max 120).' },
      },
      required: ['command'],
    },
  },
];

/** JSON-RPC result or error for one request. */
const handle = async (message) => {
  const { id, method, params } = message;
  try {
    if (method === 'initialize') {
      return {
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'xecutr-vps', version: '1.0.0' },
        },
      };
    }
    if (method === 'tools/list') {
      return { id, result: { tools: TOOLS } };
    }
    if (method === 'tools/call') {
      if (params?.name !== 'run_command') {
        return { id, error: { code: -32602, message: `Unknown tool ${params?.name}` } };
      }
      const result = await runCommand(params?.arguments?.command || '', params?.arguments?.timeout);
      return { id, result };
    }
    if (method?.startsWith('notifications/')) return null; // notifications expect no reply
    return { id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (err) {
    return { id, error: { code: -32603, message: String(err?.message || err) } };
  }
};

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(405, { Allow: 'POST' }).end();
    return;
  }
  if (!authorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad json' }));
      return;
    }

    // A batch is answered with one JSON array; a single message with one object.
    if (Array.isArray(body)) {
      const replies = (await Promise.all(body.map(handle))).filter(Boolean);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(replies));
      return;
    }

    const reply = await handle(body);
    if (!reply) {
      res.writeHead(202).end(); // a notification: no body expected
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mcp] listening on 127.0.0.1:${PORT} — commands run from ${CWD}`);
});
