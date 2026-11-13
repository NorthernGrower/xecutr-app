import { useCallback, useRef, useState } from "react";
import { ask } from "@/lib/chat";
import { textOfMessage } from "@/lib/text-segments";

let seq = 0;
const nextId = () => `msg-${Date.now()}-${(seq += 1)}`;

/**
 * Sends one turn to this app's own model server through `ask()` and renders the
 * answer it returns, with the route badge of the model that produced it.
 */
export default function useXecutrChat({ initialMessages = [], onFiles, onFinish }) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const live = useRef({ messages: initialMessages, onFiles, onFinish, loading: false });
  live.current.messages = messages;
  live.current.onFiles = onFiles;
  live.current.onFinish = onFinish;

  const send = useCallback(async ({ text, providerId = "", model = "", attachments = [], projectId = null, keys = null }) => {
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

    try {
      const result = await ask({
        data: { prompt: text, messages: history, projectId, providerId, model, attachments, keys },
      });

      const reply = result?.text || "";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                provider: result?.providerName,
                model: result?.modelLabel,
                parts: reply ? [{ type: "text", content: reply }] : [],
              }
            : m,
        ),
      );

      if (result?.files?.length) live.current.onFiles?.(result.files);

      if (reply) {
        live.current.onFinish?.({
          text: reply,
          provider: result?.providerName,
          model: result?.modelLabel,
        });
      }
    } catch (err) {
      setError(err?.message || "The model server did not answer.");
    } finally {
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.parts.length > 0));
      live.current.loading = false;
      setLoading(false);
    }
  }, []);

  return { messages, send, isLoading, error };
}