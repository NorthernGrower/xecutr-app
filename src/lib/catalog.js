/**
 * One pickable catalogue: exactly what the gateway says it can answer with now.
 *
 * There is deliberately no shipped top-up. A provider the gateway does not
 * report — no key on the server, a keyless gateway that did not reply, a model
 * its own API no longer lists — is not offered at all, because a model in the
 * picker that cannot answer is a trap rather than a choice.
 */
import { PROVIDERS } from "@/lib/providers";

const ALIAS = { google: "gemini" };

const localFor = (id) => PROVIDERS.find((p) => p.id === id || p.id === ALIAS[id]) || null;

const asModels = (provider) => {
  const rows = Array.isArray(provider?.models) ? provider.models : [];
  return rows
    .filter((m) => (typeof m === "string" ? m : m?.id))
    .map((m) =>
      typeof m === "string"
        ? { id: m, label: m, note: "" }
        : { id: m.id, label: m.label || m.id, note: m.note || "" },
    );
};

const normalizeLive = (provider) => {
  const local = localFor(provider.id);
  return {
    id: provider.id,
    label: provider.name || local?.label || provider.id,
    subtitle: provider.subtitle || "",
    status: provider.status || "unknown",
    free: provider.freeTier ?? local?.free ?? false,
    keyless: Boolean(provider.keyless),
    local: Boolean(provider.local),
    cooling: Number(provider.cooling) || 0,
    defaultModel: provider.defaultModel || "",
    defaultModelLabel: provider.defaultModelLabel || "",
    models: asModels(provider),
    signupUrl: provider.signupUrl || local?.connect || "",
    note: provider.note || "",
    setupHint: provider.setupHint || "",
    environmentVariable: provider.environmentVariable || "",
  };
};

/** The gateway's order is the routing order: fastest hosted first, local last. */
export function mergeCatalog(catalog) {
  return (catalog?.providers || [])
    .map(normalizeLive)
    .filter((provider) => provider.models.length > 0);
}

export const modelLabel = (provider, id) =>
  provider?.models.find((m) => m.id === id)?.label ||
  id ||
  provider?.defaultModelLabel ||
  provider?.defaultModel ||
  "auto";