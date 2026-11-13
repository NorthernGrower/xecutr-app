'use strict';

/**
 * Serves the app on one public port:
 *
 *   - the built app (vite preview) answers everything except Base44's own
 *     platform prefixes — pages, assets, TanStack server functions;
 *   - Base44's platform prefixes (entities, auth, functions, logs, realtime)
 *     are forwarded to the Base44 backend, so the self-hosted copy talks to
 *     the same backend the deployed app uses.
 *
 *   node deploy/serve.js
 *
 * Environment:
 *   PORT            public port                          (default 8080)
 *   FRONT_ORIGIN    where the app build is running       (default http://127.0.0.1:8082)
 *   BASE44_BACKEND  where Base44's platform API lives    (default https://base44.app)
 */

const http = require('node:http');
const https = require('node:https');

const PORT = Number(process.env.PORT || '8080');
const FRONT = new URL(process.env.FRONT_ORIGIN || 'http://127.0.0.1:8082');
const BACKEND = new URL(process.env.BASE44_BACKEND || 'https://base44.app');

/** Path prefixes that belong to Base44's platform, not to this app. */
const BASE44_PREFIXES = [
  '/api/apps/',
  '/api/app-logs/',
  '/api/parties/',
  '/api/ws-user-apps/',
  '/api/functions/',
];

const targetFor = (pathname) =>
  BASE44_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ? BACKEND : FRONT;

function proxy(request, response, target) {
  const headers = { ...request.headers, host: target.host };
  const transport = target.protocol === 'https:' ? https : http;
  const upstream = transport.request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: request.method,
      path: request.url,
      headers,
    },
    (up) => {
      response.writeHead(up.statusCode || 502, up.headers);
      up.pipe(response);
    },
  );
  upstream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('The app or backend did not answer.');
    } else {
      response.end();
    }
  });
  request.pipe(upstream);
}

/** WebSocket upgrade: tunnel raw bytes between the browser and the target. */
function tunnel(request, socket, head, target) {
  const headers = { ...request.headers, host: target.host };
  const transport = target.protocol === 'https:' ? https : http;
  const upstream = transport.request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: request.method,
      path: request.url,
      headers,
    },
  );
  upstream.on('upgrade', (upResponse, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/1.1 ${upResponse.statusCode} ${upResponse.statusMessage}`];
    for (const [name, value] of Object.entries(upResponse.headers)) {
      lines.push(`${name}: ${value}`);
    }
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    upstreamSocket.write(upstreamHead);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
    socket.on('error', () => upstreamSocket.destroy());
    upstreamSocket.on('error', () => socket.destroy());
  });
  upstream.on('error', () => socket.destroy());
  upstream.end(head);
}

const server = http.createServer((request, response) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  proxy(request, response, targetFor(pathname));
});

server.on('upgrade', (request, socket, head) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    socket.destroy();
    return;
  }
  tunnel(request, socket, head, targetFor(pathname));
});

server.on('error', (error) => {
  console.error('[serve] server error:', error && error.stack ? error.stack : error);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[serve] public port ${PORT} — app ${FRONT.origin}, Base44 backend ${BACKEND.origin}`,
  );
});
