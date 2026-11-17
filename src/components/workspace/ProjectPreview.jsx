import { useCallback, useEffect, useState } from "react";
import { Copy, Download, ExternalLink, Loader2, RotateCw } from "lucide-react";
import Panel from "@/components/workspace/Panel";
import { prepareProjectSite } from "@/lib/site";
import { downloadZip } from "@/lib/zip";

const NEEDS_BUILD = /\.(jsx|tsx|vue|svelte)$/i;

/**
 * Runs the project from this server's own copy of its files: the app sends the
 * project to the gateway, which serves it at /<slug>, and the pane frames that
 * address. Each reload re-sends the files, so the preview shows the project as
 * it is now.
 */
export default function ProjectPreview({ project, files }) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [copied, setCopied] = useState(false);
  const [stamp, setStamp] = useState(0);

  const projectId = project?.id;

  /** Send the project to the server and return the address that serves it. */
  const prepare = useCallback(async () => {
    if (!projectId) throw new Error("That project is not available.");
    const res = await prepareProjectSite({ data: { projectId } });
    if (res?.error) throw new Error(res.error);
    setAddress(res.url);
    return res.url;
  }, [projectId]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      await prepare();
      setStamp(Date.now());
    } catch (err) {
      setError(err?.message || "The preview could not start.");
    } finally {
      setBusy(false);
    }
  }, [projectId, prepare]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openWindow = async () => {
    if (!projectId || busy) return;
    // Opened inside the click, before any await, so the browser allows it.
    const win = window.open("", "_blank");
    setBusy(true);
    setError(null);
    try {
      const url = await prepare();
      const target = `${url}?r=${Date.now()}`;
      if (win) win.location.replace(target);
      else window.open(target, "_blank", "noopener");
    } catch (err) {
      win?.close();
      setError(err?.message || "The preview could not open.");
    } finally {
      setBusy(false);
    }
  };

  const needsBuild = files.some((f) => NEEDS_BUILD.test(f.path));

  // A project without a page of its own has nothing to frame: say why, and what
  // can be done with it, instead of showing the server's "Not found".
  const hasPage = files.some((file) => /(^|\/)index\.html?$/i.test(file.path || ""));
  const looksLikeServer = files.some((file) => /(^|\/)(server|app|index)\.js$/i.test(file.path || ""));
  const topLevel = [...new Set(files.map((file) => String(file.path || "").split("/")[0]))]
    .filter(Boolean)
    .slice(0, 8);

  return (
    <Panel className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <span className="label-mono">preview</span>
        {busy && <Loader2 className="h-3 w-3 animate-spin text-[#b0c4de]" />}
        {address && !busy && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            title="Copy the preview address"
            className="ml-2 inline-flex min-w-0 items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] text-[#b0c4de] transition hover:border-[#b0c4de]/40"
          >
            <Copy className="h-3 w-3 shrink-0" strokeWidth={1.6} />
            <span className="truncate">{copied ? "copied" : address.replace("https://", "")}</span>
          </button>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={reload}
            disabled={!projectId || busy}
            title="Send the project again and reload the preview"
            className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-30"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={openWindow}
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

      <div className="min-h-0 flex-1">
        {!hasPage ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-white">
              no page to preview
            </p>
            <p className="max-w-md font-body text-[12px] leading-relaxed text-muted-foreground">
              This project has no <span className="font-mono">index.html</span>.{" "}
              {looksLikeServer
                ? "It looks like a server app (Node/Express), which has to be started with `node server.js` — the preview only serves files, it cannot run a server."
                : "Add a page, or ask the model to make one."}
            </p>
            {topLevel.length > 0 && (
              <p className="max-w-md break-words font-mono text-[10.5px] leading-relaxed text-muted-foreground/80">
                {topLevel.join(" · ")}
              </p>
            )}
            <button
              type="button"
              onClick={() => downloadZip(files, project?.name)}
              disabled={!files.length}
              className="inline-flex items-center gap-2 rounded-sm border border-white/15 px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:border-[#b0c4de]/50 hover:text-white disabled:opacity-40"
            >
              <Download className="h-3 w-3" strokeWidth={1.8} />
              download the zip
            </button>
          </div>
        ) : error ? (

          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-body text-[12px] text-red-300">{error}</p>
            <button
              type="button"
              onClick={reload}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-sm border border-white/15 px-4 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:border-[#b0c4de]/50 hover:text-white disabled:opacity-40"
            >
              <RotateCw className="h-3 w-3" strokeWidth={1.8} />
              try again
            </button>
          </div>
        ) : address ? (
          <iframe
            key={`${address}-${stamp}`}
            src={`${address}?r=${stamp}`}
            title={`${project?.name || "project"} preview`}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        ) : (
          <div className="flex h-full items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            sending the project to this server…
          </div>
        )}
      </div>
    </Panel>
  );
}
