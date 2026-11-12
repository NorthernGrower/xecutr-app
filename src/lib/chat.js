import { chat, maxIterations, toolDefinition } from "@tanstack/ai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gatewayModel } from "@/lib/ai.server";
import { GATEWAY, providerById } from "@/lib/providers";

const MAX_ROUNDS = 3;
const MAX_FILE_CHARS = 60000;
const MAX_READ_CHARS = 24000;

const SYSTEM_BASE = `You are xecutr, a coding agent that turns a prompt into a complete, runnable project.

Rules:
- Write real, working code. No placeholders, no "TODO: implement", no filler.
- Use write_file for every file you create or change, always with the file's full final content.
- Read before you rewrite: call list_files and read_file on files you are about to change.
- Keep the reply short: one or two sentences on what you did, then the paths you touched.
- If the user attached a file, call inspect_file before saying anything about it.
- Match the requested stack. If none is given, choose the simplest option that runs immediately.`;

const languageOf = (path) => {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const map = {
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    rs: "rust",
    go: "go",
  };
  return map[ext] || "text";
};

const projectTools = (base44, projectId, attachments) => {
  const files = () => base44.entities.ProjectFile.filter({ project_id: projectId }, "path", 100);

  const listFiles = toolDefinition({
    name: "list_files",
    description: "List the project's current files with their sizes.",
    inputSchema: z.object({}),
  }).server(async () => {
    const rows = await files();
    return rows.map((r) => ({ path: r.path, chars: (r.content || "").length }));
  });

  const readFile = toolDefinition({
    name: "read_file",
    description: "Read the current content of one project file.",
    inputSchema: z.object({ path: z.string().max(300) }),
  }).server(async ({ path }) => {
    const rows = await files();
    const hit = rows.find((r) => r.path === path);
    if (!hit) return { error: `no file at ${path}` };
    return { path, content: (hit.content || "").slice(0, MAX_READ_CHARS) };
  });

  const writeFile = toolDefinition({
    name: "write_file",
    description: "Create or replace a project file with its complete content.",
    inputSchema: z.object({
      path: z.string().max(300).describe("Relative path, e.g. src/index.ts"),
      content: z.string().max(MAX_FILE_CHARS),
    }),
  }).server(async ({ path, content }) => {
    const rows = await files();
    const hit = rows.find((r) => r.path === path);
    const data = { content, language: languageOf(path), size: content.length };
    if (hit) {
      await base44.entities.ProjectFile.update(hit.id, data);
      return { path, updated: true };
    }
    await base44.entities.ProjectFile.create({ project_id: projectId, path, ...data });
    return { path, created: true };
  });

  const deleteFile = toolDefinition({
    name: "delete_file",
    description: "Delete one project file.",
    inputSchema: z.object({ path: z.string().max(300) }),
  }).server(async ({ path }) => {
    const rows = await files();
    const hits = rows.filter((r) => r.path === path);
    for (const hit of hits) await base44.entities.ProjectFile.delete(hit.id);
    return { path, deleted: hits.length };
  });

  const fetchUrl = toolDefinition({
    name: "fetch_url",
    description: "Fetch a public URL and return its text (first 20000 characters).",
    inputSchema: z.object({ url: z.string().max(2000) }),
  }).server(async ({ url }) => {
    try {
      const res = await fetch(url, { headers: { "user-agent": "xecutr-agent" } });
      const text = await res.text();
      return { status: res.status, text: text.slice(0, 20000) };
    } catch (err) {
      return { error: String(err?.message || err) };
    }
  });

  const tools = [listFiles, readFile, writeFile, deleteFile, fetchUrl];

  if (attachments.length) {
    tools.push(
      toolDefinition({
        name: "inspect_file",
        description: "Read an artifact the user attached to this turn. Call this before describing it.",
        inputSchema: z.object({ name: z.string().max(300) }),
      }).server(async ({ name }) => {
        const hit = attachments.find((a) => a.name === name) || attachments[0];
        if (!hit) return { error: "no attachment with that name" };
        return { name: hit.name, content: hit.content.slice(0, MAX_READ_CHARS) };
      }),
    );
  }

  return tools;
};

const providerAnswers = async (baseURL, apiKey) => {
  try {
    const res = await fetch(`${baseURL}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
};

/**
 * One streaming turn. Used by the workspace chat and the signed-out trial, so
 * the streaming format, the tool loop and the provider routing exist once.
 */
export const streamTurn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            content: z.string().max(MAX_FILE_CHARS),
          }),
        )
        .min(1)
        .max(24),
      projectId: z.string().max(64).nullish(),
      providerId: z.string().max(32).nullish(),
      model: z.string().max(160).nullish(),
      apiKey: z.string().max(600).nullish(),
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

    const projectId = user && data.projectId ? data.projectId : null;
    const attachments = data.attachments ?? [];

    let existing = [];
    let notes = [];
    if (projectId) {
      try {
        existing = await base44.entities.ProjectFile.filter({ project_id: projectId }, "path", 60);
        notes = await base44.entities.MemoryNote.filter({ project_id: projectId }, "-created_date", 30);
      } catch {
        existing = [];
        notes = [];
      }
    }

    const prompts = [SYSTEM_BASE];

    if (projectId) {
      prompts.push(
        existing.length
          ? `The project currently holds these files:\n${existing
              .map((f) => `- ${f.path}`)
              .join("\n")}\nChange them in place rather than starting over.`
          : "The project is empty. Create the files this project needs.",
      );
    } else {
      prompts.push(
        "This is a keyless trial turn with no project storage. Emit every file as a fenced block in this exact form:\n" +
          '```file path="src/index.js"\n<full file content>\n```\nThen a one-line note on what it does.',
      );
    }

    if (notes.length) {
      prompts.push(
        `Project memory (most recent first):\n${notes
          .map((n) => `- ${n.note}`)
          .slice(0, 30)
          .join("\n")}`,
      );
    }

    const requested =
      data.providerId && data.providerId !== GATEWAY.id ? providerById(data.providerId) : null;

    let adapter = gatewayModel(base44, "automatic");
    if (requested && data.apiKey) {
      const live = await providerAnswers(requested.baseURL, data.apiKey);
      if (live) {
        adapter = openaiCompatibleText(data.model || requested.defaultModel, {
          name: requested.id,
          baseURL: requested.baseURL,
          apiKey: data.apiKey,
        });
      }
    }

    return chat({
      adapter,
      messages: data.messages,
      systemPrompts: prompts,
      tools: projectId ? projectTools(base44, projectId, attachments) : [],
      agentLoopStrategy: maxIterations(MAX_ROUNDS),
    });
  });

/** Live model list for one provider, discovered from its own /models endpoint. */
export const discoverModels = createServerFn({ method: "POST" })
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