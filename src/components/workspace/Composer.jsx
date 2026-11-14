import { ArrowUp, ClipboardList, Hammer, Loader2 } from "lucide-react";

const MODES = [
  { id: "plan", label: "plan", icon: ClipboardList, title: "Plan only — the AI drafts a plan, nothing is built" },
  { id: "build", label: "build", icon: Hammer, title: "Build — the AI writes the files" },
];

/** The prompt window: one textarea, provider chip, plan/build toggle, send. */
export default function Composer({
  value,
  onChange,
  onSubmit,
  busy = false,
  placeholder = "Describe the project you want to build…",
  footer,
  mode,
  onModeChange,
}) {
  const canSend = value.trim().length > 0 && !busy;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className="glow-edge overflow-hidden rounded-sm border border-[#b0c4de]/30 bg-[#1c2128]"
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend) onSubmit();
        }}
        rows={3}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-4 py-3.5 font-body text-[14px] leading-relaxed text-[#eef3f8] outline-none placeholder:text-[#7e8b99]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 gap-y-2.5 border-t border-white/10 px-3 py-2.5">
        <div className="min-w-0 flex-1 truncate">{footer}</div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
          {onModeChange && (
            <div className="inline-flex items-center overflow-hidden rounded-sm border border-white/10">
              {MODES.map(({ id, label, icon: Icon, title }) => {
                const active = mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    title={title}
                    onClick={() => onModeChange(id)}
                    className={`inline-flex min-w-0 items-center gap-1.5 px-2 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] transition sm:px-2.5 ${
                      active
                        ? "bg-[#e0f7ff]/[0.14] text-[#e0f7ff]"
                        : "text-muted-foreground hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:border-[#e0f7ff]/70 hover:bg-[#e0f7ff]/[0.14] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-muted-foreground"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
            {onModeChange ? (mode === "plan" ? "send plan" : "build") : "build"}
          </button>
        </div>
      </div>
    </form>
  );
}