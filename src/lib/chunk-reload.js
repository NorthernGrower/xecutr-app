/**
 * A tab can outlive the build it was opened on. When the app is republished (or
 * the server rebuilds), every route's script file gets a new hashed name, and a
 * page still holding the old names fails to import them: "Importing a module
 * script failed." Nothing inside that document can fix itself — the only cure is
 * a fresh document — so the failure reloads once, and a second failure moments
 * later is shown as an error instead of reloading forever.
 */
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