import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RotateCw } from "lucide-react";
import Panel from "@/components/workspace/Panel";
import { createPreviewLink } from "@/lib/preview-fns";

const NEEDS_BUILD = /\.(jsx|tsx|vue|svelte)$/i;

/**
 * Runs the project from its temporary address: every file is served as-is, so
 * plain HTML/CSS/JS projects (and ES modules) execute for real.
 */
export default function ProjectPreview({ project, files }) {
  const [token, setToken] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const [reloads, setReloads] = useState(0);

  const projectId = project?.id;

  const start = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createPreviewLink({ data: { projectId } });
      if (res?.error) setError(res.error);
      else setToken(res.token);
    } catch {
      setError("The preview could not start.");
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  useEffect(() => {
    start();
  }, [start]);

  const src = token ? `/api/preview/${token}/?r=${reloads}` : null;
  const needsBuild = files.some((f) => NEEDS_BUILD.test(f.path));

  return (
    <Panel className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <span className="label-mono">preview</span>
        {busy && <Loader2 className="h-3 w-3 animate-spin text-[#b0c4de]" />}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setReloads((n) => n + 1)}
            disabled={!token}
            title="Reload the preview"
            className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-30"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
          <a
            href={src || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!token}
            title="Open the temp address in a new tab"
            className={`rounded-sm border border-white/10 p-1.5 transition hover:border-[#b0c4de]/40 hover:text-white ${
              token ? "text-muted-foreground" : "pointer-events-none text-muted-foreground/40"
            }`}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
          </a>
        </div>
      </div>

      {needsBuild && (
        <p className="border-b border-white/[0.07] px-3 py-2 font-body text-[11px] leading-relaxed text-[#b0c4de]">
          This project has JSX/TSX files, which need a build step the preview can't run — download
          the zip or push to GitHub to build it locally.
        </p>
      )}

      {error ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <p className="text-center font-body text-[12px] text-red-300">{error}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 bg-white">
          {src ? (
            <iframe
              key={reloads}
              src={src}
              title="Project preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                starting preview
              </p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}