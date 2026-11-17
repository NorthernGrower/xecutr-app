import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncProjectFromRepo } from "@/lib/github-fns";

/**
 * Pull the project's files back from its GitHub repository: new and changed
 * files are written, and files the repository no longer has are removed. The
 * repository is the source of truth once a project is linked to one — which is
 * what makes "the model edits the repo, the server follows" work.
 */
export default function SyncRepoButton({ project, onSynced, className, iconOnly = false }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const sync = async () => {
    if (!project?.id || busy) return;
    setBusy(true);
    setNote("");
    try {
      const res = await syncProjectFromRepo({ data: { projectId: project.id } });
      if (!res?.ok) {
        setNote(res?.error || "Sync failed.");
        return;
      }
      setNote(`+${res.added} ~${res.updated} -${res.removed}`);
      onSynced?.();
    } catch (err) {
      setNote(err?.message || "Sync failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!project?.repo_full_name) return null;

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={sync}
        disabled={busy}
        title={`Pull ${project.repo_full_name} into this project`}
        aria-label="Sync this project from its repository"
        className={className}
      >
        <RefreshCw className={busy ? "h-3 w-3 shrink-0 animate-spin" : "h-3 w-3 shrink-0"} strokeWidth={1.6} />
        {!iconOnly && "sync repo"}
      </button>
      {note && (
        <span className="max-w-[120px] shrink-0 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground" title={note}>
          {note}
        </span>
      )}
    </span>
  );
}
