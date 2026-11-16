'use strict';

/**
 * The provider layer, ported from the original Xecutr app
 * (github.com/NorthernGrower/xecutr, `providers/`) into this gateway.
 *
 * What it keeps from that work:
 *   - the same provider set and endpoints (Google, Groq, Cerebras, Mistral,
 *     Z.ai, OpenRouter, LLM7.io, GitHub Models, OVHcloud keyless, Anthropic
 *     paid, and Ollama on this host);
 *   - model discovery from each provider's own /models endpoint, cached for
 *     ten minutes — the gateway never promises a model id it has not seen;
 *   - the chat-model filter, so a TTS or embedding model in a provider's
 *     catalog is never offered as a coding model;
 *   - three streaming adapters: OpenAI-compatible, Gemini, and Anthropic.
 *
 * What is different here:
 *   - only providers that can actually answer are listed. A provider with no
 *     key (or a keyless one that does not answer) is left out entirely, so the
 *     picker shows only models that work right now;
 *   - routing scores the discovered models and tries the strongest first, as
 *     the owner asked, instead of a fixed provider order.
 *
 * Keys come from the server's environment or from the caller's own browser
 * (per request only). Neither is ever logged or stored.
 */

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 120000;
const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,80}$/;

const OLLAMA = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');

const readEnv = (name) => {
  if (!name) return '';
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
};

const PROVIDERS = [
  {
    id: 'ollama',
    name: 'Ollama (this server)',
    subtitle: 'Local models · free and unlimited',
    apiBaseUrl: OLLAMA,
    environmentVariable: 'OLLAMA_BASE_URL',
    signupUrl: 'https://ollama.com',
    freeTier: true,
    keyless: true,
    local: true,
    defaultModel: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
    note: 'Runs the models pulled on this server. Private, free, and the fallback when a hosted model refuses a turn.',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    subtitle: 'ChatGPT models · your own key',
    apiBaseUrl: 'https://api.openai.com/v1',
    environmentVariable: 'OPENAI_API_KEY',
    signupUrl: 'https://platform.openai.com/api-keys',
    freeTier: false,
    defaultModel: 'gpt-4o-mini',
    note: 'Billed per token to your OpenAI account. Listed here only when a key is set.',
  },
  {
    id: 'groq',
    name: 'Groq',
    subtitle: 'Open models · free tier',
    apiBaseUrl: 'https://api.groq.com/openai/v1',
    environmentVariable: 'GROQ_API_KEY',
    signupUrl: 'https://console.groq.com/keys',
    freeTier: true,
    defaultModel: 'openai/gpt-oss-120b',
    note: 'Fast free tier with per-minute and daily limits.',
  },
  {
    id: 'google',
    name: 'Google AI',
    subtitle: 'Gemini API · free tier',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    environmentVariable: 'GEMINI_API_KEY',
    alternateEnvironmentVariables: ['GOOGLE_API_KEY'],
    signupUrl: 'https://aistudio.google.com/apikey',
    freeTier: true,
    defaultModel: 'gemini-2.5-flash',
    note: 'Gemini free tier with per-minute and per-day limits.',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    subtitle: 'Mistral & Codestral · free mode',
    apiBaseUrl: 'https://api.mistral.ai/v1',
    environmentVariable: 'MISTRAL_API_KEY',
    signupUrl: 'https://console.mistral.ai/api-keys',
    freeTier: true,
    defaultModel: 'mistral-small-latest',
    note: 'Free mode covers the catalog, including Codestral, at about one request per second.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    subtitle: 'Open models · free tier',
    apiBaseUrl: 'https://api.cerebras.ai/v1',
    environmentVariable: 'CEREBRAS_API_KEY',
    signupUrl: 'https://cloud.cerebras.ai',
    freeTier: true,
    defaultModel: 'gpt-oss-120b',
    note: 'Rate-limited free tier.',
  },
  {
    id: 'zai',
    name: 'Z.ai (Zhipu)',
    subtitle: 'GLM models · free',
    apiBaseUrl: 'https://api.z.ai/api/paas/v4',
    environmentVariable: 'ZAI_API_KEY',
    alternateEnvironmentVariables: ['ZHIPU_API_KEY'],
    signupUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    freeTier: true,
    defaultModel: 'glm-4.7-flash',
    note: 'GLM Flash models are free; one concurrent request, so replies queue.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    subtitle: 'Many models · free variants',
    apiBaseUrl: 'https://openrouter.ai/api/v1',
    environmentVariable: 'OPENROUTER_API_KEY',
    signupUrl: 'https://openrouter.ai/keys',
    freeTier: true,
    defaultModel: '',
    note: 'Free variants only, listed live from OpenRouter’s public catalog.',
  },
  {
    id: 'llm7',
    name: 'LLM7.io',
    subtitle: 'Open gateway · free token',
    apiBaseUrl: 'https://api.llm7.io/v1',
    environmentVariable: 'LLM7_API_KEY',
    signupUrl: 'https://token.llm7.io',
    freeTier: true,
    defaultModel: 'gpt-oss:20b',
    note: 'Needs a free token; 60 requests/minute.',
  },
  {
    id: 'github',
    name: 'GitHub Models',
    subtitle: 'GitHub account · free tier',
    apiBaseUrl: 'https://models.github.ai/inference',
    environmentVariable: 'GITHUB_MODELS_TOKEN',
    signupUrl: 'https://github.com/settings/personal-access-tokens/new',
    freeTier: true,
    defaultModel: 'openai/gpt-4.1-mini',
    note: 'Free experimentation tier; a fine-grained token with Models: read.',
  },
  {
    id: 'ovh',
    name: 'OVHcloud AI',
    subtitle: 'Open models · no key, no signup',
    apiBaseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    environmentVariable: '',
    signupUrl: '',
    freeTier: true,
    keyless: true,
    defaultModel: 'gpt-oss-120b',
    note: 'Keyless open-weight models in the EU; 2 requests/minute per model.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    subtitle: 'Claude · paid API key',
    apiBaseUrl: 'https://api.anthropic.com',
    environmentVariable: 'ANTHROPIC_API_KEY',
    signupUrl: 'https://console.anthropic.com/settings/keys',
    freeTier: false,
    paid: true,
    defaultModel: 'claude-sonnet-4-5',
    note: 'No free API tier; needs Anthropic billing.',
  },
];

const byId = (id) => PROVIDERS.find((p) => p.id === id) || null;

const apiKeyFor = (provider, clientKeys) => {
  if (!provider) return '';
  const supplied = clientKeys && typeof clientKeys === 'object' ? clientKeys[provider.id] : '';
  if (typeof supplied === 'string' && supplied.trim()) return supplied.trim();
  const names = [provider.environmentVariable, ...(provider.alternateEnvironmentVariables || [])];
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return '';
};

/* ------------------------------------------------------------ model lists */

const NON_CHAT_TERMS = [
  'tts', 'stt', 'asr', 'whisper', 'embed', 'rerank', 'speech', 'voice', 'audio',
  'moderation', 'guard', 'bge', 'image', 'img', 'flux', 'diffusion', 'sdxl',
  'video', 'clip', 'ocr', 'lyria', 'musicgen', 'suno', 'dall', 'sora', 'veo',
  'kling', 'stable-diffusion', 'realtime', 'davinci', 'babbage', 'instruct',
];

const looksLikeChatModel = (id) => {
  const value = String(id || '').toLowerCase().replace(/[-_./:]/g, ' ');
  if (!value.trim()) return false;
  return !NON_CHAT_TERMS.some((term) => value.includes(term));
};

const listed = (payload, note) => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];

  return list
    .map((model) => {
      const id = typeof model?.id === 'string' ? model.id : model?.name;
      if (typeof id !== 'string' || !id) return null;
      // The provider's own id is the honest label — a prettifier turns
      // "gpt-oss-120b" into "Gpt Oss 120b", which reads worse than the id.
      const label = typeof model?.name === 'string' && model.name ? model.name : id;
      return { id, label, note };
    })
    .filter(Boolean)
    .filter((entry) => looksLikeChatModel(entry.id));
};

const withTimeout = (signal, ms) => {
  const timeout = AbortSignal.timeout(ms);
  return signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal || timeout;
};

const modelsRequest = (provider, apiKey) => {
  const base = provider.apiBaseUrl;
  switch (provider.id) {
    case 'groq':
    case 'cerebras':
      return {
        url: `${base}/models`,
        headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
        extract: (payload) =>
          (Array.isArray(payload?.data) ? payload.data : [])
            .filter((model) => typeof model?.id === 'string')
            .map((model) => ({ id: model.id, label: model.id, note: 'your account' })),
      };
    case 'google':
      return {
        url: `${base}/models?pageSize=200`,
        headers: { accept: 'application/json', 'x-goog-api-key': apiKey },
        extract: (payload) =>
          (Array.isArray(payload?.models) ? payload.models : [])
            .filter((model) => typeof model?.name === 'string')
            .filter((model) =>
              Array.isArray(model.supportedGenerationMethods)
                ? model.supportedGenerationMethods.includes('generateContent')
                : true,
            )
            .map((model) => ({
              id: model.name.replace(/^models\//, ''),
              label: model.displayName || model.name.replace(/^models\//, ''),
              note: 'your account',
            })),
      };
    case 'anthropic':
      return {
        url: `${base}/v1/models?limit=100`,
        headers: {
          accept: 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        extract: (payload) =>
          (Array.isArray(payload?.data) ? payload.data : [])
            .filter((model) => typeof model?.id === 'string')
            .map((model) => ({ id: model.id, label: model.display_name || model.id, note: 'paid' })),
      };
    case 'github':
      return {
        url: 'https://models.github.ai/catalog/models',
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${apiKey}` },
        extract: (payload) => listed(payload, 'your account'),
      };
    case 'openrouter':
      // Free variants only: the public catalog needs no key, and a non-zero
      // price means this turn would cost money.
      return {
        url: 'https://openrouter.ai/api/v1/models',
        headers: { accept: 'application/json' },
        extract: (payload) =>
          (Array.isArray(payload?.data) ? payload.data : [])
            .filter((model) => typeof model?.id === 'string' && !model.id.includes(':batch'))
            .filter((model) => {
              const pricing = model.pricing || {};
              return Number(pricing.prompt) === 0 && Number(pricing.completion) === 0;
            })
            .filter((model) => looksLikeChatModel(model.id))
            .map((model) => ({ id: model.id, label: model.name || model.id, note: 'free variant' })),
      };
    case 'ollama':
      return {
        url: `${base}/models`,
        headers: { accept: 'application/json' },
        extract: (payload) =>
          (Array.isArray(payload?.data) ? payload.data : [])
            .filter((model) => typeof model?.id === 'string')
            .map((model) => ({ id: model.id, label: model.id, note: 'this server' })),
      };
    case 'openai':
      return {
        url: `${base}/models`,
        headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
        extract: (payload) => listed(payload, 'your account'),
      };
    case 'mistral':
    case 'llm7':
    case 'ovh':
    case 'zai':
      return {
        url: `${base}/models`,
        headers: apiKey
          ? { accept: 'application/json', authorization: `Bearer ${apiKey}` }
          : { accept: 'application/json' },
        extract: (payload) => listed(payload, 'free tier'),
      };
    default:
      return null;
  }
};

const catalogs = new Map();

const fresh = (entry) => Boolean(entry) && Date.now() - entry.at < DISCOVERY_TTL_MS;

async function discover(provider, apiKey) {
  const request = modelsRequest(provider, apiKey);
  if (!request) return [];

  try {
    const response = await fetch(request.url, {
      headers: request.headers,
      signal: withTimeout(null, DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const models = request.extract(await response.json());
    if (!models.length) throw new Error('no models listed');
    catalogs.set(provider.id, { models, at: Date.now() });
    return models;
  } catch {
    const cached = catalogs.get(provider.id);
    return cached ? cached.models : [];
  }
}

async function modelsFor(provider, apiKey) {
  const cached = catalogs.get(provider.id);
  if (fresh(cached)) return cached.models;
  return discover(provider, apiKey);
}

/* --------------------------------------------------------------- scoring */

const STRONG = /(120b|70b|72b|67b|405b|397b|deepseek|claude|gpt-oss-120b|gemini-2\.5-pro|glm-4\.7|qwen3.*(27b|30b|32b))/i;
const CODER = /(coder|code|codestral|devstral|sonnet)/i;
const FAST = /(nano|mini|flash|8b|7b|3b|1\.7b|lite)/i;

/** Higher is better. Used only to order what each provider actually offers. */
const scoreModel = (id) => {
  let score = 50;
  if (STRONG.test(id)) score += 30;
  if (CODER.test(id)) score += 10;
  if (FAST.test(id)) score -= 10;
  if (/:free$/.test(id)) score -= 3;
  return score;
};

const bestModel = (models) =>
  [...models].sort((a, b) => scoreModel(b.id) - scoreModel(a.id))[0] || null;

/**
 * How quickly each provider tends to answer; lower is tried first. It is a
 * preference, not a measurement: keyed accounts are usually faster than the
 * shared keyless tiers, which sit at the bottom of the list.
 */
const SPEED = {
  anthropic: 0,
  openai: 1,
  groq: 2,
  cerebras: 3,
  google: 4,
  mistral: 5,
  openrouter: 6,
  zai: 7,
  github: 8,
  llm7: 9,
  ovh: 10,
};

/**
 * Models that can actually look at a picture. When someone pastes an image the
 * harness prefers one of these, because a text-only model would answer about a
 * picture it never received.
 */
const VISION_MODEL = /(vl|vision|llava|omni|qwen3\.5|qwen2\.5-vl|gemma3|gpt-4|gpt-5|^o[13])/i;

const visionModel = (models) => models.find((model) => VISION_MODEL.test(model.id)) || null;

const chooseModel = (provider, hasImages) => {
  if (hasImages) {
    const vision = visionModel(provider.models);
    if (vision) return vision;
  }
  return bestModel(provider.models);
};

/* --------------------------------------------------------------- catalog */

/**
 * When a provider answers "rate-limited" or "no credit" it has no tokens left
 * for now. Remember that for a while and move it down the list: the harness
 * walks to whichever provider still has room.
 */
const COOLDOWN_MS = 10 * 60 * 1000;
const cooldowns = new Map();

const coolingFor = (providerId) => {
  const until = cooldowns.get(providerId) || 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
};

const noteStatus = (providerId, status) => {
  if (status === 429 || status === 402) cooldowns.set(providerId, Date.now() + COOLDOWN_MS);
};

/**
 * Only providers that can answer now, each with the models it actually lists.
 * A provider with no key, or a keyless one that never answered, is not shown.
 * The order is the routing order: fastest hosted first, a cooling provider
 * further down, this server's models last.
 */
async function catalog(clientKeys) {
  const entries = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const apiKey = apiKeyFor(provider, clientKeys);
      if (!apiKey && !provider.keyless) return null;

      const models = (await modelsFor(provider, apiKey)).slice().sort(
        (a, b) => scoreModel(b.id) - scoreModel(a.id) || a.label.localeCompare(b.label),
      );
      if (!models.length) return null;

      const top = models[0];
      return {
        id: provider.id,
        name: provider.name,
        subtitle: provider.subtitle,
        status: 'ready',
        freeTier: Boolean(provider.freeTier),
        paid: Boolean(provider.paid),
        keyless: Boolean(provider.keyless),
        keyed: Boolean(apiKey),
        local: Boolean(provider.local),
        cooling: coolingFor(provider.id),
        note: provider.note || '',
        signupUrl: provider.signupUrl || '',
        environmentVariable: provider.environmentVariable || '',
        defaultModel: top.id,
        defaultModelLabel: top.label,
        models,
      };
    }),
  );

  const providers = entries.filter(Boolean).sort((a, b) => {
    if (Boolean(a.local) !== Boolean(b.local)) return a.local ? 1 : -1;
    if (Boolean(a.cooling) !== Boolean(b.cooling)) return a.cooling ? 1 : -1;
    const speed = (SPEED[a.id] ?? 50) - (SPEED[b.id] ?? 50);
    if (speed !== 0) return speed;
    return scoreModel(b.models[0]?.id || '') - scoreModel(a.models[0]?.id || '');
  });

  return { providers, readyCount: providers.length };
}

/* --------------------------------------------------------------- routing */

/**
 * The routes to try for one turn, strongest first.
 *
 * Order, and why:
 *   1. the fastest hosted provider the deployment can reach — a connected
 *      provider's own account first, then a keyless shared gateway — walking
 *      down by how quickly each one answers;
 *   2. this server's own models, last: the fast one, then the abliterated one.
 *
 * The local models are the last resort on purpose. A refusal or an error from a
 * hosted provider falls through the chain and lands on the local server, which
 * is what keeps unrestricted work possible; `reason` is what the reply's
 * routing strip shows, so it has to be true.
 */
function candidates({ providerId, model, clientKeys, catalogue, hasImages = false }) {
  const listed_ = catalogue?.providers || [];
  const pinned = typeof providerId === 'string' ? providerId.trim() : '';

  const route = (provider, chosen, reason) => ({
    id: provider.id,
    name: provider.name,
    key: apiKeyFor(byId(provider.id), clientKeys),
    model: chosen.id,
    modelLabel: chosen.label,
    reason,
    escalated: false,
  });

  if (pinned) {
    const provider = listed_.find((p) => p.id === pinned);
    if (provider) {
      const requested = typeof model === 'string' ? provider.models.find((m) => m.id === model) : null;
      const chosen = requested || chooseModel(provider, hasImages);
      // A text-only pin cannot see a pasted image; swap to a vision model the
      // same provider offers and say why in the strip.
      const blind = hasImages && !VISION_MODEL.test(chosen.id);
      const vision = blind ? visionModel(provider.models) : null;
      const picked = vision || chosen;
      return [
        route(provider, picked, blind && vision ? 'vision for the image' : 'pinned by you'),
        ...localChain(hasImages, picked.id),
      ];
    }
  }

  const hosted = listed_
    .filter((p) => !p.local && !p.paid)
    .sort((a, b) => (SPEED[a.id] ?? 50) - (SPEED[b.id] ?? 50));

  // Providers with no tokens left right now go last; one that still has room
  // answers instead.
  const ready = hosted.filter((p) => !p.cooling);
  const cooling = hosted.filter((p) => p.cooling);
  const ordered = [...ready, ...cooling];

  const routes = ordered
    .slice(0, 3)
    .map((provider, index) =>
      route(provider, chooseModel(provider, hasImages), index === 0 ? 'fastest available' : 'next fastest'),
    );

  return [...routes, ...localChain(hasImages, routes[routes.length - 1]?.model)];
}

/**
 * This server's models, last in the chain: the fast one first, then the
 * abliterated one. `afterModel` is the model that just failed or refused, so a
 * refusal from a hosted provider really does land here.
 */
function localChain(hasImages, afterModel) {
  const local = catalogs.get('ollama');
  const models = local?.models || [];
  if (!models.length) return [];

  const fastId = process.env.OLLAMA_MODEL || '';
  const fallbackId = process.env.OLLAMA_FALLBACK_MODEL || '';
  const vision = hasImages ? visionModel(models) : null;

  const fast =
    (hasImages ? vision : models.find((m) => m.id === fastId)) ||
    (hasImages ? models.find((m) => m.id === fastId) : null) ||
    bestModel(models);

  const fallback = models.find((m) => m.id === fallbackId) || (hasImages ? vision : null);

  const picks = [fast, fallback].filter((model, index, all) => model && all.indexOf(model) === index);
  const escalated = Boolean(afterModel);

  return picks
    .filter((model) => model.id !== afterModel)
    .map((model, index) => ({
      id: 'ollama',
      name: index === 0 && !escalated ? 'Ollama (this server)' : 'Local fallback',
      key: '',
      model: model.id,
      modelLabel: model.label,
      reason: index === 0 && !escalated ? 'local model' : 'local fallback',
      escalated,
    }));
}

/* -------------------------------------------------------------- streaming */

const sseData = (line) => {
  if (!line.startsWith('data:')) return null;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

async function* sseLines(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, cut).replace(/\r$/, '');
        buffer = buffer.slice(cut + 1);
        if (line.trim()) yield line;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer.replace(/\r$/, '');
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
}

const failure = async (name, response) => {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    detail = '';
  }
  const status = response.status;
  if (status === 401 || status === 403) return `${name} rejected this API key.`;
  if (status === 402) return `${name} reports no available credit on this account.`;
  if (status === 404) return `${name} does not recognise that model for this account.`;
  if (status === 429) return `${name} rate-limited this account — wait and try again.`;
  if (status >= 500) return `${name} had a server error (HTTP ${status}).`;
  return `${name} returned HTTP ${status}${detail ? ` — ${detail}` : ""}.`;
};

const imagesOf = (message) =>
  (Array.isArray(message?.images) ? message.images : []).filter(
    (value) => typeof value === 'string' && value.startsWith('data:image/'),
  );

const splitDataUrl = (url) => {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(url);
  return match ? { type: match[1], data: match[2] } : null;
};

/** Gemini wants inlineData parts beside the text. */
const googleParts = (message) => [
  ...(message.text ? [{ text: message.text }] : []),
  ...imagesOf(message)
    .map((url) => {
      const parsed = splitDataUrl(url);
      return parsed ? { inlineData: { mimeType: parsed.type, data: parsed.data } } : null;
    })
    .filter(Boolean),
];

/** Anthropic wants image blocks beside the text block. */
const anthropicContent = (message) => [
  ...(message.text ? [{ type: 'text', text: message.text }] : []),
  ...imagesOf(message)
    .map((url) => {
      const parsed = splitDataUrl(url);
      return parsed
        ? { type: 'image', source: { type: 'base64', media_type: parsed.type, data: parsed.data } }
        : null;
    })
    .filter(Boolean),
];

/** OpenAI-compatible gateways (Ollama included) take image_url parts. */
const openaiContent = (message) =>
  imagesOf(message).length
    ? [
        ...(message.text ? [{ type: 'text', text: message.text }] : []),
        ...imagesOf(message).map((url) => ({ type: 'image_url', image_url: { url } })),
      ]
    : message.text;

/** One provider's streamed reply, as text chunks. */
async function* streamText(route, { messages, system, signal }) {
  const provider = byId(route.id);
  if (!provider) throw new Error(`Unknown provider: ${route.id}`);

  const key = route.key || '';
  const common = { signal: withTimeout(signal, REQUEST_TIMEOUT_MS) };

  if (provider.id === 'google') {
    const body = {
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: googleParts(m),
      })),
      generationConfig: { maxOutputTokens: 4096 },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const response = await fetch(
      `${provider.apiBaseUrl}/models/${route.model}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        ...common,
      },
    );
    if (!response.ok || !response.body) {
      noteStatus(provider.id, response.status);
      throw new Error(await failure(provider.name, response));
    }

    for await (const line of sseLines(response.body)) {
      const event = sseData(line);
      if (!event) continue;
      if (event.error) throw new Error(`${provider.name} stopped the reply.`);
      const blocked = event.promptFeedback?.blockReason;
      if (blocked) throw new Error(`${provider.name} declined this prompt (${blocked}).`);
      const parts = event.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (typeof part?.text === 'string' && part.text) yield part.text;
      }
    }
    return;
  }

  if (provider.id === 'anthropic') {
    const body = {
      model: route.model,
      max_tokens: 4096,
      stream: true,
      messages: messages.map((m) => ({ role: m.role, content: anthropicContent(m) })),
    };
    if (system) body.system = system;

    const response = await fetch(`${provider.apiBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      ...common,
    });
    if (!response.ok || !response.body) {
      noteStatus(provider.id, response.status);
      throw new Error(await failure(provider.name, response));
    }

    for await (const line of sseLines(response.body)) {
      const event = sseData(line);
      if (!event) continue;
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        if (event.delta.text) yield event.delta.text;
      } else if (event.type === 'error') {
        throw new Error(`${provider.name} stopped the reply.`);
      }
    }
    return;
  }

  // Everything else speaks OpenAI Chat Completions: Ollama, Groq, Cerebras,
  // Mistral, Z.ai, OpenRouter, LLM7.io, GitHub Models, OVHcloud.
  const payload = {
    model: route.model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m) => ({ role: m.role, content: openaiContent(m) }))],
    stream: true,
  };

  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  if (provider.id === 'openrouter') headers['x-title'] = 'Xecutr';

  const response = await fetch(`${provider.apiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    ...common,
  });
  if (!response.ok || !response.body) {
    noteStatus(provider.id, response.status);
    throw new Error(await failure(provider.name, response));
  }

  for await (const line of sseLines(response.body)) {
    const event = sseData(line);
    if (!event) continue;
    if (event.error) throw new Error(`${provider.name} stopped the reply.`);
    const delta = event.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) yield delta;
  }
}

/**
 * Refresh this server's model list right before a turn. The local models are the
 * refusal safety net, and a discovery call that happened to fail must never be
 * the reason a refused turn has nowhere left to go.
 */
async function ensureLocal() {
  const local = byId('ollama');
  if (!local) return [];
  return discover(local, '');
}

/* ------------------------------------------------------- one-shot answers */

const REFUSAL_TEXT =
  /(I (?:can't|cannot|won't|am unable)|I'm (?:sorry|unable|not able)|as an AI|I must decline|cannot assist)/i;

/**
 * One turn without a stream — for channels that just want the answer (Telegram,
 * voice). It walks the same candidate chain, lets a refusal fall through to the
 * next model, and ends on this server, so a refusal still gets an answer.
 */
async function completeTurn({ messages, system, hasImages = false, providerId, model, clientKeys }) {
  await ensureLocal().catch(() => []);
  const catalogue = await catalog(clientKeys || {});
  const routes = candidates({ providerId, model, clientKeys: clientKeys || {}, catalogue, hasImages });
  if (!routes.length) throw new Error('No model is connected yet.');

  let lastError = '';
  for (const route of routes) {
    try {
      let text = '';
      for await (const delta of streamText(route, { messages, system })) text += delta;
      const clean = text.trim();
      if (!clean) {
        lastError = `${route.name} returned nothing.`;
        continue;
      }
      if (clean.length < 600 && REFUSAL_TEXT.test(clean)) {
        lastError = `${route.name} refused.`;
        continue;
      }
      return {
        text: clean,
        providerName: route.name,
        modelLabel: route.modelLabel,
        escalated: Boolean(route.escalated),
      };
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }

  throw new Error(lastError || 'No connected model could answer.');
}

module.exports = {
  PROVIDERS,
  MODEL_ID_PATTERN,
  byId,
  apiKeyFor,
  catalog,
  candidates,
  scoreModel,
  streamText,
  discover,
  ensureLocal,
  completeTurn,
};
