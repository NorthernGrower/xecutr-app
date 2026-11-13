import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { spendTrialTurn } from "@/lib/trial-quota.server";
import { providerById } from "@/lib/providers";
import { fetchHealth, fetchProviders, postChat, postUpload } from "@/lib/xecutr.server";

const MAX_TURN_CHARS = 60000;
const MAX_MESSAGE_CHARS = 7800; // the gateway accepts 8k per message
const MAX_CONTEXT_FILES = 40;
const MAX_CONTEXT_CHARS = 300000;
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

/** Text excerpts ride along inside the last prompt; uploads are referenced by id. */
const withAttachments = (messages, attachments) => {
  if (!attachments.length) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return messages;

  let budget = Math.max(0, MAX_MESSAGE_CHARS - last.text.length);
  const notes = attachments.map((a) => {
    if (!a.content) {
      return a.uploadId
        ? `Attached file: ${a.name} — uploaded, inspect it with the file tools.`
        : `Attached file: ${a.name} (binary, not inlined).`;
    }
    const body = a.content.slice(0, budget);
    budget -= body.length;
    const cut = body.length < a.content.length ? " (excerpt)" : "";
    return `Attached file ${a.name}${cut}:\n\`\`\`\n${body}\n\`\`\``;
  });
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
        .array(
          z.object({
            name: z.string().max(300),
            content: z.string().max(200000).optional(),
            uploadId: z.string().max(120).nullish(),
            size: z.number().nullish(),
          }),
        )
        .max(3)
        .optional(),
      keys: z.record(z.string().max(32), z.string().max(600)).optional(),
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

    const messages = (anonymous ? data.messages.slice(-10) : data.messages.slice(-20)).map((m) => ({
      role: m.role,
      text: (m.content || "").slice(0, anonymous ? 4000 : MAX_MESSAGE_CHARS),
    }));

    const attachments = (data.attachments ?? []).slice(0, anonymous ? 2 : 3).map((a) => ({
      name: a.name,
      content: (a.content || "").slice(0, anonymous ? 8000 : 120000),
      uploadId: anonymous ? null : a.uploadId || null,
    }));

    const uploads = attachments
      .filter((a) => a.uploadId)
      .map((a) => ({ id: a.uploadId, name: a.name }));

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
      rea: uploads.length > 0,
      uploads,
      keys: anonymous ? {} : data.keys || {},
    });
  });

/** The gateway's provider catalogue with its live model lists, for the picker. */
export const xecutrCatalog = createServerFn({ method: "POST" })
  .validator(z.object({ keys: z.record(z.string().max(32), z.string().max(600)).optional() }).optional())
  .handler(({ data }) => fetchProviders(data?.keys));

/** Gateway liveness (GET /api/health). */
export const xecutrHealth = createServerFn({ method: "GET" }).handler(() => fetchHealth());

/** POST /api/uploads — one artifact, forwarded for REA inspection. */
export const attachArtifact = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ name: z.string().min(1).max(300), data: z.string().min(1).max(12000000) }))
  .handler(async ({ data }) => {
    const binary = atob(data.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
      throw Object.assign(new Error("That file is over the 8 MB inspection limit."), { status: 413 });
    }
    return postUpload(bytes, data.name);
  });

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