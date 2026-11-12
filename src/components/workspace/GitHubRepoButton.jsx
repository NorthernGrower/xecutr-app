import { useEffect, useState } from "react";
import { FolderGit2 } from "lucide-react";
import GitHubDialog from "@/components/workspace/GitHubDialog";
import { githubStatus } from "@/lib/github-fns";
import { useAuth } from "@/lib/AuthContext";

/** The signed-in user's own GitHub state for this project: connect, then update the repo. */
export default function GitHubRepoButton({ project, onSaved }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState(null);

  useEffect(() => {
    if (!user) return;
    githubStatus()
      .then((res) => setLogin(res.connected ? res.login : null))
      .catch(() => setLogin(null));
  }, [user?.id, project?.repo_full_name]);

  const label = project?.repo_full_name ? "update repo" : login ? `@${login}` : "connect github";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Save this project to your own GitHub account"
        className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
          project?.repo_full_name
            ? "border-[#e0f7ff]/40 text-[#e0f7ff] hover:bg-[#e0f7ff]/[0.08]"
            : "border-white/10 text-muted-foreground hover:border-[#b0c4de]/40 hover:text-white"
        }`}
      >
        <FolderGit2 className="h-3 w-3" strokeWidth={1.6} />
        {label}
      </button>

      <GitHubDialog open={open} onOpenChange={setOpen} project={project} onSaved={onSaved} />
    </>
  );
}