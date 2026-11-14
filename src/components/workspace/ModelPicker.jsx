import { useState } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ProviderRow from "@/components/workspace/ProviderRow";
import { modelLabel } from "@/lib/catalog";

/**
 * Pins the next turns to one provider and model from the merged catalogue, or
 * leaves them on automatic routing (free tiers first, with failover).
 */
export default function ModelPicker({ providers = [], value, onChange, onRefresh, busy }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(value.providerId || providers[0]?.id || "");

  const active = providers.find((p) => p.id === value.providerId);
  const current = active ? `${active.label} · ${modelLabel(active, value.model)}` : "auto · free tiers first";

  const choose = (next) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose provider and model"
          title={current}
          className="inline-flex h-7 min-w-0 max-w-[150px] items-center gap-1.5 rounded-sm border border-white/10 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de] transition hover:border-[#b0c4de]/40 hover:text-white sm:max-w-[240px]"
        >
          <Sparkles className="h-3 w-3 shrink-0" strokeWidth={1.6} />
          <span className="truncate">{current}</span>
          <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.6} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-[340px] border-white/10 bg-[#0b0b0b] p-0"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <span className="label-mono">model route</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition hover:text-white disabled:opacity-40"
          >
            <RefreshCw className={busy ? "h-2.5 w-2.5 animate-spin" : "h-2.5 w-2.5"} />
            refresh
          </button>
        </div>

        <div className="max-h-[360px] overflow-auto">
          <button
            type="button"
            onClick={() => choose({ providerId: "", model: "" })}
            className="flex w-full items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[12px] uppercase tracking-[0.08em] text-white">
                auto · free tiers first
              </span>
              <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                the gateway routes and fails over
              </span>
            </span>
            {!value.providerId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e0f7ff]" />}
          </button>

          {providers.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              expanded={expanded === provider.id}
              selectedModel={value.providerId === provider.id ? value.model : null}
              onToggle={() => setExpanded(expanded === provider.id ? "" : provider.id)}
              onPick={(id) => choose({ providerId: provider.id, model: id })}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}