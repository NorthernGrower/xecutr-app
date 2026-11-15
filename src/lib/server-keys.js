/**
 * Provider keys for the whole deployment.
 *
 * A member's own key (Connections) is stored on their device and used for their
 * own turns only. A key placed on the server is different: it belongs to the
 * deployment, so every visitor's turn can use it — including the Base44-hosted
 * copy, which calls the same gateway. It never reaches a browser: the gateway
 * reads it from a root-only env file.
 *
 * The owner's copy-ready versions are /scratchpad/set-groq-key.txt and
 * /scratchpad/set-openai-key.txt.
 */

const RESTART = [
  "docker rm -f xecutr >/dev/null 2>&1",
  "docker run -d --name xecutr --restart unless-stopped --network host --env-file /root/.xecutr-providers.env",
  "-e PORT=8080",
  "-e FRONTEND_URL=https://xecutr.cloud",
  "-e FRONTEND_ORIGIN=http://127.0.0.1:8082",
  "-e OLLAMA_BASE_URL=http://127.0.0.1:11434/v1",
  "-e OLLAMA_MODEL=qwen2.5-coder:7b",
  "-e OLLAMA_FALLBACK_MODEL=huihui_ai/qwen3.5-abliterated:9b-OmniCoder",
  "-e MEDIA_URL=http://127.0.0.1:8090",
  "xecutr >/dev/null",
].join(" ");

const commandFor = (environmentVariable, placeholder) =>
  "touch /root/.xecutr-providers.env && chmod 600 /root/.xecutr-providers.env && " +
  `printf '${environmentVariable}=%s\\n' '${placeholder}' >> /root/.xecutr-providers.env && ` +
  RESTART;

export const SITE_KEYS = [
  {
    id: "groq",
    provider: "Groq",
    environmentVariable: "GROQ_API_KEY",
    signupUrl: "https://console.groq.com/keys",
    note: "Free tier, and the quickest hosted option: adding this key puts Groq ahead of OVHcloud in the chain.",
    command: commandFor("GROQ_API_KEY", "PASTE_KEY_HERE"),
  },
  {
    id: "openai",
    provider: "OpenAI",
    environmentVariable: "OPENAI_API_KEY",
    signupUrl: "https://platform.openai.com/api-keys",
    note: "Billed per token to the key's account — no free tier. GPT-4o/4.1/5 and o-series also see pasted images.",
    command: commandFor("OPENAI_API_KEY", "sk-PASTE_KEY_HERE"),
  },
].map((entry) => ({
  ...entry,
  check: "curl -s http://127.0.0.1:8080/api/providers",
}));

export const SITE_KEY = SITE_KEYS[0];

export const SITE_KEY_NOTES = [
  "The command appends, so other keys already in that file are kept.",
  "A shared key's allowance belongs to the whole key — every visitor spends from it. When it runs out the gateway cools that provider down for ten minutes and the chain moves on.",
  "Nothing is exposed to browsers: keys stay in a root-only file and reach the gateway as environment variables.",
  "A member's own key under Connections is still used first for that member's turns.",
];
