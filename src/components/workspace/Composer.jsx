import { useEffect, useRef, useState } from "react";
import { ArrowUp, ClipboardList, Hammer, Square } from "lucide-react";

const MODES = [
  { id: "plan", label: "plan", icon: ClipboardList, title: "Plan only — the AI drafts a plan, nothing is built" },
  { id: "build", label: "build", icon: Hammer, title: "Build — the AI writes the files" },
];

/** The prompt window's height is a device preference: set it once, kept. */
const HEIGHT_STORE = "xecutr:composer-height";
const MIN_HEIGHT = 76;
const DEFAULT_HEIGHT = 120;

const storedHeight = () => {
  if (typeof window === "undefined") return DEFAULT_HEIGHT;
  const value = Number(window.localStorage.getItem(HEIGHT_STORE));
  return Number.isFinite(value) && value >= MIN_HEIGHT ? value : DEFAULT_HEIGHT;
};

/**
 * The prompt window: a resizable textarea, the plan/build toggle and send.
 *
 * Drag the little handle above the text to size it (double-click the handle to
 * reset). The height is saved in local storage for this device, so the reply
 * area stays the size you set instead of being adjusted on every visit.
 */
export default function Composer({
  value,
  onChange,
  onSubmit,
  onPause,
  busy = false,
  placeholder = "Describe the project you want to build…",
  footer,
  mode,
  onModeChange,
}) {
  const canSend = value.trim().length > 0 && !busy;
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const drag = useRef(null);

  useEffect(() => {
    setHeight(storedHeight());
  }, []);

  const remember = (next) => {
    setHeight(next);
    try {
      window.localStorage.setItem(HEIGHT_STORE, String(next));
    } catch {
      /* storage unavailable — the size still holds for this visit */
    }
  };

  const startDrag = (event) => {
    event.preventDefault();
    drag.current = { y: event.clientY, height };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onDrag = (event) => {
    if (!drag.current) return;
    const max = Math.round((window.innerHeight || 800) * 0.45);
    const next = Math.min(max, Math.max(MIN_HEIGHT, drag.current.height - (event.clientY - drag.current.y)));
    setHeight(next);
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    remember(height);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
      className="glow-edge overflow-hidden rounded-sm border border-[#b0c4de]/30 bg-[#1c2128]"
    >
      <div
        role="separator"
        aria-label="Resize the prompt window"
        aria-orientation="horizontal"
        title="Drag to resize · double-click to reset"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => {
          try {
            window.localStorage.removeItem(HEIGHT_STORE);
          } catch {
            /* storage unavailable */
          }
          setHeight(DEFAULT_HEIGHT);
        }}
        className="group flex h-3 w-full cursor-row-resize touch-none items-center justify-center"
      >
        <span className="h-[2px] w-10 rounded-full bg-[#b0c4de]/40 transition group-hover:bg-[#0e7490]" />
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend) onSubmit();
        }}
        rows={4}
        style={{ height }}
        placeholder={placeholder}
        className="w-full resize-none overflow-auto bg-transparent px-4 pb-3 pt-1 font-body text-[14px] leading-relaxed text-[#eef3f8] outline-none placeholder:text-[#7e8b99]"
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
          {busy ? (
            <button
              type="button"
              onClick={onPause}
              title="Pause — stop the model working on this answer"
              className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-[#b0c4de]/35 bg-[#b0c4de]/[0.06] px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b0c4de] transition hover:border-red-500/50 hover:bg-red-500/[0.06] hover:text-red-600"
            >
              <Square className="h-3 w-3" fill="currentColor" />
              pause
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:border-[#e0f7ff]/70 hover:bg-[#e0f7ff]/[0.14] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-muted-foreground"
            >
              <ArrowUp className="h-3.5 w-3.5" />
              {onModeChange ? (mode === "plan" ? "send plan" : "build") : "build"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
