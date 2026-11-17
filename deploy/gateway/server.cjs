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
 *   OPENAI_API_KEY, ANTHROPIC_API_KEY  hosted providers (see providers.cjs); absent ones are
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
const { createTelegram } = require('./telegram.cjs');
const projects = require('./projects.cjs');

const PORT = Number(process.env.PORT || '8080');
const OLLAMA = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
const FRONT = new URL(process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:8082');
const BACKEND = new URL(process.env.BASE44_BACKEND || 'https://base44.app');
const UPLOAD_DIR = '/tmp/xecutr-uploads';
const MEDIA = new URL(process.env.MEDIA_URL || 'http://127.0.0.1:8090');

/** Turns currently generating, by the id the app sent, so they can be paused. */
const ACTIVE = new Map();

/* --------------------------------------------------------------------------
 * Channels: Telegram and voice (Siri), without a browser in the middle.
 *
 * Both run a turn through the same provider chain as the web app. They skip
 * Base44 entirely, so they work even when the app's session is the thing that
 * is broken; the trade is that they do not write into a project's files.
 * ------------------------------------------------------------------------ */

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const TELEGRAM_CHATS = (process.env.TELEGRAM_ALLOWED_CHATS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const APP_URL = (process.env.APP_URL || 'https://xecutr.cloud').replace(/\/+$/, '');

const CHANNEL_SYSTEM =
  'You are Xecutr, a coding and building assistant answering over a chat app. ' +
  'Be brief and concrete: a few short paragraphs at most, plain text, no tables. ' +
  'If a task needs code, show only the essential lines. The person cannot see the ' +
  'web app from here, so never claim to have opened or changed a file unless the ' +
  'conversation shows it.';

/** One complete answer, through the chain, for a channel that has no stream. */
const bridgeTurn = async ({ messages, hasImages }) =>
  providers.completeTurn({
    messages,
    system: CHANNEL_SYSTEM,
    hasImages,
    clientKeys: {},
  });

const telegram = createTelegram({
  token: TELEGRAM_TOKEN,
  allowedChats: TELEGRAM_CHATS,
  runTurn: bridgeTurn,
  log: (line) => console.log(line),
});

/** Telegram delivers an update here; answer 200 fast, then work. */
const telegramWebhook = async (pathname, req, res) => {
  const secret = pathname.split('/').pop();
  if (!TELEGRAM_TOKEN || !TELEGRAM_SECRET) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Telegram is not configured on this gateway.' }));
    return;
  }
  if (secret !== TELEGRAM_SECRET) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }

  const raw = await readBody(req);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));

  try {
    telegram.handleUpdate(JSON.parse(raw.toString('utf8') || '{}'));
  } catch {
    /* a malformed update is not worth a second request from Telegram */
  }
};

/**
 * Is Telegram (and the Siri voice endpoint beside it) set up, and what is the
 * bot called? The app's profile page turns this into "open Telegram" and "open
 * in Siri" buttons, so the bot's own name has to come from Telegram, not from a
 * guess in the UI.
 */
const telegramStatus = async (res) => {
  const me = await telegram.whoAmI().catch(() => null);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      ok: true,
      configured: Boolean(TELEGRAM_TOKEN && TELEGRAM_SECRET),
      chats: TELEGRAM_CHATS.length,
      app: APP_URL,
      bot: me?.username || '',
      link: me?.link || '',
    }),
  );
};

/** Siri Shortcuts (or anything else) speaks a line and hears the answer. */
const voiceTurn = async (pathname, req, res) => {
  const secret = pathname.split('/').pop();
  if (!TELEGRAM_SECRET || secret !== TELEGRAM_SECRET) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Bad or missing secret.' }));
    return;
  }

  let text = '';
  try {
    text = String(JSON.parse((await readBody(req)).toString('utf8') || '{}').text || '').slice(0, 8000);
  } catch {
    text = '';
  }
  if (!text.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Send {"text": "..."}.' }));
    return;
  }

  try {
    const answer = await bridgeTurn({ messages: [{ role: 'user', text }], hasImages: false });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        reply: answer.text,
        provider: answer.providerName,
        model: answer.modelLabel,
      }),
    );
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, reply: `The harness could not answer: ${err?.message || err}` }));
  }
};

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
  // The file protocol is explained on every project turn, not only when the
  // project already has files: a new project starts empty, and a model that is
  // never told the format answers in prose — the project would stay empty
  // forever, which is exactly what happened to the first two projects.
  parts.push(
    'The project is a set of real files. When the user asks you to build, create, download, ' +
      'port or change anything, reply with each file COMPLETE, in its own fenced block whose ' +
      'header is exactly `file path="the/path"` — the app saves it as that file. For example:\n' +
      '```file path="index.html"\n<!doctype html>\n<html><body><h1>Hello</h1></body></html>\n```\n' +
      'One block per file, each one the whole file (never a diff, never "the rest of the file"), ' +
      'with paths relative to the project root. Put short prose before the blocks, never inside ' +
      'them, and do not describe the files you are about to write — write them. If the turn is ' +
      'only a question, answer it and write no blocks. ' +
      'On this server each project also has a private workspace: any file whose path starts with ' +
      '`work/` (for example `work/notes.md`, `work/drafts/home.html`, `work/images/idea.png`) is ' +
      'saved there instead of into the site. Use it for drafts, notes, data you are still working ' +
      'on and anything that should not be published; it is never served and never part of the ' +
      'site. Everything outside `work/` is the real project.',
  );
  // The project's whole file list, so the model knows what exists even though
  // only the files this turn is about travel in full.
  if (body.fileIndex?.length) {
    const names = body.fileIndex
      .slice(0, 300)
      .map((file) => `${file.path}${file.size ? ` (${file.size}b)` : ''}`)
      .join('\n');
    parts.push(
      `The project has ${body.fileIndex.length} files. The ones that matter for this turn are ` +
        `included below in full; a file you name in a reply is included from the next turn on. ` +
        `The rest:\n${names}`,
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
        'The files for this turn, complete. Change one by replying with the complete new ' +
          'version in a block of the same shape:\n' +
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
  if (body.images?.length) {
    parts.push(
      `${body.images.length} image${body.images.length > 1 ? 's are' : ' is'} attached to the last message. ` +
        'Look at them and answer about what is actually in the picture; never claim to have seen ' +
        'an image you were not given.',
    );
  }
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

/** A word that asks for work on the project's files, not for an answer. */
const BUILD_INTENT =
  /\b(build|create|make|write|implement|scaffold|generate|add|fix|refactor|rewrite|change|update|design|code|develop|port|download|clone|import|recreate|replicate)\b/i;

/** Words that mean the work is about the project itself, not just a picture. */
const PROJECT_WORD =
  /\b(page|pages|app|site|website|file|files|code|project|html|css|js|ts|jsx|tsx|react|component|components|api|backend|frontend|repo|repository|website|screen|screens)\b/i;

/**
 * Small models answer "I will build that for you" and stop. The file rule lives
 * far away in a long system prompt, so it is repeated next to the question that
 * asked for work, and it names the mistake explicitly — the same trick that made
 * the media markers reliable on the 7B.
 */
const FILE_REMINDER =
  '\n\n[FILE TOOL] This turn asks for work in the project. Write the files: each one complete, ' +
  'in its own fenced block with the header exactly `file path="path/from/project/root"`. ' +
  'Never a diff, never an excerpt, never "I will create…" — prose first, then the blocks.';

const withFileReminder = (text) => {
  if (text.includes('[MODE: PLAN ONLY]') || !BUILD_INTENT.test(text)) return text;
  // "make me a logo" is a media request, not a file request.
  if (MEDIA_INTENT.test(text) && !PROJECT_WORD.test(text)) return text;
  return `${text}${FILE_REMINDER}`;
};

/** Words that mean the turn is worth a stronger model than the fast default. */
const HEAVY_TASK =
  /(architect|design|refactor|review|audit|security|optimi[sz]e|migrat|multi-?\s?file|whole project|end to end|debug|explain (why|how))/i;
/** How much of a hosted reply is held back before it is trusted not to be a refusal. */
const HEDGE_CHARS = 900;
/**
 * This server's models need a much smaller hold: a local refusal opens with the
 * decline ("I'm sorry, but I can't assist with that."), and holding a long reply
 * back on a CPU-only box would stall the first token for a minute or more.
 */
const LOCAL_HEDGE_CHARS = 160;

/** Refusal detection lives with the providers, so every channel agrees on it. */
const looksLikeRefusal = (text) => providers.looksLikeRefusal(text);

/**
 * One candidate's turn, streamed to the reader — `hedge` characters are held
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
  let decided = !(hedge > 0);

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
    if (pending.length < hedge) return;
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

  // Late refusal: the text passed the hedge before the decline appeared. If
  // nothing reached the reader yet we can still escalate cleanly; if some text
  // is already out, the callers treat it as an answer rather than a duplicate.
  const refusedLate = looksLikeRefusal(full);
  return { ok: true, text: full, emitted, refusal: emitted === 0 && refusedLate };
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
  // Pasted images ride with the last user turn as data URLs.
  const lastUser = [...turns].reverse().find((m) => m.role === 'user');
  const images = (Array.isArray(body.images) ? body.images : [])
    .filter((value) => typeof value === 'string' && value.startsWith('data:image/'))
    .slice(0, 3);
  if (images.length && lastUser) lastUser.images = images;

  // The file rule rides with the turn that asks for work, so a small model does
  // not answer a build request with a description of the build. It goes first:
  // a media marker, when there is one, stays the last line the model reads.
  if (lastUser) lastUser.text = withFileReminder(lastUser.text);
  // The media reminder is for "make me an image"; someone who pasted one is
  // asking about that picture, not ordering a new one.
  if (lastUser && !images.length) lastUser.text = withMediaReminder(lastUser.text);

  const conversation = turns.filter((m) => m.text || m.images?.length);
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
  // The local models are the safety net, so their list is refreshed first: a
  // trouble-prone discovery should never be the reason a refusal has nowhere
  // to go.
  await providers.ensureLocal().catch(() => []);
  const catalogue = await providers.catalog(body.keys || {});
  const routes = providers.candidates({
    providerId: body.providerId,
    model: body.model,
    clientKeys: body.keys || {},
    catalogue,
    hasImages: images.length > 0,
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

  /**
   * This server's models get a window sized to the context they actually run
   * with (OLLAMA_NUM_CTX, 16k by default), minus room for the answer. Hosted
   * providers still get everything the app sent.
   */
  const LOCAL_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 16384;
  const LOCAL_NUM_PREDICT = 4096;
  const LOCAL_PROMPT_CHARS = Math.max(8000, Math.floor((LOCAL_NUM_CTX - LOCAL_NUM_PREDICT) * 2.5));
  const LOCAL_SYSTEM_CHARS = Math.floor(LOCAL_PROMPT_CHARS * 0.6);
  const LOCAL_CONTEXT_CHARS = LOCAL_PROMPT_CHARS - LOCAL_SYSTEM_CHARS;

  const tailFor = (route) => {
    if (route.id !== 'ollama') return conversation;
    const out = [];
    let used = 0;
    for (let i = conversation.length - 1; i >= 0; i -= 1) {
      const message = conversation[i];
      const size = (message.text || '').length + 8;
      if (out.length && used + size > LOCAL_CONTEXT_CHARS) break;
      out.unshift(message);
      used += size;
    }
    return out;
  };

  const systemFor = (route) =>
    route.id === 'ollama' ? system.slice(0, LOCAL_SYSTEM_CHARS) : system;

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
      system: systemFor(route),
      messages: tailFor(route),
      res,
      // Every candidate holds its opening back, so a decline never reaches the
      // reader; this server's models need only a short hold.
      hedge: route.id === 'ollama' ? LOCAL_HEDGE_CHARS : HEDGE_CHARS,
      signal: abort.signal,
    });

    if (answer.aborted) break;
    // An empty answer is not an answer: let the next candidate try.
    if (answer.ok && !answer.refusal && answer.text.trim()) break;

    // A refusal or a failed turn is not an answer: the next candidate takes it.
    reason = answer.refusal ? 'refusal' : 'error';
    previous = route.modelLabel;

    // A refusal is the abliterated model's job. It goes to the front of what is
    // left, ahead of the fast local model that would decline the same way and
    // of any provider likely to decline too, so a refused turn lands on the
    // model that will actually do the work.
    if (answer.refusal) {
      routes.splice(index + 1, routes.length, ...providers.escalateForRefusal(routes.slice(index + 1)));
    }
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
  } else if (answer.refusal) {
    // Every model in the chain declined, and none of the text reached the
    // reader: say so plainly rather than leave an empty answer behind.
    sse(res, {
      type: 'error',
      message:
        'Every connected model declined this turn. Add a provider key in Connections, or pull a model on this server.',
    });
  } else {
    // Tell the app about file blocks inline, so its tool path saves them too.
    const files = [...answer.text.matchAll(/```file path=["']([^"']+)["']\n([\s\S]*?)```/g)].map((m) => ({
      path: m[1],
      content: m[2].replace(/\n$/, ''),
    }));
    if (files.length) sse(res, { type: 'files', files });

    // The files belong on this server too: the disk that produced them keeps a
    // real copy, and a published project can be served from a subdomain.
    try {
      projects.mirror({
        projectId: typeof body.projectId === 'string' ? body.projectId : '',
        projectName: typeof body.projectName === 'string' ? body.projectName : '',
        files,
      });
    } catch (err) {
      console.log(`[gateway] project mirror failed: ${err?.message || err}`);
    }
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

const APEX = (process.env.APP_DOMAIN || 'xecutr.cloud').replace(/^www\./, '');

/**
 * First path segments the app owns. A published project is served at
 * `/<slug>`, so its name must never be one of these — the app itself keeps
 * them, and anything else falls through to the app when no project matches.
 */
const RESERVED_PATHS = new Set([
  'projects',
  'tasks',
  'agent',
  'connections',
  'help',
  'profile',
  'admin',
  'api',
  'media',
  'assets',
  'login',
  'register',
  'mfa',
  'oauth',
  'forgot-password',
  'reset-password',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'link_preview.png',
  'llms.txt',
  '.well-known',
]);

/** `<slug>.xecutr.cloud` -> `<slug>`; the apex and www are the app itself. */
const projectHost = (host) => {
  const clean = String(host || '').split(':')[0].toLowerCase();
  if (!clean.endsWith(`.${APEX}`) || clean === `www.${APEX}`) return '';
  const label = clean.slice(0, -(APEX.length + 1));
  return label && !label.includes('.') ? label : '';
};

/**
 * The files in one project's private workspace on this server. Same rule as the
 * write endpoint: only this machine may ask.
 */
const projectWork = async (req, res) => {
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
  if (forwarded) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not from this server.' }));
    return;
  }

  const projectId = new URL(req.url, 'http://localhost').searchParams.get('projectId') || '';
  const files = projects.listWork(projectId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, found: files !== null, files: files || [] }));
};

/**
 * The app pushes a project's whole file set here when the person publishes it.
 * Only this host may call it: a request that came through Caddy carries
 * X-Forwarded-For, and a direct one from the app on the same machine does not.
 */
const projectFiles = async (req, res) => {
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
  const token = process.env.XECUTR_PROJECT_TOKEN || '';
  if (forwarded) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not from this server.' }));
    return;
  }
  if (token && req.headers['x-xecutr-token'] !== token) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Bad project token.' }));
    return;
  }

  let body;
  try {
    body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Bad body.' }));
    return;
  }

  if (!body.projectId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'A project id is required.' }));
    return;
  }

  try {
    const result = projects.mirror({
      projectId: String(body.projectId),
      projectName: String(body.projectName || ''),
      files: Array.isArray(body.files) ? body.files : [],
      published: Boolean(body.publish),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        slug: result.slug,
        files: result.files,
        url: `https://${APEX}/${result.slug}`,
        subdomain: `https://${result.slug}.${APEX}`,
      }),
    );
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
  }
};

const server = http.createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  // A project's own subdomain serves its published files, straight from disk.
  const sub = projectHost(req.headers.host);
  if (sub && !pathname.startsWith('/api/') && !pathname.startsWith('/media/')) {
    if (!projects.serve(sub, req, res, pathname)) projects.listing(res);
    return;
  }

  // The same files are also served at /<slug> on the app's own domain, which
  // needs no wildcard DNS: any path the app does not own is offered to a
  // published project with that name first, and falls through to the app.
  if (!sub && req.method === 'GET') {
    const segments = pathname.split('/').filter(Boolean);
    const label = segments[0] || '';
    if (label && !RESERVED_PATHS.has(label.toLowerCase())) {
      const rest = `/${segments.slice(1).join('/')}`;
      if (projects.serve(label, req, res, rest)) return;
    }
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: 'xecutr', time: new Date().toISOString() }));
  } else if (pathname === '/api/project-files' && req.method === 'POST') {
    projectFiles(req, res);
  } else if (pathname === '/api/project-work' && req.method === 'GET') {
    projectWork(req, res);
  } else if (pathname === '/api/providers' && (req.method === 'GET' || req.method === 'POST')) {
    providerCatalogue(req, res);
  } else if (pathname === '/api/uploads' && req.method === 'POST') {
    upload(req, res);
  } else if (pathname === '/api/chat/abort' && req.method === 'POST') {
    abortTurn(req, res);
  } else if (pathname === '/api/telegram' && req.method === 'GET') {
    telegramStatus(res);
  } else if (pathname.startsWith('/api/telegram/') && req.method === 'POST') {
    telegramWebhook(pathname, req, res);
  } else if (pathname.startsWith('/api/voice/') && req.method === 'POST') {
    voiceTurn(pathname, req, res);
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