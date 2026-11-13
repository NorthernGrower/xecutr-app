/**
 * Provider catalogue for the harness. Client-safe constants only.
 *
 * Mirrors the Xecutr gateway's own catalogue (ollama, ovh, google, anthropic,
 * groq, cerebras, zai, openrouter, mistral, llm7, github) so the picker still
 * lists every free model when the gateway is slow or unreachable.
 *
 * User keys never leave the browser except inside a single chat request; this
 * module only reads and writes the local per-device key store.
 */

export const GATEWAY = {
  id: "gateway",
  label: "xecutr gateway",
  baseURL: null,
  defaultModel: "automatic",
  connect: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/",
  note: "Keyless. No signup needed — answers are routed by the shared gateway.",
};

/** Models the gateway can be pinned to. "automatic" lets it choose. */
export const GATEWAY_MODELS = [
  { id: "automatic", label: "auto · best available" },
  { id: "gemini_3_8_flash", label: "Gemini 3.8 Flash" },
  { id: "gpt_6_luna", label: "GPT-6 Luna" },
  { id: "gpt_6_sol", label: "GPT-6 Sol" },
  { id: "gpt_6_astra", label: "GPT-6 Astra" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude_opus_5_5", label: "Claude Opus 5.5" },
  { id: "claude_fable_5_1", label: "Claude Fable 5.1" },
  { id: "Base 1_2", label: "Base 1.2" },
];

export const GATEWAY_MODEL_IDS = GATEWAY_MODELS.map((m) => m.id);

export const PROVIDERS = [
  {
    id: "ollama",
    label: "Ollama (this server)",
    baseURL: null,
    defaultModel: "qwen2.5-coder:7b",
    connect: "https://ollama.com",
    free: true,
    /** Pulled on the host that runs the gateway — no key, no quota. */
    models: [
      "coder:latest",
      "qwen2.5-coder:7b",
      "qwen2.5-coder:3b",
      "huihui_ai/Qwen3.8-abliterated",
      "llama3.2:3b",
    ],
  },
  {
    id: "ovh",
    label: "OVHcloud AI",
    baseURL: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    defaultModel: "gpt-oss-120b",
    connect: "https://endpoints.ai.cloud.ovh.com/",
    free: true,
    /** Free-tier endpoints, selectable with no key at all. */
    models: [
      "gpt-oss-120b",
      "gpt-oss-20b",
      "Qwen2.5-VL-72B-Instruct",
      "Qwen3.6-27B",
      "Qwen3.5-9B",
      "Qwen3.8-27B",
      "Qwen3.5-397B-A17B",
      "Mistral-Small-3.2-24B-Instruct-2506",
      "Meta-Llama-3_3-70B-Instruct",
      "Meta-Llama-3_1-70B-Instruct",
      "Meta-Llama-3_1-8B-Instruct",
      "Mistral-Nemo-Instruct-2407",
      "Mistral-7B-Instruct-v0.3",
      "Qwen3-32B",
      "Qwen3-Coder-30B-A3B-Instruct",
      "DeepSeek-R1-0528",
    ],
  },
  {
    id: "google",
    label: "Google AI",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    connect: "https://aistudio.google.com/apikey",
    free: true,
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    connect: "https://console.anthropic.com/settings/keys",
    models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    connect: "https://console.groq.com/keys",
    free: true,
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
  },
  {
    id: "cerebras",
    label: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    defaultModel: "gpt-oss-120b",
    connect: "https://cloud.cerebras.ai",
    free: true,
    models: ["gpt-oss-120b", "qwen-3.8-27b"],
  },
  {
    id: "zai",
    label: "Z.ai (Zhipu)",
    baseURL: "https://api.z.ai/api/paas/v4",
    defaultModel: "glm-4.7-flash",
    connect: "https://open.bigmodel.cn/usercenter/apikeys",
    free: true,
    models: ["glm-4.7-flash", "glm-4.6v-flash"],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "baidu/ernie-5.5-flash-preview:free",
    connect: "https://openrouter.ai/keys",
    free: true,
    models: [
      "baidu/ernie-5.5-flash-preview:free",
      "liquid/lfm-3-1.7b:free",
      "particle-ai/particle-1:free",
      "recursive/flint-v1.0:free",
      "nvidia/nemotron-3.5-super-vl:free",
      "apodex/apodex-1.1-mini:free",
      "dots-studio/dots-3-note-preview:free",
      "liquid/lfm-2.5-2.6b:free",
      "nvidia/nemotron-3.5-lightning:free",
      "cohere/north-mini-code:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "google/gemma-4-26b-a4b-it:free",
      "google/gemma-4-31b-it:free",
      "openrouter/free",
    ],
  },
  {
    id: "mistral",
    label: "Mistral AI",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    connect: "https://console.mistral.ai/api-keys",
    free: true,
    models: ["mistral-small-latest", "codestral-latest", "mistral-medium-latest"],
  },
  {
    id: "llm7",
    label: "LLM7.io",
    baseURL: "https://api.llm7.io/v1",
    defaultModel: "gpt-oss:20b",
    connect: "https://token.llm7.io",
    free: true,
    models: ["gpt-oss:20b", "codestral-latest", "nemotron-3-nano:30b"],
  },
  {
    id: "github",
    label: "GitHub Models",
    baseURL: "https://models.inference.ai.azure.com",
    defaultModel: "openai/gpt-4.1-mini",
    connect: "https://github.com/settings/personal-access-tokens/new",
    free: true,
    models: ["openai/gpt-4.1-mini", "openai/gpt-4.1-nano", "openai/gpt-4.1"],
  },
];

const KEY_STORE = "xecutr:provider-keys";
const MODEL_STORE = "xecutr:model-cache";
const SETTINGS_STORE = "xecutr:model-choice";

export function providerById(id) {
  if (id === GATEWAY.id) return GATEWAY;
  return PROVIDERS.find((p) => p.id === id) || null;
}

const read = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};

export const readKeys = () => read(KEY_STORE, {});
export const saveKey = (id, key) => write(KEY_STORE, { ...readKeys(), [id]: key });
export const clearKey = (id) => {
  const next = readKeys();
  delete next[id];
  write(KEY_STORE, next);
};

/** One-time cleanup: GitHub tokens used to be cached in this browser. */
export const purgeLegacyGitHubTokens = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("xecutr:github");
  } catch {
    /* storage unavailable */
  }
};

export const readModelCache = () => read(MODEL_STORE, {});
export const saveModelCache = (id, models) =>
  write(MODEL_STORE, { ...readModelCache(), [id]: { models, at: Date.now() } });

/** Per-project model choice, so each project reopens on the model it was built with. */
export const readSettings = (scope) => read(SETTINGS_STORE, {})[scope] || null;
export const saveSettings = (scope, settings) =>
  write(SETTINGS_STORE, { ...read(SETTINGS_STORE, {}), [scope]: settings });

/** Files that are cheap to send inline as attachments. */
export const isTextLike = (name = "") =>
  /\.(txt|md|markdown|json|jsonc|js|jsx|ts|tsx|css|html|xml|yml|yaml|csv|svg|py|rb|go|rs|java|c|h|cpp|sh|toml|ini|env)$/i.test(
    name,
  );