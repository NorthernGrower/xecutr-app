import { useCallback, useRef, useState } from "react";
import { streamTurn } from "@/lib/chat";
import { readAgentStream } from "@/lib/xecutr";
import { textOfMessage } from "@/lib/text-segments";

let seq = 0;
const nextId = () => `msg-${Date.now()}-${(seq += 1)}`;

const appendText = (parts, text) => {
  const last = parts[parts.length - 1];
  if (last?.type === "text") return [...parts.slice(0, -1), { ...last, content: last.content + text }];
  return [...parts, { type: "text", content: text }];
};

/** Completes the last running tool card of this name. */
const completeTool = (parts) => {
  const at = parts.map((p) => p.type === "tool-call" && p.state === "running").lastIndexOf(true);
  if (at === -1) return parts;
  return parts.map((p, i) => (i === at ? { ...p, state: "complete" } : p));
};

/**
 * Streams one turn from the xecutr gateway through the server proxy, mapping its
 * events onto the message shape the workspace bubbles already render.
 */
export default function useXecutrChat({ initialMessages = [], onFiles, onFinish }) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const live = useRef({ messages: initialMessages, onFiles, onFinish, loading: false });
  live.current.messages = messages;
  live.current.onFiles = onFiles;
  live.current.onFinish = onFinish;

  const send = useCallback(async ({ text, providerId = "", model = "", attachments = [], projectId = null }) => {
    if (live.current.loading) return;

    const userMessage = { id: nextId(), role: "user", parts: [{ type: "text", content: text }] };
    const assistantId = nextId();
    const history = [...live.current.messages, userMessage]
      .map((m) => ({ role: m.role, content: textOfMessage(m) }))
      .filter((m) => m.content)
      .slice(-20);

    live.current.loading = true;
    setLoading(true);
    setError(null);
    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", parts: [] }]);

    const patch = (fn) => setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));

    let reply = "";
    let route = null;

    try {
      const response = await streamTurn({ data: { messages: history, projectId, providerId, model, attachments } });

      await readAgentStream(response, (event) => {
        if (!event || typeof event !== "object") return;

        if (event.type === "route") {
          route = event;
          patch((m) => ({
            ...m,
            provider: event.providerName || event.providerId || "xecutr",
            model: event.modelLabel || event.model || "auto",
          }));
          return;
        }

        if (event.type === "text") {
          if (!event.text) return;
          reply += event.text;
          patch((m) => ({ ...m, parts: appendText(m.parts, event.text) }));
          return;
        }

        if (event.type === "tool") {
          patch((m) => ({
            ...m,
            parts: [
              ...m.parts,
              { type: "tool-call", id: nextId(), name: event.name, input: event.args || {}, state: "running" },
            ],
          }));
          return;
        }

        if (event.type === "tool_result") {
          patch((m) => ({ ...m, parts: completeTool(m.parts) }));
          return;
        }

        if (event.type === "files") {
          live.current.onFiles?.(Array.isArray(event.files) ? event.files : []);
          return;
        }

        if (event.type === "error") {
          setError(event.message || "The turn failed.");
        }
      });

      if (reply) {
        live.current.onFinish?.({
          text: reply,
          provider: route?.providerName || route?.providerId || "xecutr",
          model: route?.modelLabel || route?.model || "auto",
        });
      }
    } catch (err) {
      setError(err?.message || "The gateway did not answer.");
    } finally {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.parts.length > 0));
      live.current.loading = false;
      setLoading(false);
    }
  }, []);

  return { messages, send, isLoading, error };
}