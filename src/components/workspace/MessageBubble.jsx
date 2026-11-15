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

/** A generated image, clip or track, shown where the reply asked for it. */
function MediaTile({ item }) {
  const src = item.dataUrl || item.url;
  if (!src) return null;
  return (
    <figure className="mt-2 overflow-hidden rounded-sm border border-white/10 bg-black/30">
      {item.kind === "video" ? (
        <video src={src} controls playsInline className="w-full" />
      ) : item.kind === "music" ? (
        <audio src={src} controls className="w-full p-2" />
      ) : (
        <img src={src} alt={item.prompt || item.path || "generated"} className="w-full" />
      )}
      <figcaption className="truncate px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {item.path}
      </figcaption>
    </figure>
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

/**
 * Why the harness answered with the model it did: the model, the reason it was
 * chosen, and the escalation trail when a refusal was re-run on the local model.
 */
function RouteStrip({ routes, provider, model }) {
  const trail = (Array.isArray(routes) ? routes : []).filter((r) => r && (r.model || r.provider));
  const last = trail[trail.length - 1];
  const label = last?.provider || provider;
  const name = last?.model || model;
  if (!label && !name) return null;

  const escalated = trail.length > 1 && trail.some((r) => r.escalated);
  const started = trail[0]?.model;
  const reason = escalated ? last?.reason : trail[0]?.reason;

  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em]"
      title={trail
        .map((r) => `${r.provider}: ${r.model}${r.reason ? ` — ${r.reason}` : ""}`)
        .join("\n")}
    >
      <span className="inline-block h-1 w-1 rounded-full bg-[#e0f7ff]" />
      <span className="text-[#b0c4de]">{label}</span>
      {escalated && started && started !== name ? (
        <span className="min-w-0 truncate text-[#dfe6ee]">
          {started} → {name}
        </span>
      ) : (
        name && <span className="min-w-0 truncate text-[#dfe6ee]">{name}</span>
      )}
      {reason && (
        <span className={escalated ? "text-[#e0f7ff]/80" : "text-muted-foreground/70"}>
          {escalated ? `escalated · ${reason}` : `· ${reason}`}
        </span>
      )}
    </div>
  );
}

/** One chat message: routing strip, prose, written-file rows and tool cards. */
export default function MessageBubble({ message, onOpenFile }) {
  const isUser = message.role === "user";
  const text = textOfMessage(message);
  const segments = isUser ? [{ type: "text", content: text }] : parseSegments(text);
  const toolCalls = (message.parts ?? []).filter((p) => p.type === "tool-call");
  const media = message.media ?? [];

  if (!text && !toolCalls.length && !media.length) return null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        data-testid={isUser ? "user-message" : "assistant-message"}
        className={`max-w-[92%] rounded-sm border px-4 py-3 ${
          isUser ? "border-white/10 bg-white/[0.045]" : "border-[#b0c4de]/20 bg-[#0d0d0d]"
        }`}
      >
        {!isUser && <RouteStrip routes={message.route} provider={message.provider} model={message.model} />}

        {media.map((item) => (
          <MediaTile key={item.path} item={item} />
        ))}

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