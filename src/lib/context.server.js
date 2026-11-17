/**
 * How much of a conversation travels with one request, and what happens to the
 * rest.
 *
 * Nothing is thrown away: every turn stays a Message row in the project, so
 * closing the browser, changing device or coming back tomorrow changes nothing.
 * A request would be wasteful — and for this server's own models, impossible —
 * if every stored turn were sent, so the newest turns go in full and everything
 * older is condensed into a digest that rides along as a memory note.
 *
 * The budget is measured in tokens, estimated at four characters each: close
 * enough for English and code, and every model server does its own exact count
 * before it generates.
 */

const CHARS_PER_TOKEN = 4;
/** Turns kept in full for a signed-in project turn (~15k tokens). */
export const CONTEXT_TOKENS = 15000;
/** Signed-out trial: short and cheap. */
export const TRIAL_TOKENS = 2000;
/** The digest itself is capped so it can never crowd out the live window. */
const DIGEST_CHARS = 5000;

export const estimateTokens = (text = "") => Math.ceil(String(text).length / CHARS_PER_TOKEN);

/** Progressively lower context budgets, for when a fast check says too big. */
export const contextSteps = (tokens = CONTEXT_TOKENS) =>
  [tokens, Math.round(tokens / 2), Math.round(tokens / 4), 2000].filter(
    (value, index, all) => value >= 2000 && all.indexOf(value) === index,
  );

const CODE_BLOCK = /```[\s\S]*?```/g;

const squeeze = (text, max) =>
  String(text || "")
    .replace(CODE_BLOCK, " (code) ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/**
 * The newest turns that fit the budget, plus the older ones that did not. The
 * last turn is always kept, however long it is: it is the one being answered.
 */
export function keepWindow(turns = [], { tokens = CONTEXT_TOKENS } = {}) {
  const budget = Math.max(1000, tokens) * CHARS_PER_TOKEN;
  const kept = [];
  let used = 0;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const size = String(turn?.content || "").length + 8;
    if (kept.length && used + size > budget) break;
    kept.unshift(turn);
    used += size;
  }

  // A single message over the budget is trimmed by the caller, not dropped.
  return { kept, dropped: turns.slice(0, turns.length - kept.length), used };
}

/**
 * What the trimmed part said, in a few lines: what was asked and what was
 * decided. Code is not repeated here — it lives in the project's files — but the
 * intent and the answer are, so a turn weeks later still knows the thread.
 */
export function digestOf(dropped = [], { chars = DIGEST_CHARS } = {}) {
  if (!dropped.length) return "";

  const lines = [];
  let used = 0;
  let skipped = 0;

  for (let index = dropped.length - 1; index >= 0; index -= 1) {
    const turn = dropped[index];
    const text = squeeze(turn?.content, turn?.role === "user" ? 200 : 300);
    if (!text) continue;

    const line = turn?.role === "user" ? `- they asked: ${text}` : `- it replied: ${text}`;
    if (used + line.length > chars) {
      skipped = index + 1;
      break;
    }
    lines.unshift(line);
    used += line.length + 1;
  }

  if (!lines.length) {
    return skipped ? `${skipped} earlier turns of this conversation (no text kept).` : "";
  }

  const head = skipped
    ? `${skipped} older turn${skipped === 1 ? "" : "s"} of this conversation, condensed:`
    : "Earlier in this conversation, condensed:";

  return `${head}\n${lines.join("\n")}`;
}
