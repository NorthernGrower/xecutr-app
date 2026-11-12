import { useEffect, useRef, useState } from "react";
import { Activity, ArrowUp, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AgentMessage from "@/components/agent/AgentMessage";
import ActivityPanel from "@/components/agent/ActivityPanel";

/** The live agent conversation: history and composer, with its steps beside them. */
export default function AgentChat({ conversationId }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [showActivity, setShowActivity] = useState(false);
  const conversationRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    let alive = true;
    conversationRef.current = null;
    setConversation(null);
    setMessages([]);
    setError(null);

    base44.agents
      .getConversation(conversationId)
      .then((loaded) => {
        if (!alive) return;
        conversationRef.current = loaded;
        setConversation(loaded);
        setMessages(loaded.messages || []);
      })
      .catch(() => alive && setError("That session could not be opened."));

    const unsubscribe = base44.agents.subscribeToConversation(conversationId, (data) => {
      if (data?.messages) setMessages(data.messages);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const awaiting = messages.length > 0 && messages[messages.length - 1].role === "user";
  const canSend = text.trim().length > 0 && !sending && !awaiting && Boolean(conversationRef.current);

  const send = async () => {
    if (!canSend) return;
    const value = text.trim();
    setText("");
    setSending(true);
    setError(null);
    try {
      await base44.agents.addMessage(conversationRef.current, { role: "user", content: value });
    } catch (err) {
      setText(value);
      setError(err?.message || "That message did not go through.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className={`min-h-0 flex-1 flex-col ${showActivity ? "hidden lg:flex" : "flex"}`}>
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-1.5 lg:hidden">
          <button
            type="button"
            onClick={() => setShowActivity(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
          >
            {awaiting ? (
              <Loader2 className="h-3 w-3 animate-spin text-[#b0c4de]" />
            ) : (
              <Activity className="h-3 w-3" strokeWidth={1.6} />
            )}
            activity
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto w-full max-w-[820px] space-y-4">
            {messages.length === 0 && !error && (
              <div className="rounded-sm border border-white/10 bg-card/60 p-5">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-white">
                  {conversation?.metadata?.name || "new session"}
                </p>
                <p className="mt-2 font-body text-[12.5px] leading-relaxed text-muted-foreground">
                  Ask for a new project, a feature on one of your existing projects, a code audit, or a
                  bug fix. Try: "build me a habit tracker with streaks", "audit my portfolio project and
                  list the risks", or "the login form on my dashboard project never submits".
                </p>
              </div>
            )}

            {messages.map((message, index) => (
              <AgentMessage key={message.id || `${message.role}-${index}`} message={message} />
            ))}

            {awaiting && (
              <button
                type="button"
                onClick={() => setShowActivity(true)}
                className="flex items-center gap-2 rounded-sm px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de] transition hover:text-white"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                agent working — see activity
              </button>
            )}

            {error && <p className="font-body text-[12px] text-red-400">{error}</p>}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-white/10 bg-[#0a0a0a] px-4 py-3 sm:px-6">
          <div className="mx-auto w-full max-w-[820px]">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
              className="glow-edge rounded-sm border border-[#b0c4de]/30 bg-[#1c2128]"
            >
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") send();
                }}
                rows={2}
                placeholder="Tell the agent what to build, audit or fix…"
                className="w-full resize-none bg-transparent px-4 py-3 font-body text-[14px] leading-relaxed text-[#eef3f8] outline-none placeholder:text-[#7e8b99]"
              />
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  ⌘ / ctrl + enter
                </span>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="inline-flex shrink-0 items-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:border-[#e0f7ff]/70 hover:bg-[#e0f7ff]/[0.14] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-muted-foreground"
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5" />
                  )}
                  send
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <aside
        className={`min-h-0 w-full flex-col border-white/[0.07] lg:flex lg:w-[320px] lg:shrink-0 lg:border-l ${
          showActivity ? "flex" : "hidden"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-1.5 lg:hidden">
          <button
            type="button"
            onClick={() => setShowActivity(false)}
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground transition hover:text-white"
          >
            ← conversation
          </button>
        </div>
        <ActivityPanel messages={messages} working={awaiting} />
      </aside>
    </div>
  );
}