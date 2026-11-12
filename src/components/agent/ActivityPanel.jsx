import { useEffect, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import ToolCallRow from "@/components/agent/ToolCallRow";

/** The agent's live steps — thinking and code writing — beside the conversation. */
export default function ActivityPanel({ messages, working }) {
  const steps = useMemo(() => {
    const out = [];
    messages.forEach((message, messageIndex) => {
      (message.tool_calls || []).forEach((toolCall, stepIndex) => {
        out.push({ key: `${messageIndex}-${stepIndex}`, toolCall });
      });
    });
    return out;
  }, [messages]);

  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [steps.length, working]);

  const running = steps.some((step) =>
    ["pending", "running", "in_progress"].includes(step.toolCall.status),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0b0c0d]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <span className="label-mono">activity</span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {steps.length} steps
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3">
        {steps.length === 0 && !working && (
          <p className="px-1 py-6 text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground/50">
            steps appear here as the agent works
          </p>
        )}

        {steps.map((step) => (
          <ToolCallRow key={step.key} toolCall={step.toolCall} />
        ))}

        {(working || running) && (
          <div className="flex items-center gap-2 px-1 pt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#b0c4de]">
            <Loader2 className="h-3 w-3 animate-spin" />
            {running ? "running a step" : "thinking"}
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
}