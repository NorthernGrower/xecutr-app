import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { providerById } from "@/lib/providers";
import { buildTurn, readTurn } from "@/lib/gateway.server";
import { fetchHealth, fetchProviders, forwardableKeys, postChat, postUpload } from "@/lib/xecutr.server";

const MAX_TURN_CHARS = 60000;
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

/** One turn's shape, shared by the streaming route and ask(). */
export const turnSchema = z.object({
  // `prompt` is the user's own text; `messages` is the conversation around it.
  prompt: z.string().max(MAX_TURN_CHARS).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(MAX_TURN_CHARS),
      }),
    )
    .min(1)
    .max(24)
    .optional(),
  projectId: z.string().max(64).nullish(),
  providerId: z.string().max(64).nullish(),
  model: z.string().max(160).nullish(),
  // "plan" asks for a plan and no file writes; "build" (the default) may build.
  mode: z.enum(["plan", "build"]).optional(),
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
});

/**
 * The project chat's answer path: one turn against this app's own model server,
 * returned whole as { text, files, providerName, modelLabel }.
 */
export const ask = createServerFn({ method: "POST" })
  .validator(turnSchema)
  .handler(async ({ data, context }) => readTurn(await postChat(await buildTurn(data, context))));

/** The server's provider catalogue with its live model lists, for the picker. */
export const xecutrCatalog = createServerFn({ method: "POST" })
  .validator(z.object({ keys: z.record(z.string().max(32), z.string().max(600)).optional() }).optional())
  .handler(({ data }) => fetchProviders(forwardableKeys(data?.keys)));

/** Model server liveness (GET /api/health). */
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