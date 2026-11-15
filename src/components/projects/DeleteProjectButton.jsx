import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Removes a project, then tidies up the records that belong to it.
 *
 * The project is deleted first and on its own: whatever happens to the child
 * clean-up below, the card must leave the list. Before, one failing cascade call
 * (a helper the SDK did not have, a rule that refused it) threw before the
 * project itself was touched, so the project stayed and nothing said why.
 */
export default function DeleteProjectButton({ project, onDeleted, className }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const remove = async () => {
    if (busy || !project?.id) return;
    setBusy(true);
    setError(null);

    try {
      await base44.entities.Project.delete(project.id);
    } catch (err) {
      setError(err?.message || "The project could not be deleted. Try again.");
      setBusy(false);
      return;
    }

    // Gone on the server: let the list drop it before anything else can fail.
    onDeleted?.(project.id);
    setOpen(false);
    setBusy(false);

    // Best effort only — a leftover record is harmless, a stuck project is not.
    const owned = { project_id: project.id };
    for (const entity of ["ProjectFile", "Message", "MemoryNote", "AgentTask", "PreviewSession"]) {
      try {
        await base44.entities[entity]?.deleteMany?.(owned);
      } catch {
        /* the project is already gone; this is only housekeeping */
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        title="Delete this project"
        className={cn("inline-flex items-center gap-1 transition hover:text-red-300", className)}
      >
        <Trash2 className="h-3 w-3" strokeWidth={1.6} />
        delete
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="rounded-md border-white/10 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[15px] uppercase tracking-[0.1em]">
              delete “{project?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-body text-[12.5px] leading-relaxed text-muted-foreground">
              Its files, conversation and memory are removed too. This cannot be undone.
            </AlertDialogDescription>
            {error && (
              <p className="mt-2 rounded-sm border border-red-500/30 bg-red-500/[0.07] px-2.5 py-1.5 font-body text-[12px] leading-relaxed text-red-300">
                {error}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-sm font-display text-[10px] uppercase tracking-[0.16em]">
              keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={busy}
              className="rounded-sm bg-red-500/90 font-display text-[10px] uppercase tracking-[0.16em] text-white hover:bg-red-500"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
