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
 *   OLLAMA_MODEL     local default model            (default qwen2.5-coder:7b)
 *   OLLAMA_FALLBACK_MODEL local abliterated model used when a turn is refused
 *   GROQ_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, CEREBRAS_API_KEY,
 *   ZAI_API_KEY, OPENROUTER_API_KEY, LLM7_API_KEY, GITHUB_MODELS_TOKEN,
 *   ANTHROPIC_API_KEY  hosted providers (see providers.cjs); absent ones are
 *                   simply not offered, so the picker only lists usable models
 *   FRONTEND_ORIGIN  where the app build runs       (default http://127.0.0.1:8082)
 *   BASE44_BACKEND   where Base44's platform lives  (default https://base44.app)
 *   MEDIA_URL        where the media service listens (default http://127.0.0.1:8090)
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const providers = require('./providers.cjs');

const PORT = Number(process.env.PORT || '8080');
const OLLAMA = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
const FRONT = new URL(process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:8082');
const BACKEND = new URL(process.env.BASE44_BACKEND || 'https://base44.app');
const UPLOAD_DIR = '/tmp/xecutr-uploads';
const MEDIA = new URL(process.env.MEDIA_URL || 'http://127.0.0.1:8090');

/** Turns currently generating, by the id the app sent, so they can be paused. */
const ACTIVE = new Map();

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
  // The pinned task list is what must not be forgotten when the conversation is
  // trimmed; the model keeps it current with markers the app turns into records.
  if (body.tasks?.length) {
    parts.push(
      'The project has a pinned task list — the memory that survives when older ' +
        'messages are trimmed. It is context to work from, not a question: use it to ' +
        'stay on track and answer the user normally.\n' +
        'Only when the work itself adds a new step that must not be forgotten, add one ' +
        'line of exactly this shape: [[task: a short imperative step]] . Only when a ' +
        'listed task is genuinely finished, add one line: [[done: the exact task ' +
        'text]] . Never repeat a task that is already listed, and never add a marker ' +
        'because the user asked about the list.\n' +
        'Current tasks:\n' +
        body.tasks.map((t) => `- [${t.status}] ${t.title}${t.note ? ` (${t.note})` : ''}`).join('\n'),
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
 * One candidate's turn, streamed to the reader — the first HEDGE_CHARS are held
 * back so a refusal can be re-run on another model before anything is shown,
 * and the reader never has to unsee it. Past the hedge, deltas go out as they
 * arrive. Provider details live in providers.cjs.
 *
 * `signal` belongs to the whole turn, not to this candidate: the browser can
 * abort it (POST /api/chat/abort) and so can a closed reader, and either must
 * stop the model rather than let it generate into a dead stream.
 */
const runCandidate = async (route, { system, messages, res, hedge, signal }) => {
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

  try {
    for await (const delta of providers.streamText(route, { messages, system, signal })) {
      emit(delta);
    }
  } catch (err) {
    return {
      ok: signal?.aborted,
      aborted: Boolean(signal?.aborted),
      text: full,
      emitted,
      refusal: false,
      error: err?.message || String(err),
    };
  }

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
    text: m.text || m.content || '',
  }));
  const lastUser = [...turns].reverse().find((m) => m.role === 'user');
  if (lastUser) lastUser.text = withMediaReminder(lastUser.text);
  const conversation = turns.filter((m) => m.text);
  const system = systemPrompt(body, uploadNotes);

  // One controller for the whole turn: the browser may pause it, and a closed
  // reader must not leave a model generating for minutes on a shared CPU.
  const turnId = typeof body.turnId === 'string' ? body.turnId.slice(0, 64) : '';
  const abort = new AbortController();
  const stopTurn = () => abort.abort();
  res.once('close', stopTurn);
  if (turnId) ACTIVE.set(turnId, abort);

  // Only providers that can answer right now: their own keys on this server,
  // keys the caller supplied for this turn, and keyless gateways that reply.
  const catalogue = await providers.catalog(body.keys || {});
  const routes = providers.candidates({
    providerId: body.providerId,
    model: body.model,
    clientKeys: body.keys || {},
    catalogue,
  });

  if (!routes.length) {
    sse(res, {
      type: 'error',
      message:
        'No model is connected yet. Add a provider key in Connections, or pull a model on this server.',
    });
    res.end('data: [DONE]\n\n');
    return;
  }

  let answer = null;
  let previous = '';
  let reason = 'refusal';

  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    // The first candidate is the chosen one; anything after it is a fallback,
    // and the strip says which one failed and why.
    sse(res, {
      type: 'route',
      providerName: route.name,
      modelLabel: route.modelLabel,
      reason: index === 0 ? route.reason : reason,
      ...(index === 0 ? {} : { escalated: true, from: previous }),
    });

    answer = await runCandidate(route, {
      system,
      messages: conversation,
      res,
      hedge: index === 0,
      signal: abort.signal,
    });

    if (answer.aborted) break;
    if (answer.ok && !answer.refusal) break;

    // A refusal or a failed turn is not an answer: the next candidate takes it.
    reason = answer.ok ? 'refusal' : 'error';
    previous = route.modelLabel;
  }

  res.off('close', stopTurn);
  if (turnId && ACTIVE.get(turnId) === abort) ACTIVE.delete(turnId);

  if (answer?.aborted) {
    // The person paused the turn (or left): nothing to report, nothing to save.
    res.end('data: [DONE]\n\n');
    return;
  }

  if (!answer || !answer.ok) {
    sse(res, {
      type: 'error',
      message:
        answer?.error ||
        'No connected model could answer this turn. Check the provider keys in Connections.',
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

/**
 * Stop a turn the browser is no longer waiting for. The id is the one the app
 * sent with the turn; an unknown id is simply a no-op.
 */
const abortTurn = async (req, res) => {
  let turnId = '';
  try {
    turnId = JSON.parse((await readBody(req)).toString('utf8') || '{}').turnId || '';
  } catch {
    turnId = '';
  }

  const controller = ACTIVE.get(turnId);
  if (controller) controller.abort();
  if (turnId) ACTIVE.delete(turnId);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: Boolean(controller) }));
};

/**
 * The live catalogue: every provider that can answer right now, each with the
 * models its own API just reported. A provider without a key — or a keyless one
 * that does not reply — is left out, so the picker never offers a dead model.
 */
const providerCatalogue = async (req, res) => {
  let keys = {};
  if (req.method === 'POST') {
    try {
      keys = JSON.parse((await readBody(req)).toString('utf8') || '{}').keys || {};
    } catch {
      keys = {};
    }
  }

  const catalogue = await providers.catalog(keys);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(catalogue));
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
    providerCatalogue(req, res);
  } else if (pathname === '/api/uploads' && req.method === 'POST') {
    upload(req, res);
  } else if (pathname === '/api/chat/abort' && req.method === 'POST') {
    abortTurn(req, res);
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