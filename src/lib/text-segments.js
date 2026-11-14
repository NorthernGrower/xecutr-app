const FENCE = /```([^\n]*)\n([\s\S]*?)```/g;

/** The media tool's markers: the app turns these into real files. */
const MEDIA_MARK = /\[\[\s*(image|video)\s*:\s*([^\]]{3,900})\]\]/gi;

/**
 * Pull `[[image: …]]` / `[[video: …]]` markers out of a reply. What is left is
 * what the user reads; each marker becomes one generation request.
 */
export function splitMedia(text = "") {
  const requests = [];
  const rest = text.replace(MEDIA_MARK, (_whole, kind, prompt) => {
    const clean = prompt.replace(/\s+/g, " ").trim();
    if (clean) requests.push({ kind: kind.toLowerCase(), prompt: clean });
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
  return splitMedia(text.replace(FENCE, (_m, _h, body) => body)).text.replace(/\n{3,}/g, "\n\n").trim();
}

export function textOfMessage(message) {
  return (message?.parts ?? [])
    .filter((p) => p.type === "text")
    .map((p) => p.content)
    .join("\n")
    .trim();
}