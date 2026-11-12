import { useState } from "react";
import { Check, ChevronDown, Loader2, TriangleAlert } from "lucide-react";

const FAILED = ["failed", "error"];

function parseJson(value) {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** One step the agent ran, shown in the activity sidebar. */
export default function ToolCallRow({ toolCall }) {
  const [open, setOpen] = useState(false);
  const projection = toolCall.display_projection || {};
  const pending = ["pending", "running", "in_progress"].includes(toolCall.status);
  const results = parseJson(toolCall.results);
  const failed =
    FAILED.includes(toolCall.status) ||
    (typeof results === "string" && /error|failed/i.test(results)) ||
    results?.success === false;
  const redacted = projection.hide_details && projection.details_redacted;

  const stateLabel = failed
    ? projection.error_label || "failed"
    : pending
      ? projection.active_label || "running"
      : projection.label || "done";

  const label = redacted ? stateLabel : (toolCall.name || "tool").replace(/_/g, " ");

  return (
    <div
      className={`rounded-sm border bg-white/[0.02] ${
        failed ? "border-red-400/25" : "border-white/[0.08]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {failed ? (
          <TriangleAlert className="h-3 w-3 shrink-0 text-red-400" strokeWidth={1.7} />
        ) : pending ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#b0c4de]" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-[#e0f7ff]" strokeWidth={2} />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#b0c4de]">
            {label}
          </span>
          <span className="mt-0.5 block truncate font-body text-[10.5px] text-muted-foreground">
            {stateLabel}
          </span>
        </span>

        <ChevronDown
          className={`h-3 w-3 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
          strokeWidth={1.8}
        />
      </button>

      {open && !redacted && (
        <div className="max-h-56 space-y-2 overflow-auto border-t border-white/[0.06] px-2.5 py-2">
          <div>
            <p className="label-mono mb-1">parameters</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-[#c9d4de]">
              {typeof parseJson(toolCall.arguments_string) === "string"
                ? parseJson(toolCall.arguments_string)
                : JSON.stringify(parseJson(toolCall.arguments_string), null, 2)}
            </pre>
          </div>
          <div>
            <p className="label-mono mb-1">result</p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-[#c9d4de]">
              {typeof results === "string" ? results : JSON.stringify(results, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}