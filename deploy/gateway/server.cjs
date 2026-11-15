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
 * The media service (deploy/media) is passed straight through, so the app can
 * generate images and clips without a second public port:
 *   POST /api/media/jobs, GET /api/media/jobs/<id>, GET /api/media/health,
 *   GET  /media/<file>
 *
 * Everything else is proxied: Base44's platform prefixes go to the Base44
 * backend, all app traffic goes to the built front-end (vite preview).
 *
 * Environment:
 *   PORT             public port                    (default 8080)
 *   OLLAMA_BASE_URL  OpenAI-compatible base         (default http://127.0.0.1:11434/v1)
 *   OLLAMA_MODEL     model used when none requested (default coder)
 *   OLLAMA_ROUTE_MODEL    picked instead for long or heavy turns (default: none)
 *   OLLAMA_FALLBACK_MODEL retried when a turn is refused or errors (default: none)
 *   FRONTEND_ORIGIN  where the app build runs       (default http://127.0.0.1:8082)
 *   BASE44_BACKEND   where Base44's platform lives  (default https://base44.app)
 *   MEDIA_URL        where the media service listens (default http://127.0.0.1:8090)
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || '8080');
const OLLAMA = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'coder';
/** A long or heavy turn goes here instead of the fast default (empty: never route). */
const ROUTE_MODEL = process.env.OLLAMA_ROUTE_MODEL || '';
/** The unrestricted local model a refusal or a failed turn escalates to. */
const FALLBACK_MODEL = process.env.OLLAMA_FALLBACK_MODEL || '';
const FRONT = new URL(process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:8082');
const BACKEND = new URL(process.env.BASE44_BACKEND || 'https://base44.app');
const UPLOAD_DIR = '/tmp/xecutr-uploads';
const MEDIA = new URL(process.env.MEDIA_URL || 'http://127.0.0.1:8090');

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
  // The app watches for these markers in the reply and runs the media service.
  parts.push(
    'This project can generate media on this server. When the user asks for an image, ' +
      'add one line of exactly this shape: [[image: a vivid one-sentence description]] . ' +
      'When they ask for a video or an animation, add: [[video: a vivid one-sentence description]] . ' +
      'When they ask for music, a song, a soundtrack or a jingle, add: ' +
      '[[music: genre, instruments, tempo and mood]] . ' +
      'The app turns each marker into a real file in the project, so describe the result, ' +
      'not the code: for images and clips the weather, light, colours, subject and style, ' +
      'and for music the genre, instruments, tempo and mood. Use at most one marker per reply, ' +
      'and only when the user asked for media: images take seconds, music about a minute, ' +
      'clips take minutes. For example, asked for calm music for a landing page, reply: ' +
      '"A calm bed for the page.\n[[music: soft piano and warm strings, 70 bpm, hopeful, cinematic]]"',
  );
  if (uploadNotes.length) parts.push(uploadNotes.join('\n'));
  return parts.filter(Boolean).join('\n\n');
};

/** A word in the user's own message that asks for a generated asset. */
const MEDIA_INTENT =
  /\b(music|song|soundtrack|sound track|jingle|track|beat|image|picture|illustration|logo|icon|artwork|clip|video|animation)\b/i;

/**
 * A 7B follows a rule placed next to the question much better than one buried
 * in a long system prompt — and it tends to answer "I will generate…" instead
 * of emitting the marker, so the reminder names that mistake explicitly.
 */
const MEDIA_REMINDER =
  '\n\n[MEDIA TOOL] The user asked for a generated asset. Reply with at most two sentences, ' +
  'then one final line of exactly this form: [[image: ...]] or [[video: ...]] or [[music: ...]], ' +
  'filled with a concrete description (for music: genre, instruments, tempo, mood). ' +
  'Do not say you will generate it, do not explain the marker, and do not repeat these rules — ' +
  'the app makes the file from that line.';

const withMediaReminder = (text) => {
  if (!MEDIA_INTENT.test(text) || text.includes('[MODE: PLAN ONLY]')) return text;
  return `${text}${MEDIA_REMINDER}`;
};

/** Words that mean the turn is worth a stronger model than the fast default. */
const HEAVY_TASK =
  /(architect|design|refactor|review|audit|security|optimi[sz]e|migrat|multi-?\s?file|whole project|end to end|debug|explain (why|how))/i;

/** How much of a reply is held back before it is trusted not to be a refusal. */
const HEDGE_CHARS = 320;

/** A short, apologetic reply is a refusal — the cue to escalate. */
const REFUSAL =
  /(I (?:can't|cannot|won't|am unable)|I'm (?:sorry|unable|not able)|as an AI|I must decline|cannot assist|can't help with)/i;

const looksLikeRefusal = (text) => {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length < 600 && REFUSAL.test(trimmed);
};

/**
 * Best model first: a pinned choice wins, otherwise a long or heavy prompt goes
 * to the routed model and everything else to the fast default.
 */
const pickModel = (body, requested) => {
  if (requested) return requested;
  const text = (body.messages || []).map((m) => m.text || m.content || '').join('\n');
  const files = Array.isArray(body.files) ? body.files : [];
  const heavy = text.length > 1200 || files.length > 12 || (text.length > 400 && HEAVY_TASK.test(text));
  return heavy && ROUTE_MODEL ? ROUTE_MODEL : DEFAULT_MODEL;
};

/**
 * One upstream turn, streamed to the reader — but the first HEDGE_CHARS are held
 * back, so a refusal can be re-run on the unrestricted model before anything is
 * shown, and the reader never has to unsee it. Past the hedge, deltas go out as
 * they arrive.
 */
const upstreamTurn = async ({ model, messages, res, hedge }) => {
  // A closed tab must not leave a model generating for minutes on a shared CPU.
  const abort = new AbortController();
  const stop = () => abort.abort();
  res.once('close', stop);

  let upstream;
  try {
    upstream = await fetch(`${OLLAMA}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: abort.signal,
    });
  } catch (err) {
    res.off('close', stop);
    return {
      ok: abort.signal.aborted,
      aborted: abort.signal.aborted,
      status: 0,
      text: '',
      emitted: 0,
      refusal: false,
      error: err?.message || String(err),
    };
  }
  if (!upstream.ok || !upstream.body) {
    res.off('close', stop);
    return { ok: false, status: upstream.status, text: '', emitted: 0, refusal: false };
  }

  let full = '';
  let pending = '';
  let emitted = 0;
  let decided = !hedge;

  const write = (text) => {
    if (!text) return;
    sse(res, { type: 'text', text });
    emitted += text.length;
  };

  const emit = (delta) => {
    full += delta;
    if (decided) {
      write(delta);
      return;
    }
    pending += delta;
    if (pending.length < HEDGE_CHARS) return;
    if (looksLikeRefusal(full)) return; // keep holding: the caller may escalate
    decided = true;
    write(pending);
    pending = '';
  };

  let buffer = '';
  const decoder = new TextDecoder();
  const take = (chunk) => {
    buffer += chunk;
    let cut;
    while ((cut = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (delta) emit(delta);
      } catch {
        /* partial JSON across a chunk boundary — the next chunk completes it */
      }
    }
  };

  try {
    const reader = upstream.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      take(decoder.decode(value, { stream: true }));
    }
    take(decoder.decode());
    if (buffer.trim().startsWith('data:')) {
      try {
        const delta = JSON.parse(buffer.trim().slice(5).trim())?.choices?.[0]?.delta?.content;
        if (delta) emit(delta);
      } catch {
        /* a truncated final line is not a delta */
      }
    }
  } catch (err) {
    res.off('close', stop);
    return {
      ok: abort.signal.aborted,
      aborted: abort.signal.aborted,
      text: full,
      emitted,
      refusal: false,
      error: err?.message || String(err),
    };
  }
  res.off('close', stop);

  if (!decided) {
    const refusal = looksLikeRefusal(full);
    if (!refusal) write(pending);
    return { ok: true, text: full, emitted, refusal };
  }
  return { ok: true, text: full, emitted, refusal: false };
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

  // `text` is what the app sends; `content` is what an OpenAI-style caller sends.
  const turns = (body.messages || []).map((m) => ({
    role: m.role || 'user',
    content: m.text || m.content || '',
  }));
  const lastUser = [...turns].reverse().find((m) => m.role === 'user');
  if (lastUser) lastUser.content = withMediaReminder(lastUser.content);

  const messages = [
    { role: 'system', content: systemPrompt(body, uploadNotes) },
    ...turns,
  ].filter((m) => m.content);

  const primary = pickModel(body, body.model || '');
  sse(res, { type: 'route', providerName: 'Ollama (this server)', modelLabel: primary });

  let answer = await upstreamTurn({ model: primary, messages, res, hedge: true });

  // A refusal or a failed turn is not an answer: give it to the local
  // unrestricted model, and its file blocks land in the project like any other.
  if ((!answer.ok || answer.refusal) && FALLBACK_MODEL && FALLBACK_MODEL !== primary) {
    sse(res, {
      type: 'route',
      providerName: 'Local fallback',
      modelLabel: FALLBACK_MODEL,
      escalated: true,
      reason: answer.ok ? 'refusal' : 'error',
    });
    answer = await upstreamTurn({ model: FALLBACK_MODEL, messages, res, hedge: false });
  }

  if (!answer.ok) {
    sse(res, {
      type: 'error',
      message: `Ollama answered ${answer.status || 0}. Is the model pulled? (ollama list)`,
    });
  } else {
    // Tell the app about file blocks inline, so its tool path saves them too.
    const files = [...answer.text.matchAll(/```file path=["']([^"']+)["']\n([\s\S]*?)```/g)].map((m) => ({
      path: m[1],
      content: m[2].replace(/\n$/, ''),
    }));
    if (files.length) sse(res, { type: 'files', files });
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

/**
 * Free the LLM's RAM before a generation job. Ollama keeps a model resident for
 * minutes after a turn, and on a CPU-only box a resident 5-6 GB model takes most
 * of the cores the media service is about to need. The next chat turn reloads.
 */
const unloadModels = async () => {
  const base = OLLAMA.replace(/\/v1\/?$/, '');
  try {
    const ps = await fetch(`${base}/api/ps`);
    if (!ps.ok) return;
    const body = await ps.json();
    await Promise.all(
      (body?.models || []).map((m) =>
        fetch(`${base}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: m.name, keep_alive: 0 }),
        }).catch(() => null),
      ),
    );
  } catch {
    /* the generation still works, just slower */
  }
};

/**
 * The media service is reached on the host loopback; its own paths are the
 * public ones, so this is a straight pass-through — JSON in, JSON or bytes out.
 */
const mediaProxy = async (pathname, req, res) => {
  if (req.method === 'POST' && pathname === '/api/media/jobs') {
    await Promise.race([unloadModels(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }

  const upstream = http.request(
    {
      hostname: MEDIA.hostname,
      port: MEDIA.port || 80,
      method: req.method,
      path: pathname + (req.url.includes('?') ? `?${req.url.split('?').slice(1).join('?')}` : ''),
      headers: { ...req.headers, host: MEDIA.hostname },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'The media service is not running on this server (docker ps | grep xecutr-media).',
      }),
    );
  });
  req.pipe(upstream);
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
  } else if (pathname.startsWith('/api/media/') || pathname.startsWith('/media/')) {
    mediaProxy(pathname, req, res);
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