import { createFileRoute } from "@tanstack/react-router";
import { BUILD } from "@/lib/build";

/**
 * Which build this server is running. A tab that was left open holds an older
 * bundle; comparing this on focus is how it learns to reload instead of running
 * yesterday's code (a preview that still asks for a service token, say).
 */
export const Route = createFileRoute("/api/build")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ build: BUILD }, { headers: { "cache-control": "no-store" } }),
    },
  },
});
