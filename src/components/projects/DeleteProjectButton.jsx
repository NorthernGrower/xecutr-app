import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
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

/** Removes a project together with the files, turns and memory that belong to it. */
export default function DeleteProjectButton({ project, onDeleted }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy || !project?.id) return;
    setBusy(true);
    try {
      const owned = { project_id: project.id };
      await base44.entities.ProjectFile.deleteMany(owned);
      await base44.entities.Message.deleteMany(owned);
      await base44.entities.MemoryNote.deleteMany(owned);
      await base44.entities.Project.delete(project.id);
      setOpen(false);
      onDeleted?.(project.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Delete this project"
        className="inline-flex items-center gap-1 transition hover:text-red-300"
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