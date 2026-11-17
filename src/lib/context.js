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
 * intent and the answer are.
 *
 * Both ends of the trimmed stretch are kept: where the work began (the original
 * brief, the decisions that set the plan) and where it joined the live window.
 * The gap between them is named rather than filled, so the digest stays small.
 */
export function digestOf(dropped = [], { chars = DIGEST_CHARS } = {}) {
  if (!dropped.length) return "";

  const line = (turn) => {
    const text = squeeze(turn?.content, turn?.role === "user" ? 200 : 300);
    if (!text) return "";
    return turn?.role === "user" ? `- they asked: ${text}` : `- it replied: ${text}`;
  };

  const headBudget = Math.round(chars * 0.4);
  const tailBudget = chars - headBudget;

  const head = [];
  let headUsed = 0;
  let headTurns = 0;
  for (let index = 0; index < dropped.length; index += 1) {
    const text = line(dropped[index]);
    headTurns = index + 1;
    if (!text) continue;
    if (headUsed + text.length > headBudget) break;
    head.push(text);
    headUsed += text.length + 1;
  }

  const tail = [];
  let tailUsed = 0;
  let tailTurns = 0;
  for (let index = dropped.length - 1; index >= headTurns; index -= 1) {
    const text = line(dropped[index]);
    if (!text) continue;
    if (tailUsed + text.length > tailBudget) break;
    tail.unshift(text);
    tailUsed += text.length + 1;
    tailTurns += 1;
  }

  const between = dropped.length - headTurns - tailTurns;
  const parts = [];
  if (head.length) {
    parts.push("Where this conversation started:");
    parts.push(...head);
  }
  if (between > 0) {
    parts.push(`- ${between} turn${between === 1 ? "" : "s"} in between, not repeated here`);
  }
  if (tail.length) {
    parts.push("Just before the current window:");
    parts.push(...tail);
  }

  return parts.join("\n");
}


/** The files a project normally starts from, worth including unprompted. */
const ENTRY_FILE =
  /(^|\/)(index\.html?|package\.json|readme\.md|main\.(jsx?|tsx?|py)|app\.(jsx?|tsx?)|src\/app\.(jsx?|tsx?)|vite\.config\.js|next\.config\.js)$/i;

/**
 * Which of a project's files travel with this turn.
 *
 * Sending every file of an 80-file project wastes the window and, on this
 * server's own models, takes minutes to read. So the model gets the whole file
 * *list* (the index) plus the full text of the few that matter now:
 *
 *   - files the message names, by path or file name;
 *   - what changed most recently — the work in progress;
 *   - the project's entry points (index.html, package.json, app entry, README);
 *   - then as many more as fit, smallest first.
 */
export function pickFiles(all = [], asked = "", { max = 14, chars = 60000 } = {}) {
  const prompt = String(asked || "").toLowerCase();
  const picked = new Map();
  const add = (file) => {
    if (file?.path && !picked.has(file.path)) picked.set(file.path, file);
  };

  for (const file of all) {
    const path = file.path.toLowerCase();
    const base = path.split("/").pop();
    if (prompt.includes(path) || (base.length > 3 && prompt.includes(base))) add(file);
  }

  [...all]
    .sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")))
    .slice(0, 6)
    .forEach(add);

  for (const file of all) if (ENTRY_FILE.test(file.path)) add(file);

  const out = [];
  let used = 0;
  const consider = (file) => {
    if (out.length >= max) return;
    const content = String(file.content || "");
    if (!content) return;
    if (used + content.length > chars) return;
    out.push({ path: file.path, content });
    used += content.length;
  };

  for (const file of [...picked.values()].sort((a, b) => (a.size || 0) - (b.size || 0))) {
    consider(file);
  }

  // Nothing matched: the smallest few are still better than an empty prompt.
  if (!out.length) {
    [...all]
      .sort((a, b) => (a.size || 0) - (b.size || 0))
      .slice(0, max)
      .forEach(consider);
  }

  return out;
}
