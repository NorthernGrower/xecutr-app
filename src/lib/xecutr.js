/**
 * Client-side reader for the gateway's event stream: one `data: {json}` frame
 * per event, blank-line separated (route, text, tool, tool_result, files,
 * usage, error, done).
 */
export function parseFrames(chunk, onEvent) {
  for (const frame of chunk.split("\n\n")) {
    const payload = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!payload || payload === "[DONE]") continue;
    try {
      onEvent(JSON.parse(payload));
    } catch {
      /* keep-alive or a partial frame */
    }
  }
}

export async function readAgentStream(response, onEvent) {
  if (!response?.body) {
    const text = typeof response === "string" ? response : await response?.text?.();
    parseFrames(text || "", onEvent);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const cut = buffer.lastIndexOf("\n\n");
    if (cut === -1) continue;
    parseFrames(buffer.slice(0, cut + 2), onEvent);
    buffer = buffer.slice(cut + 2);
  }

  buffer += decoder.decode();
  if (buffer.trim()) parseFrames(buffer, onEvent);
}