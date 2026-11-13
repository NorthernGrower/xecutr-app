import { spendTrialTurn } from "@/lib/trial-quota.server";
import { fetchProviders, forwardableKeys } from "@/lib/xecutr.server";

const MAX_MESSAGE_CHARS = 7800; // the model server accepts 8k per message
const MAX_CONTEXT_FILES = 40;
const MAX_CONTEXT_CHARS = 300000;

/**
 * The gateway runs one local model server, so a turn can only use a model that
 * server actually has. A pin for some other provider, or a model name that is
 * no longer installed, falls back to the server's own default instead of
 * failing the turn with an upstream 404.
 */
const LOCAL_PROVIDERS = new Set(["", "gateway", "ollama"]);

const localModel = async (data) => {
  const wanted = data.model || "";
  if (!wanted || !LOCAL_PROVIDERS.has(data.providerId || "")) return "";
  const catalogue = await fetchProviders({}).catch(() => null);
  const ollama = (catalogue?.providers || []).find((p) => p.id === "ollama");
  return Array.isArray(ollama?.models) && ollama.models.includes(wanted) ? wanted : "";
};

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
 * Appended to the last prompt in plan mode: think, don't touch. It rides in the
 * user text itself rather than a system message, so the model server honours it
 * whatever role handling it implements.
 */
const PLAN_DIRECTIVE =
  "\n\n[MODE: PLAN ONLY] Do not write, create, modify or delete any files, and do not run any tool that changes anything. Study the conversation and the project files provided, then reply with the plan you would follow: what you would build or change, which files are involved, and the order of work. Building starts only after the user approves the plan.";

/**
 * Assembles one turn for this app's own model server: the caller check, the
 * conversation, attachments, and the project's files and memory notes.
 * Returns the body for the server's POST /api/chat.
 */
export async function buildTurn(data, context) {
  const base44 = context.getBase44();
  let user = null;
  try {
    user = await base44.auth.me();
  } catch {
    user = null;
  }

  // The server answers signed-out visitors too, so a keyless turn is capped
  // in size, carries no project context and counts against a daily allowance.
  const anonymous = !user;
  if (anonymous && !(await spendTrialTurn(context))) {
    throw Object.assign(
      new Error("Today's free trial turns are used up. Sign in to keep building."),
      { status: 429 },
    );
  }

  const turns = data.messages?.length ? data.messages : [{ role: "user", content: data.prompt || "" }];

  const messages = (anonymous ? turns.slice(-10) : turns.slice(-20)).map((m) => ({
    role: m.role,
    text: (m.content || "").slice(0, anonymous ? 4000 : MAX_MESSAGE_CHARS),
  }));

  const attachments = (data.attachments ?? []).slice(0, anonymous ? 2 : 3).map((a) => ({
    name: a.name,
    content: (a.content || "").slice(0, anonymous ? 8000 : 120000),
    uploadId: anonymous ? null : a.uploadId || null,
  }));

  const uploads = attachments.filter((a) => a.uploadId).map((a) => ({ id: a.uploadId, name: a.name }));

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

  if (data.mode === "plan") {
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
      last.text = last.text.slice(0, Math.max(0, MAX_MESSAGE_CHARS - PLAN_DIRECTIVE.length)) + PLAN_DIRECTIVE;
    } else {
      messages.push({ role: "user", text: PLAN_DIRECTIVE });
    }
  }

  return {
    messages: withAttachments(messages, attachments),
    target: "Web app",
    providerId: data.providerId || "",
    model: await localModel(data),
    allowPaid: false,
    memory,
    files,
    rea: uploads.length > 0,
    uploads,
    keys: anonymous ? {} : forwardableKeys(data.keys || {}),
  };
}

/**
 * Reads one whole turn from the model server's stream (route, text, tool,
 * tool_result, files, usage, error, done) and returns the answer with the
 * route that produced it, so a reply can print `providerName · modelLabel`.
 */
export async function readTurn(response) {
  const decoder = new TextDecoder();
  const reader = response?.body?.getReader();

  let text = "";
  let failure = null;
  let providerName = "xecutr";
  let modelLabel = "auto";
  const files = [];

  const handle = (frame) => {
    const payload = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!payload || payload === "[DONE]") return;

    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }

    if (event.type === "route") {
      providerName = event.providerName || event.providerId || providerName;
      modelLabel = event.modelLabel || event.model || modelLabel;
    } else if (event.type === "text") {
      text += event.text || "";
    } else if (event.type === "files") {
      if (Array.isArray(event.files)) files.push(...event.files);
    } else if (event.type === "error") {
      failure = event.message || "The model server failed the turn.";
    }
  };

  if (!reader) {
    handle(typeof response === "string" ? response : (await response?.text?.()) || "");
  } else {
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const cut = buffer.lastIndexOf("\n\n");
      if (cut === -1) continue;
      buffer.slice(0, cut + 2).split("\n\n").forEach(handle);
      buffer = buffer.slice(cut + 2);
    }
    buffer += decoder.decode();
    if (buffer.trim()) buffer.split("\n\n").forEach(handle);
  }

  if (failure) throw Object.assign(new Error(failure), { status: 502 });
  return { text, files, providerName, modelLabel };
}