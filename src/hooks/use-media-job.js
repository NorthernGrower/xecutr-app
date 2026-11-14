import { useCallback, useEffect, useRef, useState } from "react";
import { mediaJob, startMedia } from "@/lib/media";

const POLL_MS = 3000;
const MAX_POLLS = 1200; // ~an hour — a 32-frame clip on CPU is slow, but not endless

/**
 * One generation at a time: queue it, then follow it until it finishes. The
 * service is serial, so polling a job never blocks the chat turn that asked
 * for it — markers are handled after the reply has already been rendered.
 */
export default function useMediaJob() {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (request) => {
    if (!alive.current) return null;
    setBusy(true);
    setError(null);
    setJob(null);

    try {
      const started = await startMedia({ data: request });
      if (!started?.id) throw new Error(started?.error || "The media service did not accept the job.");
      if (alive.current) setJob(started);

      for (let i = 0; i < MAX_POLLS; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (!alive.current) return null;

        const next = await mediaJob({ data: { id: started.id } });
        if (alive.current) setJob((prev) => ({ ...(prev || {}), ...next }));

        if (next?.status === "done") return next;
        if (next?.status === "error") throw new Error(next.error || "The generation failed.");
      }
      throw new Error("The generation took too long, so it was given up on.");
    } catch (err) {
      const message = err?.message || "The generation failed.";
      if (alive.current) setError(message);
      return null;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  return { job, error, busy, run };
}
