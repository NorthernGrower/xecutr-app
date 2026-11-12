import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, RotateCw } from "lucide-react";
import Panel from "@/components/workspace/Panel";
import { createPreviewLink } from "@/lib/preview-fns";

const NEEDS_BUILD = /\.(jsx|tsx|vue|svelte)$/i;

/**
 * Runs the project from its temporary address in its own window: every file is
 * served as-is, so plain HTML/CSS/JS projects (and ES modules) execute for real.
 */
export default function ProjectPreview({ project, files }) {
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [copied, setCopied] = useState(false);

  const projectId = project?.id;
  const address =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/api/preview/${token}/`
      : "";

  const mint = async () => {
    const res = await createPreviewLink({ data: { projectId } });
    if (res?.error) throw new Error(res.error);
    setToken(res.token);
    return res.token;
  };

  const openWindow = async (regenerate = false) => {
    if (!projectId || busy) return;
    // Opened inside the click, before any await, so the browser allows it.
    const win = window.open("", "_blank");
    setBusy(true);
    setError(null);
    try {
      const active = regenerate || !token ? await mint() : token;
      const url = `${window.location.origin}/api/preview/${active}/?r=${Date.now()}`;
      if (win) win.location.replace(url);
      else window.open(url, "_blank", "noopener");
    } catch (err) {
      win?.close();
      setError(err?.message || "The preview could not open.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!projectId || token) return;
    mint()
      .catch((err) => setError(err?.message || "The preview could not start."))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const needsBuild = files.some((f) => NEEDS_BUILD.test(f.path));

  return (
    <Panel className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <span className="label-mono">preview</span>
        {busy && <Loader2 className="h-3 w-3 animate-spin text-[#b0c4de]" />}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => openWindow(true)}
            disabled={!projectId || busy}
            title="Issue a fresh address and open it"
            className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-30"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={() => openWindow(false)}
            disabled={!projectId || busy}
            title="Open the preview in a new window"
            className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-30"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {needsBuild && (
        <p className="border-b border-white/[0.07] px-3 py-2 font-body text-[11px] leading-relaxed text-[#b0c4de]">
          This project has JSX/TSX files, which need a build step the preview can't run — download
          the zip or push to GitHub to build it locally.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        {error ? (
          <p className="font-body text-[12px] text-red-300">{error}</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openWindow(false)}
              disabled={!projectId || busy}
              className="inline-flex items-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-5 py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:border-[#e0f7ff]/70 hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              open preview
            </button>

            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
              opens in its own window
            </p>

            {address && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                title="Copy the preview address"
                className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] text-[#b0c4de] transition hover:border-[#b0c4de]/40"
              >
                <Copy className="h-3 w-3 shrink-0" strokeWidth={1.6} />
                <span className="truncate">{copied ? "copied" : address}</span>
              </button>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}