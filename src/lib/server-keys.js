/**
 * One provider key for the whole deployment.
 *
 * A member's own key (Connections) is stored on their device and used for their
 * own turns only. A key placed on the server is different: it belongs to the
 * deployment, so every visitor's turn can use it — including the Base44-hosted
 * copy, which calls the same gateway. It never reaches a browser: the gateway
 * reads it from a root-only env file.
 *
 * The owner's copy-ready version is /scratchpad/set-groq-key.txt.
 */
export const SITE_KEY = {
  provider: "Groq",
  environmentVariable: "GROQ_API_KEY",
  signupUrl: "https://console.groq.com/keys",
  intro:
    "A server-side key serves every visitor. Each member's own key under Connections is still used first for that member's turns; the shared key covers everyone else.",
  command:
    "touch /root/.xecutr-providers.env && chmod 600 /root/.xecutr-providers.env && printf 'GROQ_API_KEY=%s\\n' 'PASTE_KEY_HERE' >> /root/.xecutr-providers.env && docker rm -f xecutr >/dev/null 2>&1; docker run -d --name xecutr --restart unless-stopped --network host --env-file /root/.xecutr-providers.env -e PORT=8080 -e FRONTEND_URL=https://xecutr.cloud -e FRONTEND_ORIGIN=http://127.0.0.1:8082 -e OLLAMA_BASE_URL=http://127.0.0.1:11434/v1 -e OLLAMA_MODEL=qwen2.5-coder:7b -e OLLAMA_FALLBACK_MODEL=huihui_ai/qwen3.5-abliterated:9b-OmniCoder -e MEDIA_URL=http://127.0.0.1:8090 xecutr >/dev/null",
  check: "curl -s http://127.0.0.1:8080/api/providers",
  notes: [
    "The command appends, so other keys already in that file are kept.",
    "Groq's free tier is one allowance for the whole key — roughly 30 requests a minute and 1,000 a day per model, shared by every visitor.",
    "When that allowance runs out the gateway cools Groq down for ten minutes and the chain moves on: OVHcloud, then this server.",
    "Nothing is exposed to browsers: the key stays in a root-only file and reaches the gateway as an environment variable.",
  ],
};
