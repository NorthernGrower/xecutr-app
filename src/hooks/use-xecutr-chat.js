import { useCallback, useRef, useState } from "react";
import { abortTurn, ask } from "@/lib/chat";
import { splitMedia, textOfMessage } from "@/lib/text-segments";

let seq = 0;
const nextId = () => `msg-${Date.now()}-${(seq += 1)}`;
const nextTurnId = () => `turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Sends one turn to this app's own model server through `ask()` and renders the
 * answer it returns, with the route badge of the model that produced it.
 * `onMedia` receives the reply's [[image: …]] requests once the text is up, so
 * a slow generation never holds the answer back.
 *
 * `cancel` pauses the running turn: the gateway aborts the model's stream (so a
 * shared CPU stops working on an answer nobody is waiting for) and the empty
 * answer bubble is dropped.
 */
export default function useXecutrChat({ initialMessages = [], onFiles, onMedia, onFinish }) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);

  const live = useRef({
    messages: initialMessages,
    onFiles,
    onMedia,
    onFinish,
    loading: false,
    turnId: "",
    cancelled: false,
  });
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

  const cancel = useCallback(async () => {
    const turnId = live.current.turnId;
    if (!turnId || !live.current.loading) return;

    live.current.cancelled = true;
    live.current.loading = false;
    live.current.turnId = "";
    setLoading(false);
    setPaused(true);

    // The answer bubble is empty until the reply lands, so removing it is the
    // whole of "nothing was produced".
    setMessages((prev) => prev.filter((m) => m.role === "user" || (m.parts && m.parts.length > 0)));

    await abortTurn({ data: { turnId } }).catch(() => {});
  }, []);

  const send = useCallback(async ({ text, providerId = "", model = "", attachments = [], projectId = null, keys = null, mode = "build" }) => {
    if (live.current.loading) return;

    const turnId = nextTurnId();
    const userMessage = { id: nextId(), role: "user", parts: [{ type: "text", content: text }] };
    const assistantId = nextId();
    const history = [...live.current.messages, userMessage]
      .map((m) => ({ role: m.role, content: textOfMessage(m) }))
      .filter((m) => m.content)
      .slice(-20);

    live.current.loading = true;
    live.current.turnId = turnId;
    live.current.cancelled = false;
    setLoading(true);
    setPaused(false);
    setError(null);
    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", parts: [] }]);

    try {
      const result = await ask({
        data: { prompt: text, messages: history, projectId, providerId, model, attachments, keys, mode, turnId },
      });
      if (live.current.cancelled) return;

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
                route: result?.routes || [],
                parts: reply ? [{ type: "text", content: reply }] : [],
              }
            : m,
        ),
      );

      if (result?.files?.length) live.current.onFiles?.(result.files);
      // A plan turn generates nothing: the model may still mark media, so the
      // guard lives here rather than trusting the reply.
      const wanted = mode === "plan" ? [] : requests;
      if (wanted.length) live.current.onMedia?.(wanted, assistantId);

      if (reply) {
        live.current.onFinish?.({
          text: reply,
          provider: result?.providerName,
          model: result?.modelLabel,
          route: result?.routes || [],
        });
      }
    } catch (err) {
      if (!live.current.cancelled) setError(err?.message || "The model server did not answer.");
    } finally {
      if (!live.current.cancelled) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.parts.length > 0));
      }
      live.current.loading = false;
      live.current.turnId = "";
      setLoading(false);
    }
  }, []);

  return { messages, send, cancel, isLoading, paused, error, attachMedia };
}