import { useState } from "react";
import { FolderGit2 } from "lucide-react";
import GitHubDialog from "@/components/workspace/GitHubDialog";

/** Dashboard shortcut: save or re-sync this project's files to the user's own GitHub. */
export default function ProjectGitHubButton({ project, onSaved }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={project.repo_full_name ? "Sync these files to your GitHub repo" : "Save these files to GitHub"}
        className="inline-flex items-center gap-1 transition hover:text-white"
      >
        <FolderGit2 className="h-3 w-3" strokeWidth={1.6} />
        {project.repo_full_name ? "sync" : "push"}
      </button>

      <GitHubDialog open={open} onOpenChange={setOpen} project={project} onSaved={onSaved} />
    </>
  );
}