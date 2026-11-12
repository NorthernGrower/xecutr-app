/**
 * Provider catalogue for the harness. Client-safe constants only.
 *
 * User keys never leave the browser except inside a single chat request; this
 * module only reads and writes the local per-device key store.
 */

export const GATEWAY = {
  id: "gateway",
  label: "keyless gateway",
  baseURL: null,
  defaultModel: "automatic",
  connect: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/",
  note: "Keyless. No signup needed — answers are routed by the shared gateway.",
};

/** Models the keyless gateway can be pinned to. "automatic" lets it choose. */
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
    id: "ovh",
    label: "OVHcloud AI Endpoints",
    baseURL: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    defaultModel: "Meta-Llama-3_3-70B-Instruct",
    connect: "https://endpoints.ai.cloud.ovh.com/",
    free: true,
    /** Free-tier endpoints, selectable without discovery. */
    models: [
      "Meta-Llama-3_3-70B-Instruct",
      "Meta-Llama-3_1-70B-Instruct",
      "Meta-Llama-3_1-8B-Instruct",
      "Mistral-Small-3.2-24B-Instruct-2506",
      "Mistral-Nemo-Instruct-2407",
      "Mistral-7B-Instruct-v0.3",
      "Qwen3-32B",
      "Qwen3-Coder-30B-A3B-Instruct",
      "Qwen2.5-VL-72B-Instruct",
      "gpt-oss-20b",
      "gpt-oss-120b",
      "DeepSeek-R1-0528",
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    connect: "https://aistudio.google.com/apikey",
  },
  {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    connect: "https://console.groq.com/keys",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    baseURL: "https://api.cerebras.ai/v1",
    defaultModel: "llama3.1-8b",
    connect: "https://cloud.cerebras.ai",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    connect: "https://console.mistral.ai/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    connect: "https://openrouter.ai/keys",
  },
  {
    id: "github",
    label: "GitHub Models",
    baseURL: "https://models.inference.ai.azure.com",
    defaultModel: "gpt-4o-mini",
    connect: "https://github.com/settings/tokens",
  },
  {
    id: "zai",
    label: "Z.ai",
    baseURL: "https://api.z.ai/api/paas/v4",
    defaultModel: "glm-4.5",
    connect: "https://z.ai/manage-apikey/apikey-list",
  },
];

const KEY_STORE = "xecutr:provider-keys";
const MODEL_STORE = "xecutr:model-cache";
const GH_STORE = "xecutr:github";
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

export const readModelCache = () => read(MODEL_STORE, {});
export const saveModelCache = (id, models) =>
  write(MODEL_STORE, { ...readModelCache(), [id]: { models, at: Date.now() } });

export const readGitHubToken = () => read(GH_STORE, "");
export const saveGitHubToken = (token) => write(GH_STORE, token);

/** Per-project model choice, so each project reopens on the model it was built with. */
export const readSettings = (scope) => read(SETTINGS_STORE, {})[scope] || null;
export const saveSettings = (scope, settings) =>
  write(SETTINGS_STORE, { ...read(SETTINGS_STORE, {}), [scope]: settings });

/** Files that are cheap to send inline as attachments. */
export const isTextLike = (name = "") =>
  /\.(txt|md|markdown|json|jsonc|js|jsx|ts|tsx|css|html|xml|yml|yaml|csv|svg|py|rb|go|rs|java|c|h|cpp|sh|toml|ini|env)$/i.test(
    name,
  );