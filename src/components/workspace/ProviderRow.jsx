import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** One provider in the model picker, expanding to its models. */
export default function ProviderRow({ provider, expanded, selectedModel, onToggle, onPick }) {
  const ready = provider.status === "ready";

  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-display text-[12px] uppercase tracking-[0.08em] text-white">
              {provider.label}
            </span>
            {provider.keyless && (
              <span className="rounded-sm border border-[#e0f7ff]/30 px-1 py-px font-mono text-[8px] uppercase tracking-[0.12em] text-[#e0f7ff]">
                keyless
              </span>
            )}
            {provider.free && !provider.keyless && (
              <span className="rounded-sm border border-[#b0c4de]/25 px-1 py-px font-mono text-[8px] uppercase tracking-[0.12em] text-[#b0c4de]">
                free
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {ready ? `${provider.models.length} models · ${provider.defaultModelLabel || provider.defaultModel || "auto"}` : `needs key · ${provider.environmentVariable || provider.id}`}
          </span>
        </span>
        <span className={cn("shrink-0 text-muted-foreground transition", expanded && "rotate-180")}>
          <ChevronDown className="h-3 w-3" />
        </span>
      </button>

      {expanded && (
        <div className="bg-black/30 px-2 pb-2">
          {provider.models.length === 0 && (
            <p className="px-2 py-2 font-body text-[11px] text-muted-foreground">
              No models listed{provider.signupUrl ? " — add a key in connections first." : "."}
            </p>
          )}
          {provider.models.map((model) => {
            const active = selectedModel === model.id;
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onPick(model.id)}
                className={cn(
                  "flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left transition hover:bg-white/[0.05]",
                  active && "bg-[#e0f7ff]/[0.07]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-[11.5px] text-white">{model.label}</span>
                  {model.note && (
                    <span className="block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {model.note}
                    </span>
                  )}
                </span>
                {active && <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#e0f7ff]" />}
              </button>
            );
          })}
          {!ready && provider.signupUrl && (
            <a
              href={provider.signupUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#b0c4de] underline-offset-2 hover:underline"
            >
              get a key →
            </a>
          )}
        </div>
      )}
    </div>
  );
}