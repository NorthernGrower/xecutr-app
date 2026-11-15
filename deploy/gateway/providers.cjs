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
  'kling', 'stable-diffusion',
];

const looksLikeChatModel = (id) => {
  const value = String(id || '').toLowerCase().replace(/[-_./:]/g, ' ');
  if (!value.trim()) return false;
  return !NON_CHAT_TERMS.some((term) => value.includes(term));
};

const prettyName = (raw) =>
  String(raw || '')
    .replace(/^models\//, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

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
      const label = typeof model?.name === 'string' && model.name !== id ? model.name : prettyName(id);
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
            .map((model) => ({ id: model.id, label: prettyName(model.id.replace(/^.*\//, '')), note: 'your account' })),
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
              label: model.displayName || prettyName(model.name),
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
            .map((model) => ({ id: model.id, label: model.display_name || prettyName(model.id), note: 'paid' })),
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

/* --------------------------------------------------------------- catalog */

/**
 * Only providers that can answer now, each with the models it actually lists.
 * A provider with no key, or a keyless one that never answered, is not shown.
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
    const score = (p) => scoreModel(p.models[0]?.id || '');
    return score(b) - score(a) || a.name.localeCompare(b.name);
  });

  return { providers, readyCount: providers.length };
}

/* --------------------------------------------------------------- routing */

/**
 * The routes to try for one turn, strongest first.
 *
 * Order, and why:
 *   1. a provider the person connected with their own key — their account, their
 *      limits, and the strongest models available to them;
 *   2. this server's own Ollama models, which are free, private and fast here;
 *   3. a keyless shared gateway, only when neither of the above exists.
 *
 * The local abliterated model is always the last resort, marked escalated, so a
 * refusal from a hosted provider still produces working files in the project.
 * `reason` is what the reply's routing strip shows, so it has to be true.
 */
function candidates({ providerId, model, clientKeys, catalogue }) {
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
      const chosen =
        (typeof model === 'string' && provider.models.find((m) => m.id === model)) || bestModel(provider.models);
      return [route(provider, chosen, 'pinned by you'), ...localFallback(chosen.id)];
    }
  }

  const keyed = listed_.filter((p) => !p.local && !p.paid && p.keyed);
  const local = listed_.find((p) => p.local);
  const keyless = listed_.filter((p) => !p.local && !p.paid && !p.keyed);

  const routes = [];

  if (keyed.length) {
    keyed.slice(0, 2).forEach((provider, index) => {
      routes.push(
        route(provider, bestModel(provider.models), index === 0 ? 'best available' : 'next best available'),
      );
    });
  } else if (local) {
    // The fast local model answers first when nothing hosted is connected;
    // the abliterated one is still the fallback below.
    const preferred = process.env.OLLAMA_MODEL || '';
    const chosen = local.models.find((m) => m.id === preferred) || bestModel(local.models);
    routes.push(route(local, chosen, 'best model on this server'));
  }

  if (local && routes.length) routes.push(...localFallback(routes[0].model));
  else if (!routes.length && keyless.length) {
    routes.push(route(keyless[0], bestModel(keyless[0].models), 'keyless gateway'));
  }

  return routes;
}

/** The local abliterated model: whatever this host actually has pulled. */
function localFallback(afterModel) {
  const local = catalogs.get('ollama');
  const models = local?.models || [];
  if (!models.length) return [];

  const fallbackId = process.env.OLLAMA_FALLBACK_MODEL || '';
  const chosen = models.find((m) => m.id === fallbackId) || bestModel(models);
  if (!chosen || chosen.id === afterModel) return [];

  return [
    {
      id: 'ollama',
      name: 'Local fallback',
      key: '',
      model: chosen.id,
      modelLabel: chosen.label,
      reason: 'local fallback',
      escalated: true,
    },
  ];
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
        parts: [{ text: m.text }],
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
    if (!response.ok || !response.body) throw new Error(await failure(provider.name, response));

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
      messages: messages.map((m) => ({ role: m.role, content: m.text })),
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
    if (!response.ok || !response.body) throw new Error(await failure(provider.name, response));

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
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m) => ({ role: m.role, content: m.text }))],
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
  if (!response.ok || !response.body) throw new Error(await failure(provider.name, response));

  for await (const line of sseLines(response.body)) {
    const event = sseData(line);
    if (!event) continue;
    if (event.error) throw new Error(`${provider.name} stopped the reply.`);
    const delta = event.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) yield delta;
  }
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
};
