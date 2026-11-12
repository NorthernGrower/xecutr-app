const TRIAL_KEY = "xecutr:trial";

/** The signed-out trial conversation, kept in this browser until signup. */
export function readTrial() {
  if (typeof window === "undefined") return { messages: [] };
  try {
    return JSON.parse(window.localStorage.getItem(TRIAL_KEY) || "null") || { messages: [] };
  } catch {
    return { messages: [] };
  }
}

export function addTrialMessage(role, content) {
  const store = readTrial();
  store.messages = [...(store.messages || []), { role, content }];
  try {
    window.localStorage.setItem(TRIAL_KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable */
  }
}

export function clearTrial() {
  try {
    window.localStorage.removeItem(TRIAL_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const projectNameFrom = (text = "") => {
  const firstLine = text.trim().split("\n")[0].trim();
  const name = firstLine.split(/[.!?]/)[0].trim().slice(0, 48);
  return name || "untitled project";
};