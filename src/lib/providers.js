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

export const PROVIDERS = [
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

/** Files that are cheap to send inline as attachments. */
export const isTextLike = (name = "") =>
  /\.(txt|md|markdown|json|jsonc|js|jsx|ts|tsx|css|html|xml|yml|yaml|csv|svg|py|rb|go|rs|java|c|h|cpp|sh|toml|ini|env)$/i.test(
    name,
  );