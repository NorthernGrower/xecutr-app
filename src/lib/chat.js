import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { spendTrialTurn } from "@/lib/trial-quota.server";
import { providerById } from "@/lib/providers";
import { fetchProviders, postChat } from "@/lib/xecutr.server";

const MAX_TURN_CHARS = 60000;
const MAX_CONTEXT_FILES = 40;
const MAX_CONTEXT_CHARS = 380000;
const MAX_ATTACHMENT_CHARS = 12000;

/** Text attachments ride along inside the last prompt; binaries are named only. */
const withAttachments = (messages, attachments) => {
  if (!attachments.length) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return messages;

  const notes = attachments.map((a) =>
    a.content
      ? `Attached file ${a.name}:\n\`\`\`\n${a.content.slice(0, MAX_ATTACHMENT_CHARS)}\n\`\`\``
      : `Attached file: ${a.name} (binary, not inlined).`,
  );
  return [...messages.slice(0, -1), { ...last, text: `${last.text}\n\n${notes.join("\n\n")}` }];
};

/**
 * One streaming turn, proxied to the xecutr gateway's POST /api/chat. The
 * gateway runs the tool loop and streams SSE (route, text, tool, tool_result,
 * files, usage, error, done); this returns that stream untouched.
 */
export const streamTurn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string().max(MAX_TURN_CHARS),
          }),
        )
        .min(1)
        .max(24),
      projectId: z.string().max(64).nullish(),
      providerId: z.string().max(64).nullish(),
      model: z.string().max(160).nullish(),
      attachments: z
        .array(z.object({ name: z.string().max(300), content: z.string().max(200000) }))
        .max(3)
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }

    // The gateway answers signed-out visitors too, so a keyless turn is capped
    // in size, carries no project context and counts against a daily allowance.
    const anonymous = !user;
    if (anonymous && !(await spendTrialTurn(context))) {
      throw Object.assign(
        new Error("Today's free trial turns are used up. Sign in to keep building."),
        { status: 429 },
      );
    }

    const messages = anonymous
      ? data.messages.slice(-10).map((m) => ({ role: m.role, text: m.content.slice(0, 12000) }))
      : data.messages.map((m) => ({ role: m.role, text: m.content }));

    const attachments = (data.attachments ?? []).slice(0, anonymous ? 2 : 3).map((a) => ({
      name: a.name,
      content: (a.content || "").slice(0, anonymous ? 12000 : 200000),
    }));

    const projectId = user && data.projectId ? data.projectId : null;

    let files = [];
    let memory = [];
    if (projectId) {
      try {
        const rows = await base44.entities.ProjectFile.filter({ project_id: projectId }, "path", MAX_CONTEXT_FILES);
        let budget = MAX_CONTEXT_CHARS;
        files = rows
          .map((f) => ({ path: f.path, content: f.content || "" }))
          .filter((f) => {
            if (f.content.length > budget) return false;
            budget -= f.content.length;
            return true;
          });
        const notes = await base44.entities.MemoryNote.filter({ project_id: projectId }, "-created_date", 20);
        memory = notes.map((n) => n.note).filter(Boolean);
      } catch {
        files = [];
        memory = [];
      }
    }

    return postChat({
      messages: withAttachments(messages, attachments),
      target: "Web app",
      providerId: data.providerId || "",
      model: data.model || "",
      allowPaid: false,
      memory,
      files,
      rea: false,
      uploads: [],
      keys: {},
    });
  });

/** The gateway's provider catalogue with its live model lists, for the picker. */
export const xecutrCatalog = createServerFn({ method: "GET" }).handler(() => fetchProviders());

/** Live model list for one provider, discovered from its own /models endpoint. */
export const discoverModels = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ providerId: z.string().max(32), apiKey: z.string().max(600) }))
  .handler(async ({ data }) => {
    const provider = providerById(data.providerId);
    if (!provider || !provider.baseURL) return { models: [] };
    try {
      const res = await fetch(`${provider.baseURL}/models`, {
        headers: { Authorization: `Bearer ${data.apiKey}` },
      });
      if (!res.ok) return { models: [], error: `provider answered ${res.status}` };
      const body = await res.json();
      const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      const models = rows
        .map((m) => m?.id || m?.name)
        .filter((id) => typeof id === "string")
        .sort()
        .slice(0, 200);
      return { models };
    } catch (err) {
      return { models: [], error: String(err?.message || err) };
    }
  });