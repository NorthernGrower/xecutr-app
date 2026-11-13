'use strict';

/**
 * The Xecutr model gateway, in one file. Built as a container from this repo
 * (deploy/gateway/Dockerfile) — there is no second repo any more.
 *
 * It answers the endpoints the Base44 app calls (src/lib/xecutr.server.js):
 *   GET  /api/health     liveness
 *   GET  /api/providers  the model catalogue (live from Ollama)
 *   POST /api/uploads    raw bytes, kept for the conversation
 *   POST /api/chat       one streaming turn (SSE: route/text/files/error, [DONE])
 *
 * Everything else is proxied: Base44's platform prefixes go to the Base44
 * backend, all app traffic goes to the built front-end (vite preview).
 *
 * Environment:
 *   PORT             public port                    (default 8080)
 *   OLLAMA_BASE_URL  OpenAI-compatible base         (default http://127.0.0.1:11434/v1)
 *   OLLAMA_MODEL     model used when none requested (default coder)
 *   FRONTEND_ORIGIN  where the app build runs       (default http://127.0.0.1:8082)
 *   BASE44_BACKEND   where Base44's platform lives  (default https://base44.app)
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || '8080');
const OLLAMA = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'coder';
const FRONT = new URL(process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:8082');
const BACKEND = new URL(process.env.BASE44_BACKEND || 'https://base44.app');
const UPLOAD_DIR = '/tmp/xecutr-uploads';

const BASE44_PREFIXES = [
  '/api/apps/',
  '/api/app-logs/',
  '/api/parties/',
  '/api/ws-user-apps/',
  '/api/functions/',
];

const TEXTISH = /\.(txt|md|json|js|jsx|ts|tsx|css|scss|html|xml|yaml|yml|csv|env|py|rb|go|rs|java|sh|toml|ini|sql)$/i;

const sse = (res, event) => {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

/** The build agent's system prompt: who it is, plus the project's context. */
const systemPrompt = (body, uploadNotes) => {
  const parts = [
    'You are Xecutr, a build agent that works on the files of a web app project.',
    'Answer briefly and concretely.',
  ];
  if (body.memory?.length) {
    parts.push(
      'Notes from earlier turns in this project:\n' +
        body.memory.map((n) => `- ${n}`).join('\n'),
    );
  }
  if (body.files?.length) {
    let budget = 120000;
    const blocks = [];
    for (const f of body.files) {
      if (!f.path || !f.content) continue;
      const content = f.content.slice(0, budget);
      budget -= content.length;
      blocks.push(`\`\`\`file path="${f.path}"\n${content}\n\`\`\``);
      if (budget <= 0) break;
    }
    if (blocks.length) {
      parts.push(
        'These are the project files. When the user asks you to create or change a file, ' +
          'reply with the COMPLETE new file in a fenced block whose header is exactly ' +
          '`file path="the/path"` — the app saves it as the file:\n' +
          blocks.join('\n'),
      );
    }
  }
  if (uploadNotes.length) parts.push(uploadNotes.join('\n'));
  return parts.filter(Boolean).join('\n\n');
};

/** Everything the gateway needs to say before the model's first token. */
const chatTurn = async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
  });

  let body;
  try {
    body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
  } catch {
    sse(res, { type: 'error', message: 'Bad request body.' });
    res.end('data: [DONE]\n\n');
    return;
  }

  const model = body.model || DEFAULT_MODEL;
  sse(res, { type: 'route', providerName: 'Ollama (this server)', modelLabel: model });

  // Referenced uploads that are small and textual ride along; binary ones don't.
  const uploadNotes = [];
  for (const u of body.uploads || []) {
    if (!u?.id) continue;
    const file = path.join(UPLOAD_DIR, u.id, u.name || 'upload');
    try {
      const stat = fs.statSync(file);
      if (stat.size < 100000 && TEXTISH.test(file)) {
        uploadNotes.push(
          `Uploaded file ${u.name}:\n\`\`\`\n${fs.readFileSync(file, 'utf8').slice(0, 60000)}\n\`\`\``,
        );
      } else {
        uploadNotes.push(`Uploaded file ${u.name} (${stat.size} bytes, binary — not shown).`);
      }
    } catch {
      uploadNotes.push(`Uploaded file ${u.name}: no longer on disk.`);
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt(body, uploadNotes) },
    ...(body.messages || []).map((m) => ({ role: m.role || 'user', content: m.text || '' })),
  ].filter((m) => m.content);

  try {
    const upstream = await fetch(`${OLLAMA}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
    });
    if (!upstream.ok || !upstream.body) {
      sse(res, {
        type: 'error',
        message: `Ollama answered ${upstream.status}. Is the model pulled? (ollama list)`,
      });
      res.end('data: [DONE]\n\n');
      return;
    }

    // Ollama streams OpenAI-style SSE; re-frame its deltas as our text events.
    let full = '';
    let buffer = '';
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await upstream.body.getReader().read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, cut).trim();
        buffer = buffer.slice(cut + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            sse(res, { type: 'text', text: delta });
          }
        } catch {
          /* partial JSON across a chunk boundary — the next chunk completes it */
        }
      }
    }

    // Tell the app about file blocks inline, so its tool path saves them too.
    const files = [...full.matchAll(/```file path=["']([^"']+)["']\n([\s\S]*?)```/g)].map((m) => ({
      path: m[1],
      content: m[2].replace(/\n$/, ''),
    }));
    if (files.length) sse(res, { type: 'files', files });
  } catch (err) {
    sse(res, { type: 'error', message: `Ollama is unreachable: ${err?.message || err}` });
  }

  res.end('data: [DONE]\n\n');
};

/** The catalogue: one provider, Ollama, with the models actually installed. */
const providers = async (res) => {
  let models = [];
  try {
    const list = await fetch(`${OLLAMA}/models`);
    if (list.ok) {
      const body = await list.json();
      models = (Array.isArray(body?.data) ? body.data : [])
        .map((m) => m?.id)
        .filter((id) => typeof id === 'string')
        .sort();
    }
  } catch {
    /* fall through to the default model below */
  }
  if (!models.includes(DEFAULT_MODEL)) models.unshift(DEFAULT_MODEL);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      providers: [
        {
          id: 'ollama',
          name: 'Ollama (this server)',
          status: models.length > 1 || models.length ? 'ready' : 'unknown',
          keyless: true,
          freeTier: true,
          defaultModel: DEFAULT_MODEL,
          models,
        },
      ],
      readyCount: 1,
    }),
  );
};

/** One upload: raw bytes with x-upload-id / x-upload-name headers. */
const upload = async (req, res) => {
  const id = req.headers['x-upload-id'] || `up-${Date.now()}`;
  const name = decodeURIComponent(req.headers['x-upload-name'] || 'upload');
  const bytes = await readBody(req);
  const dir = path.join(UPLOAD_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), bytes);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, uploadId: id, name, size: bytes.length }));
};

/** Proxy a request — and tunnel its upgrade — to a target URL. */
const proxy = (target) => (req, res) => {
  const headers = { ...req.headers, host: target.hostname };
  const transport = target.protocol === 'https:' ? https : http;
  const upstream = transport.request(
    { hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), method: req.method, path: req.url, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('The app or backend did not answer.');
  });
  req.pipe(upstream);
};

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: 'xecutr', time: new Date().toISOString() }));
  } else if (pathname === '/api/providers' && (req.method === 'GET' || req.method === 'POST')) {
    providers(res);
  } else if (pathname === '/api/uploads' && req.method === 'POST') {
    upload(req, res);
  } else if (pathname === '/api/chat' && req.method === 'POST') {
    chatTurn(req, res);
  } else if (BASE44_PREFIXES.some((p) => pathname.startsWith(p))) {
    proxy(BACKEND)(req, res);
  } else {
    proxy(FRONT)(req, res);
  }
});

server.on('upgrade', (req, socket, head) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    socket.destroy();
    return;
  }
  const target = BASE44_PREFIXES.some((p) => pathname.startsWith(p)) ? BACKEND : FRONT;
  const transport = target.protocol === 'https:' ? https : http;
  const upstream = transport.request(
    { hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path: req.url, headers: { ...req.headers, host: target.hostname } },
  );
  upstream.on('upgrade', (upRes, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}`];
    for (const [name, value] of Object.entries(upRes.headers)) lines.push(`${name}: ${value}`);
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    upSocket.pipe(socket);
    socket.pipe(upSocket);
    socket.on('error', () => socket.destroy());
    upSocket.on('error', () => socket.destroy());
  });
  upstream.on('error', () => socket.destroy());
  upstream.end(head);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[gateway] public port ${PORT} — ollama ${OLLAMA} (model ${DEFAULT_MODEL}), app ${FRONT.origin}`);
});
