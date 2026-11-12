import { Check, RefreshCw } from "lucide-react";
import { GATEWAY, PROVIDERS, readKeys, readModelCache } from "@/lib/providers";

/**
 * Provider + model selector. "auto" routes to the keyless gateway; picking a
 * provider needs that provider's key from the connections page.
 */
export default function ModelPicker({ value, onChange, models, onDiscover, busy }) {
  const keys = readKeys();
  const cache = readModelCache();
  const ready = PROVIDERS.filter((p) => keys[p.id]);
  const list = models ?? cache[value.providerId]?.models ?? [];
  const provider = value.providerId === GATEWAY.id ? GATEWAY : PROVIDERS.find((p) => p.id === value.providerId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.providerId}
        onChange={(e) => {
          const next = e.target.value;
          const chosen = next === GATEWAY.id ? GATEWAY : PROVIDERS.find((p) => p.id === next);
          onChange({ providerId: next, model: next === GATEWAY.id ? "" : chosen?.defaultModel || "" });
        }}
        className="h-7 max-w-[170px] rounded-sm border border-white/10 bg-[#0b0b0b] px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de] outline-none"
      >
        <option value={GATEWAY.id}>auto · keyless</option>
        {ready.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

      {value.providerId !== GATEWAY.id && (
        <>
          <input
            list="xecutr-models"
            value={value.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            placeholder={provider?.defaultModel || "model id"}
            className="h-7 w-[190px] rounded-sm border border-white/10 bg-[#0b0b0b] px-2 font-mono text-[11px] text-white outline-none placeholder:text-muted-foreground/60 focus:border-[#b0c4de]/50"
          />
          <datalist id="xecutr-models">
            {list.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={onDiscover}
            disabled={busy}
            title="Discover models from this provider"
            className="inline-flex h-7 items-center gap-1 rounded-sm border border-white/10 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-40"
          >
            {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            models
          </button>
        </>
      )}
    </div>
  );
}