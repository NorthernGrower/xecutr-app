import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUserRoute } from "@/lib/auth-middleware";
import { analyzeWebsite } from "@/lib/inspect/website";
import { analyzeRepository } from "@/lib/inspect/repository";
import { analyzeBinary } from "@/lib/inspect/binary";

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("website"), url: z.string().max(2000) }),
  z.object({
    mode: z.literal("binary"),
    url: z.string().max(2000),
  }),
  z.object({
    mode: z.literal("repository"),
    repo: z
      .string()
      .max(140)
      .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "Use owner/repo"),
    branch: z.string().max(120).optional(),
  }),
]);

/** The signed-in user's own GitHub connection, read server-side so private repositories work. */
const tokenFor = async (context) => {
  try {
    const rows = await context
      .getBase44()
      .asServiceRole.entities.GitHubLink.filter({ user_id: context.user.id }, "-created_date", 1);
    return rows[0]?.token || null;
  } catch {
    return null;
  }
};

export const Route = createFileRoute("/api/agent/inspect")({
  server: {
    middleware: [requireUserRoute],
    handlers: {
      POST: async ({ request, context }) => {
        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Send a JSON body." }, { status: 400 });
        }

        const parsed = Body.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            {
              error: "Invalid inspection request.",
              issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
            },
            { status: 400 },
          );
        }

        const input = parsed.data;
        try {
          if (input.mode === "website") return Response.json(await analyzeWebsite(input.url));
          if (input.mode === "binary") return Response.json(await analyzeBinary(input.url));
          return Response.json(await analyzeRepository(input.repo, input.branch, await tokenFor(context)));
        } catch (err) {
          return Response.json({ error: String(err?.message || err) }, { status: 502 });
        }
      },
    },
  },
});