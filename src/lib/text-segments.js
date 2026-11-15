const FENCE = /```([^\n]*)\n([\s\S]*?)```/g;

/** The media tool's markers: the app turns these into real files. */
const MEDIA_MARK = /\[\[\s*(image|video|music)\s*:\s*([^\]]{3,900})\]\]/gi;

/**
 * The system prompt's own examples come back verbatim from a lazy model (most
 * often inside a plan), so a marker filled with the template is not a request.
 */
const PLACEHOLDERS = new Set([
  "a vivid one-sentence description",
  "genre, instruments, tempo and mood",
]);

/**
 * Pull `[[image: …]]` / `[[video: …]]` / `[[music: …]]` markers out of a reply.
 * What is left is what the user reads; each marker becomes one request.
 */
export function splitMedia(text = "") {
  const requests = [];
  const rest = text.replace(MEDIA_MARK, (_whole, kind, prompt) => {
    const clean = prompt.replace(/\s+/g, " ").trim();
    if (clean && !PLACEHOLDERS.has(clean.toLowerCase())) requests.push({ kind: kind.toLowerCase(), prompt: clean });
    return "";
  });
  return { text: rest.replace(/\n{3,}/g, "\n\n").trim(), requests };
}

/**
 * The pinned-task markers. The harness keeps a project's task list current from
 * them, so work that must survive context trimming is written down rather than
 * remembered by the model.
 */
const TASK_MARK = /\[\[\s*task\s*:\s*([^\]]{3,300})\]\]/gi;
const DONE_MARK = /\[\[\s*done\s*:\s*([^\]]{3,300})\]\]/gi;

/** Pull `[[task: …]]` / `[[done: …]]` markers out of a reply. */
export function splitTasks(text = "") {
  const requests = [];

  const withoutTasks = text.replace(TASK_MARK, (_whole, title) => {
    const clean = title.replace(/\s+/g, " ").trim();
    if (clean) requests.push({ kind: "task", text: clean });
    return "";
  });

  const rest = withoutTasks.replace(DONE_MARK, (_whole, title) => {
    const clean = title.replace(/\s+/g, " ").trim();
    if (clean) requests.push({ kind: "done", text: clean });
    return "";
  });

  return { text: rest.replace(/\n{3,}/g, "\n\n").trim(), requests };
}

/**
 * Split an assistant reply into prose, code and file segments.
 * A fence whose header is `file path="…"` is a file, anything else is code.
 */
export function parseSegments(text = "") {
  const segments = [];
  let cursor = 0;
  let match;
  FENCE.lastIndex = 0;

  while ((match = FENCE.exec(text)) !== null) {
    const [whole, header, body] = match;
    if (match.index > cursor) {
      const prose = text.slice(cursor, match.index).trim();
      if (prose) segments.push({ type: "text", content: prose });
    }
    const fileMatch = /^file\s+path=["']([^"']+)["']/i.exec(header.trim());
    if (fileMatch) {
      segments.push({ type: "file", path: fileMatch[1], content: body.replace(/\n$/, "") });
    } else {
      segments.push({
        type: "code",
        language: header.trim() || "text",
        content: body.replace(/\n$/, ""),
      });
    }
    cursor = match.index + whole.length;
  }

  const rest = text.slice(cursor).trim();
  if (rest) segments.push({ type: "text", content: rest });
  return segments;
}

/** Every file block a reply declared, for clients that have storage. */
export function fileBlocks(text = "") {
  return parseSegments(text)
    .filter((s) => s.type === "file")
    .map((s) => ({ path: s.path, content: s.content }));
}

/** The reply's prose with fences removed — what gets stored as the message body. */
export function plainText(text = "") {
  return splitTasks(splitMedia(text.replace(FENCE, (_m, _h, body) => body)).text).text
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textOfMessage(message) {
  return (message?.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => p.content)
    .join("\n")
    .trim();
}