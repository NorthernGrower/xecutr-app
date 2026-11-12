import { useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import AgentMarkdown from "@/components/agent/AgentMarkdown";

const FAILED = ["failed", "error"];

function parseJson(value) {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** One tool call the agent ran, collapsed to its state unless opened. */
function ToolCall({ toolCall }) {
  const [open, setOpen] = useState(false);
  const projection = toolCall.display_projection || {};
  const pending = ["pending", "running", "in_progress"].includes(toolCall.status);
  const results = parseJson(toolCall.results);
  const failed =
    FAILED.includes(toolCall.status) ||
    (typeof results === "string" && /error|failed/i.test(results)) ||
    results?.success === false;

  const stateLabel = failed
    ? projection.error_label || "failed"
    : pending
      ? projection.active_label || "running"
      : projection.label || "done";

  const label = projection.hide_details && projection.details_redacted
    ? stateLabel
    : (toolCall.name || "tool").replace(/_/g, " ");

  return (
    <div className="mt-2 rounded-sm border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        {failed ? (
          <TriangleAlert className="h-3 w-3 shrink-0 text-red-400" strokeWidth={1.7} />
        ) : pending ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#b0c4de]" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-[#e0f7ff]" strokeWidth={2} />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {stateLabel}
        </span>
      </button>

      {open && !(projection.hide_details && projection.details_redacted) && (
        <div className="space-y-2 border-t border-white/[0.06] px-3 py-2">
          <div>
            <p className="label-mono mb-1">parameters</p>
            <pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] text-[#c9d4de]">
              {typeof parseJson(toolCall.arguments_string) === "string"
                ? parseJson(toolCall.arguments_string)
                : JSON.stringify(parseJson(toolCall.arguments_string), null, 2)}
            </pre>
          </div>
          <div>
            <p className="label-mono mb-1">result</p>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[10.5px] text-[#c9d4de]">
              {typeof results === "string" ? results : JSON.stringify(results, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** A single turn in the agent conversation. */
export default function AgentMessage({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-sm border px-4 py-3 ${
          isUser ? "border-white/10 bg-white/[0.045]" : "border-[#b0c4de]/20 bg-[#0d0d0d]"
        }`}
      >
        {!isUser && (
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de]">
            <span className="inline-block h-1 w-1 rounded-full bg-[#e0f7ff]" />
            xecutr agent
          </div>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap font-body text-[13.5px] leading-relaxed text-[#dfe6ee]">
            {message.content}
          </p>
        ) : (
          message.content && <AgentMarkdown>{message.content}</AgentMarkdown>
        )}

        {(message.tool_calls || []).map((toolCall, index) => (
          <ToolCall key={`${toolCall.name}-${index}`} toolCall={toolCall} />
        ))}
      </div>
    </div>
  );
}