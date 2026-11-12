import AgentMarkdown from "@/components/agent/AgentMarkdown";

/** A single turn in the agent conversation. Steps live in the activity sidebar. */
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
      </div>
    </div>
  );
}