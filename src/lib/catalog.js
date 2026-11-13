/**
 * One pickable catalogue. The gateway's live provider list comes first; the
 * shipped PROVIDERS constants top it up so the picker still works when the
 * gateway is unreachable, and so a provider's free model list never disappears
 * just because it needs a key.
 */
import { PROVIDERS } from "@/lib/providers";

const ALIAS = { google: "gemini" };

const localFor = (id) => PROVIDERS.find((p) => p.id === id || p.id === ALIAS[id]) || null;

const asModels = (provider, local) => {
  const rows =
    Array.isArray(provider?.models) && provider.models.length
      ? provider.models
      : (local?.models || []).map((id) => ({ id, label: id }));
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
    defaultModel: provider.defaultModel || local?.defaultModel || "",
    defaultModelLabel: provider.defaultModelLabel || "",
    models: asModels(provider, local),
    signupUrl: provider.signupUrl || local?.connect || "",
    note: provider.note || "",
    setupHint: provider.setupHint || "",
    environmentVariable: provider.environmentVariable || "",
  };
};

const fromLocal = (local) => ({
  id: local.id,
  label: local.label,
  subtitle: "shipped catalogue",
  status: "unknown",
  free: Boolean(local.free),
  keyless: false,
  defaultModel: local.defaultModel || "",
  defaultModelLabel: "",
  models: asModels(null, local),
  signupUrl: local.connect || "",
  note: "",
  setupHint: "",
});

/** Ready first, then free, then alphabetical — so OVH's free models stay on top. */
export function mergeCatalog(catalog) {
  const live = (catalog?.providers || []).map(normalizeLive);
  const missing = PROVIDERS.filter(
    (local) => !live.some((p) => p.id === local.id || p.id === ALIAS[local.id]),
  ).map(fromLocal);

  return [...live, ...missing].sort(
    (a, b) =>
      Number(b.status === "ready") - Number(a.status === "ready") ||
      Number(b.free) - Number(a.free) ||
      a.label.localeCompare(b.label),
  );
}

export const modelLabel = (provider, id) =>
  provider?.models.find((m) => m.id === id)?.label ||
  id ||
  provider?.defaultModelLabel ||
  provider?.defaultModel ||
  "auto";