import { useEffect } from "react";

/**
 * How much of the window the on-screen keyboard is covering.
 *
 * A phone keyboard does not resize the layout viewport — a 100dvh column keeps
 * its full height — so the bottom of the chat (the prompt, and the task strip
 * under it) ends up behind the keys. The visual viewport does shrink, and the
 * difference between the two is the keyboard.
 *
 * The size is written to `--kb-inset` on the document element, and the chat pads
 * its bottom by that much, so the prompt and the task input stay above the keys
 * instead of under them.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    let frame = 0;
    const root = document.documentElement;

    const typing = () => {
      const active = document.activeElement;
      if (!active) return false;
      return (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable === true
      );
    };

    const apply = () => {
      // Safari reports the space under the visual viewport, so subtract both.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // A small difference is the address bar, not a keyboard.
      const inset = typing() && covered > 80 ? Math.min(400, Math.round(covered)) : 0;
      root.style.setProperty("--kb-inset", `${inset}px`);
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);

    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      root.style.setProperty("--kb-inset", "0px");
    };
  }, []);
}

export default useKeyboardInset;
