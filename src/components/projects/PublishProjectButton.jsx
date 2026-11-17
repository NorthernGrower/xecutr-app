import { useState } from "react";
import { Copy, Globe, Loader2 } from "lucide-react";
import { publishProject } from "@/lib/site";

/**
 * Publish a project on its own subdomain.
 *
 * The project's files are copied to this server's disk through the gateway,
 * which then serves them at `<slug>.xecutr.cloud`. The project keeps its copy in
 * the database too: this is a second home on the machine that built it, not a
 * move. Once published, the button becomes the link (and a copy button).
 */
export default function PublishProjectButton({ project, className, iconOnly = false }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const publish = async () => {
    if (!project?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await publishProject({ data: { projectId: project.id } });
      if (!res?.ok) {
        setError(res?.error || "Publishing failed.");
        return;
      }
      setUrl(res.url);
    } catch (err) {
      setError(err?.message || "Publishing failed.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link still opens */
    }
  };

  if (url) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title={url}
          className="inline-flex min-w-0 max-w-[190px] items-center gap-1.5 truncate rounded-sm border border-[#e0f7ff]/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.08]"
        >
          <Globe className="h-3 w-3 shrink-0" strokeWidth={1.6} />
          <span className="truncate">{url.replace("https://", "")}</span>
        </a>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy the site address"
          className="shrink-0 rounded-sm p-1 text-muted-foreground/70 transition hover:text-white"
        >
          <Copy className="h-3 w-3" strokeWidth={1.8} />
        </button>
        {copied && (
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-[#0e7490]">
            copied
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={publish}
        disabled={busy}
        title={error || "Copy this project to the server and serve it on its own subdomain"}
        className={className}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <Globe className="h-3 w-3 shrink-0" strokeWidth={1.6} />
        )}
        {!iconOnly && (busy ? "publishing…" : "publish")}
      </button>
      {error && (
        <span className="max-w-[160px] truncate font-body text-[10px] text-red-500" title={error}>
          {error}
        </span>
      )}
    </span>
  );
}
