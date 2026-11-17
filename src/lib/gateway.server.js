import { secrets } from "base44:runtime";
import { spendTrialTurn } from "@/lib/trial-quota.server";
import { forwardableKeys } from "@/lib/xecutr.server";
import { CONTEXT_TOKENS, TRIAL_TOKENS, digestOf, keepWindow, pickFiles } from "@/lib/context";

/**
 * The window the owner chose: 15,000 tokens per signed-in turn, which fits every
 * model in the chain and keeps a CPU turn's prompt evaluation short. A
 * deployment can move it without a code change by setting the
 * XECUTR_CONTEXT_TOKENS secret.
 */
const contextTokens = () => {
  try {
    const value = Number(secrets.get("XECUTR_CONTEXT_TOKENS"));
    return Number.isFinite(value) && value >= 2000 ? value : CONTEXT_TOKENS;
  } catch {
    return CONTEXT_TOKENS;
  }
};

const MAX_MESSAGE_CHARS = 7800; // the model server accepts 8k per message

/**
 * The model the caller pinned, passed through untouched. The gateway validates
 * it against each provider's live model list, so a retired id falls back to the
 * best model that provider still offers instead of failing the turn with a 404.
 */
const localModel = async (data) => data.model || "";

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
  "\n\n[MODE: PLAN ONLY] Do not write, create, modify or delete any files, and do not run any tool that changes anything. Do not emit [[image: …]] or [[video: …]] markers either — media generation happens only when the user asks for it after approving the plan. Study the conversation and the project files provided, then reply with the plan you would follow: what you would build or change, which files are involved, and the order of work. Building starts only after the user approves the plan.";

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

  const projectId = user && data.projectId ? data.projectId : null;

  /**
   * The conversation comes from the project's saved turns, not from the browser:
   * closing the tab, switching device or coming back tomorrow must not reset
   * what the model knows. Signed out there is no project to read from, so the
   * trial sends the short history it holds itself.
   */
  let history = null;
  if (projectId) {
    try {
      // Newest first, then reversed: with an ascending sort and a limit the API
      // hands back the *oldest* turns, which would leave a long thread without
      // the recent ones.
      const rows = await base44.entities.Message.filter({ project_id: projectId }, "-created_date", 400);
      history = (rows || [])
        .slice()
        .reverse()
        .map((row) => ({
          role: row.role === "assistant" ? "assistant" : "user",
          content: String(row.content || ""),
        }))
        .filter((m) => m.content.trim());
    } catch {
      history = null;
    }
  }

  if (!history?.length) {
    history = data.messages?.length ? data.messages : [{ role: "user", content: data.prompt || "" }];
  }

  // The newest turns in full; everything older is condensed below, so trimming
  // never loses the thread.
  const windowed = keepWindow(history, {
    tokens: anonymous ? TRIAL_TOKENS : contextTokens(),
  });

  const messages = windowed.kept.map((m) => ({
    role: m.role,
    text: (m.content || "").slice(0, anonymous ? 4000 : MAX_MESSAGE_CHARS),
  }));

  const attachments = (data.attachments ?? []).slice(0, anonymous ? 2 : 3).map((a) => ({
    name: a.name,
    content: (a.content || "").slice(0, anonymous ? 8000 : 120000),
    uploadId: anonymous ? null : a.uploadId || null,
    image: typeof a.image === "string" ? a.image : "",
  }));

  // Pasted images ride as data URLs: the model analyses the bytes, not a note
  // about a file it cannot see.
  const images = attachments
    .map((a) => a.image)
    .filter((value) => value.startsWith("data:image/"))
    .slice(0, 3);

  const uploads = attachments.filter((a) => a.uploadId).map((a) => ({ id: a.uploadId, name: a.name }));

  let files = [];
  let fileIndex = [];
  let memory = [];
  let tasks = [];
  let projectName = "";
  if (projectId) {
    try {
      const project = await base44.entities.Project.get(projectId).catch(() => null);
      projectName = project?.name || "";

      // The whole file list is cheap; the whole of every file is not. The model
      // gets the index and the few files this turn is about.
      const rows = await base44.entities.ProjectFile.filter({ project_id: projectId }, "path", 400);
      const all = (rows || [])
        .filter((row) => row?.path)
        .map((row) => ({
          path: row.path,
          content: row.content || "",
          size: Number(row.size) || (row.content || "").length,
          updated: row.updated_date || row.created_date || "",
        }));

      fileIndex = all.map((file) => ({ path: file.path, size: file.size })).slice(0, 400);
      const asked = [...messages].reverse().find((m) => m.role === "user")?.text || "";
      files = pickFiles(all, asked);
      const notes = await base44.entities.MemoryNote.filter({ project_id: projectId }, "-created_date", 20);
      memory = notes.map((n) => n.note).filter(Boolean);

      // What fell out of the live window, said in a few lines. The stored turns
      // are untouched — this only carries their intent into the next request.
      const digest = digestOf(windowed.dropped);
      if (digest) memory = [digest, ...memory];

      // The pinned task list is the memory that survives trimming: it travels
      // with every turn, oldest first so it reads like a plan.
      const taskRows = await base44.entities.AgentTask.filter({ project_id: projectId }, "-created_date", 40);
      tasks = (taskRows || [])
        .filter((task) => task.title)
        .slice(0, 30)
        .map((task) => ({ title: task.title, status: task.status || "queued", note: task.note || "" }))
        .reverse();
    } catch {
      files = [];
      fileIndex = [];
      memory = [];
      tasks = [];
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
    messages: withAttachments(
      messages,
      attachments.filter((a) => !a.image),
    ),
    target: "Web app",
    providerId: data.providerId || "",
    model: await localModel(data),
    turnId: data.turnId || "",
    // The gateway keeps the project's files on its own disk under this name.
    projectId: projectId || "",
    projectName,
    images,
    allowPaid: false,
    memory,
    files,
    fileIndex,
    tasks,
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
  /** Every route the gateway announced: the model, why, and any escalation. */
  const routes = [];

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
      routes.push({
        provider: providerName,
        model: modelLabel,
        reason: typeof event.reason === "string" ? event.reason : "",
        escalated: Boolean(event.escalated),
        from: typeof event.from === "string" ? event.from : "",
      });
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
  return { text, files, providerName, modelLabel, routes };
}