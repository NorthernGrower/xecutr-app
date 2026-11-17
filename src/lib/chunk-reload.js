/**
 * A tab can outlive the build it was opened on. Reloading for a chunk that fails
 * to load is one cure; the other is noticing, before anything fails, that the
 * server is running a newer build than the tab. That check runs when the tab is
 * brought back into view — the moment someone returns to it — and never while a
 * turn is streaming (a reload would cut the answer off).
 */
const buildSeen = { checked: 0 };

/** Is the server on a different build than this document? */
export const checkBuild = async (current) => {
  if (typeof window === "undefined" || !current) return false;
  // Once a minute at most, and never twice within the guard window.
  if (Date.now() - buildSeen.checked < 60000) return false;
  buildSeen.checked = Date.now();

  try {
    const res = await fetch("/api/build", { cache: "no-store" });
    if (!res.ok) return false;
    const body = await res.json();
    if (!body?.build || body.build === current) return false;
    return reloadForChunkError();
  } catch {
    return false;
  }
};

/** Check the build whenever the tab comes back to the front. */
export const watchBuild = (current) => {
  if (typeof window === "undefined") return () => {};

  const maybe = () => {
    if (document.visibilityState === "hidden") return;
    checkBuild(current);
  };

  window.addEventListener("focus", maybe);
  document.addEventListener("visibilitychange", maybe);
  return () => {
    window.removeEventListener("focus", maybe);
    document.removeEventListener("visibilitychange", maybe);
  };
};
const KEY = "xecutr:reload-at";
const RETRY_WINDOW = 15000;

const PATTERNS = [
  /importing a module script failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /unable to preload css/i,
  /loading chunk \w+ failed/i,
];

const textOf = (error) =>
  `${error?.message || error || ""} ${typeof error?.stack === "string" ? error.stack : ""}`;

/** Is this error a script file that could not be loaded, rather than app logic? */
export const isChunkError = (error) => PATTERNS.some((pattern) => pattern.test(textOf(error)));

/** Reload the document once; false when that was already tried moments ago. */
export const reloadForChunkError = () => {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < RETRY_WINDOW) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* no storage (private mode): one reload is still better than a dead page */
  }
  window.location.reload();
  return true;
};

/**
 * Catch a chunk that failed outside the router's own error boundary — a script
 * tag the document loads by itself, or a preload started before React mounted.
 */
export const watchChunkErrors = () => {
  if (typeof window === "undefined") return () => {};

  const onError = (event) => {
    const failedScript = event?.target?.tagName === "SCRIPT";
    const error = event?.error || event?.reason || event?.message;
    if (failedScript || isChunkError(error)) reloadForChunkError();
  };

  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onError);
  return () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onError);
  };
};