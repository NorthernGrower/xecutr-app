import { useState } from "react";
import { Check, Copy, FileCode2, Terminal } from "lucide-react";
import { parseSegments, textOfMessage } from "@/lib/text-segments";

function CopyButton({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className="inline-flex items-center gap-1 rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
    >
      {done ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {done ? "copied" : "copy"}
    </button>
  );
}

function CodeBlock({ path, language, content }) {
  return (
    <div className="mt-2 overflow-hidden rounded-sm border border-white/10 bg-[#080808]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-1.5">
        {path ? (
          <FileCode2 className="h-3 w-3 text-[#b0c4de]" strokeWidth={1.6} />
        ) : (
          <Terminal className="h-3 w-3 text-muted-foreground" strokeWidth={1.6} />
        )}
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
          {path || language}
        </span>
        <span className="ml-auto shrink-0">
          <CopyButton text={content} />
        </span>
      </div>
      <pre className="max-h-[380px] overflow-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-[#c9d3de]">
        {content}
      </pre>
    </div>
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

/** One chat message: provider label, prose, code/file blocks, tool cards. */
export default function MessageBubble({ message }) {
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
          isUser
            ? "border-white/10 bg-white/[0.045]"
            : "border-[#b0c4de]/20 bg-[#0d0d0d]"
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
          ) : (
            <CodeBlock
              key={i}
              path={seg.type === "file" ? seg.path : undefined}
              language={seg.language}
              content={seg.content}
            />
          ),
        )}

        {toolCalls.map((part, i) => (
          <ToolCard key={`${part.id}-${i}`} part={part} />
        ))}
      </div>
    </div>
  );
}