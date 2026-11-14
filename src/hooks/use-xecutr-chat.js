import { useCallback, useRef, useState } from "react";
import { ask } from "@/lib/chat";
import { splitMedia, textOfMessage } from "@/lib/text-segments";

let seq = 0;
const nextId = () => `msg-${Date.now()}-${(seq += 1)}`;

/**
 * Sends one turn to this app's own model server through `ask()` and renders the
 * answer it returns, with the route badge of the model that produced it.
 * `onMedia` receives the reply's [[image: …]] requests once the text is up, so
 * a slow generation never holds the answer back.
 */
export default function useXecutrChat({ initialMessages = [], onFiles, onMedia, onFinish }) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const live = useRef({ messages: initialMessages, onFiles, onMedia, onFinish, loading: false });
  live.current.messages = messages;
  live.current.onFiles = onFiles;
  live.current.onMedia = onMedia;
  live.current.onFinish = onFinish;

  /** Generated media lands on the message that asked for it, when it is ready. */
  const attachMedia = useCallback((messageId, items) => {
    if (!items?.length) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, media: [...(m.media || []), ...items] } : m)),
    );
  }, []);

  const send = useCallback(async ({ text, providerId = "", model = "", attachments = [], projectId = null, keys = null, mode = "build" }) => {
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
        data: { prompt: text, messages: history, projectId, providerId, model, attachments, keys, mode },
      });

      const raw = result?.text || "";
      // Media markers are not prose: they come out of the text and become jobs.
      const { text: reply, requests } = splitMedia(raw);

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
      if (requests.length) live.current.onMedia?.(requests, assistantId);

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

  return { messages, send, isLoading, error, attachMedia };
}