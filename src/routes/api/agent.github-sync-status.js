import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUserRoute } from "@/lib/auth-middleware";

const Body = z.object({ conversation_id: z.string().max(64).optional() });

const RUNNING = ["pending", "running", "in_progress"];
const FAILED = ["failed", "error"];

/**
 * Reads the sync conversation: `done` once the agent has answered and no tool
 * call is still running, `ok` when that answer exists. The workflow uses it to
 * decide whether the build finished before it clears stale previews.
 */
export const Route = createFileRoute("/api/agent/github-sync-status")({
  server: {
    middleware: [requireUserRoute],
    handlers: {
      POST: async ({ request, context }) => {
        if (context.user?.role !== "admin") {
          return Response.json({ error: "Only an admin can read the sync." }, { status: 403 });
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Send a JSON body." }, { status: 400 });
        }
        const parsed = Body.safeParse(body);
        const id = parsed.success ? parsed.data.conversation_id : "";
        if (!id) return Response.json({ done: false, ok: false, reply: "" });

        let conversation = null;
        let readError = "";
        try {
          conversation = await context.getBase44().asServiceRole.agents.getConversation(id);
        } catch (error) {
          readError = error?.message || String(error);
        }
        if (!conversation) {
          return Response.json({ done: false, ok: false, reply: "", error: readError });
        }

        const messages = conversation.messages || [];
        const calls = messages.flatMap((message) => message.tool_calls || []);
        const running = calls.filter((call) => RUNNING.includes(call.status)).length;
        const failed = calls.filter((call) => FAILED.includes(call.status)).length;

        const answer = [...messages]
          .reverse()
          .find((message) => message.role === "assistant" && (message.content || "").trim());

        const done = running === 0 && Boolean(answer);
        return Response.json({
          done,
          ok: done,
          reply: (answer?.content || "").trim().slice(0, 400),
          tool_calls: calls.length,
          failed_tools: failed,
          messages: messages.length,
        });
      },
    },
  },
});