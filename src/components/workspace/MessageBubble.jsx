import { FileCode2 } from "lucide-react";
import { parseSegments, textOfMessage } from "@/lib/text-segments";

/** A written file shown as a row that opens it in the files panel, never as code. */
function FileChip({ path, language, onOpen }) {
  const clickable = Boolean(onOpen);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(path)}
      disabled={!clickable}
      className={`mt-2 flex w-full items-center gap-2 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition ${
        clickable ? "hover:border-[#b0c4de]/45 hover:bg-white/[0.045]" : "cursor-default"
      }`}
    >
      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-[#b0c4de]" strokeWidth={1.6} />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#dfe6ee]">
        {path || language || "file"}
      </span>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        view
      </span>
    </button>
  );
}

function ToolCard({ part }) {
  const done = part.state === "complete";
  const label = part.input?.path || part.input?.url || part.input?.name || "";
  return (
    <div className="mt-2 flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${done ? "bg-[#e0f7ff]" : "bg-[#b0c4de] animate-pulse"}`}
      />
      <span className="text-[#b0c4de]">{part.name}</span>
      {label && <span className="truncate text-muted-foreground">{label}</span>}
      <span className="ml-auto text-muted-foreground/70">{done ? "done" : "running"}</span>
    </div>
  );
}

/** One chat message: provider label, prose, written-file rows and tool cards. */
export default function MessageBubble({ message, onOpenFile }) {
  const isUser = message.role === "user";
  const text = textOfMessage(message);
  const segments = isUser ? [{ type: "text", content: text }] : parseSegments(text);
  const toolCalls = (message.parts ?? []).filter((p) => p.type === "tool-call");

  if (!text && !toolCalls.length) return null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        data-testid={isUser ? "user-message" : "assistant-message"}
        className={`max-w-[92%] rounded-sm border px-4 py-3 ${
          isUser ? "border-white/10 bg-white/[0.045]" : "border-[#b0c4de]/20 bg-[#0d0d0d]"
        }`}
      >
        {!isUser && (message.provider || message.model) && (
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de]">
            <span className="inline-block h-1 w-1 rounded-full bg-[#e0f7ff]" />
            {message.provider}
            {message.model ? ` · ${message.model}` : ""}
          </div>
        )}

        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <p key={i} className="whitespace-pre-wrap font-body text-[13.5px] leading-relaxed text-[#dfe6ee]">
              {seg.content}
            </p>
          ) : seg.type === "file" ? (
            <FileChip key={i} path={seg.path} onOpen={onOpenFile} />
          ) : null,
        )}

        {toolCalls.map((part, i) => (
          <ToolCard key={`${part.id}-${i}`} part={part} />
        ))}
      </div>
    </div>
  );
}