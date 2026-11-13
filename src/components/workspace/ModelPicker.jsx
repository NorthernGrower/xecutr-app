import { Check, RefreshCw } from "lucide-react";

/**
 * Routes a turn either automatically (free tiers first, with failover) or to one
 * provider and model from the xecutr gateway's live catalogue.
 */
export default function ModelPicker({ catalog, value, onChange, onRefresh, busy }) {
  const providers = (catalog?.providers || []).filter((p) => p.status === "ready");
  const active = providers.find((p) => p.id === value.providerId);
  const models = active?.models || [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.providerId || ""}
        onChange={(e) => onChange({ providerId: e.target.value, model: "" })}
        aria-label="Provider"
        className="h-7 max-w-[170px] rounded-sm border border-white/10 bg-[#0b0b0b] px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de] outline-none"
      >
        <option value="">auto · free tiers first</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id}
          </option>
        ))}
      </select>

      {active && (
        <select
          value={value.model || ""}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
          aria-label="Model"
          className="h-7 max-w-[200px] rounded-sm border border-white/10 bg-[#0b0b0b] px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de] outline-none focus:border-[#b0c4de]/50"
        >
          <option value="">{`default · ${active.defaultModel || "auto"}`}</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label || m.id}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        title="Refresh the provider catalogue from the gateway"
        className="inline-flex h-7 items-center gap-1 rounded-sm border border-white/10 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-40"
      >
        {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        models
      </button>
    </div>
  );
}