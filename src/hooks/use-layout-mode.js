import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "xecutr:layout";

export const LAYOUT_CHOICES = [
  { id: "auto", label: "auto (follow this device)" },
  { id: "mobile", label: "mobile layout" },
  { id: "desktop", label: "desktop layout" },
];

/**
 * Which of the two layouts this device should get.
 *
 * The app has a phone layout (one pane at a time, bottom tabs, thumb-sized
 * targets) and a desktop one (rail, two panes, inline navigation). The choice is
 * automatic: a narrow screen, or a touch-first screen that is not a large
 * tablet, gets the mobile layout. A person can override it — "desktop layout" on
 * a phone that is wide in landscape, "mobile layout" in a narrow desktop window —
 * and that choice is remembered on the device.
 */
export function detectLayout() {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth || 1024;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  if (width < 768) return "mobile";
  // A tablet is touch-first but has the room for the desktop layout, up to a point.
  if (coarse && width < 900) return "mobile";
  return "desktop";
}

const readPreference = () => {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return ["auto", "mobile", "desktop"].includes(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
};

export function useLayoutMode() {
  const [preference, setPreferenceState] = useState(readPreference);
  const [mode, setMode] = useState(() =>
    readPreference() === "auto" ? detectLayout() : readPreference(),
  );

  useEffect(() => {
    const resolve = () => setMode(preference === "auto" ? detectLayout() : preference);
    resolve();

    // Both the media query and the resize listener: a rotation can cross the
    // breakpoint without a resize event on some phones.
    const query = window.matchMedia?.("(max-width: 899px)");
    query?.addEventListener?.("change", resolve);
    window.addEventListener("resize", resolve);
    window.addEventListener("orientationchange", resolve);

    return () => {
      query?.removeEventListener?.("change", resolve);
      window.removeEventListener("resize", resolve);
      window.removeEventListener("orientationchange", resolve);
    };
  }, [preference]);

  const setPreference = useCallback((next) => {
    const value = ["auto", "mobile", "desktop"].includes(next) ? next : "auto";
    setPreferenceState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage unavailable — the choice still holds for this visit */
    }
  }, []);

  return { mode, preference, setPreference, isMobile: mode === "mobile" };
}

export default useLayoutMode;
