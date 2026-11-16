import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderGit2, Link2, Loader2, Lock, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { importGitHubRepo, importRepoByUrl, listGitHubRepos } from "@/lib/github-fns";
import { useAuth } from "@/lib/AuthContext";

/**
 * Pull a GitHub repository into a new project.
 *
 * A link is all a public repository needs — no connection, no token. Connecting
 * GitHub adds the caller's own repository list and the private ones.
 */
export default function ImportRepoDialog({ open, onOpenChange }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [repos, setRepos] = useState([]);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [url, setUrl] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!user) {
      setConnected(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    listGitHubRepos()
      .then((res) => {
        if (!alive) return;
        setRepos(res.repos || []);
        setConnected(Boolean(res.connected));
        setError(res.error || null);
      })
      .catch((err) => {
        if (!alive) return;
        setRepos([]);
        setConnected(false);
        setError(err?.message || "Could not reach GitHub.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, user?.id]);

  const pick = async (repo) => {
    setBusy(repo.full_name);
    setError(null);
    try {
      const res = await importGitHubRepo({
        data: { repoFullName: repo.full_name, branch: repo.branch },
      });
      if (!res.ok) {
        setError(res.error || "Import failed.");
        return;
      }
      onOpenChange(false);
      navigate({ to: "/projects/$projectId", params: { projectId: res.projectId } });
    } catch (err) {
      setError(err?.message || "Import failed.");
    } finally {
      setBusy(null);
    }
  };

  const importLink = async (event) => {
    event.preventDefault();
    const repo = url.trim();
    if (!repo || urlBusy) return;
    setUrlBusy(true);
    setError(null);
    try {
      const res = await importRepoByUrl({ data: { repo } });
      if (!res.ok) {
        setError(res.error || "Import failed.");
        return;
      }
      onOpenChange(false);
      navigate({ to: "/projects/$projectId", params: { projectId: res.projectId } });
    } catch (err) {
      setError(err?.message || "Import failed.");
    } finally {
      setUrlBusy(false);
    }
  };

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? repos.filter((repo) => repo.full_name.toLowerCase().includes(needle))
    : repos;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0c0c0c] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-[13px] uppercase tracking-[0.2em] text-white">
            import from github
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={importLink} className="space-y-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            paste a repository link
          </p>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-white/10 bg-[#0b0b0b] px-2.5">
              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/owner/repo"
                autoComplete="off"
                spellCheck={false}
                className="h-9 min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-white outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <button
              type="submit"
              disabled={!url.trim() || urlBusy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {urlBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderGit2 className="h-3 w-3" />}
              import
            </button>
          </div>
          <p className="font-body text-[11.5px] leading-relaxed text-muted-foreground">
            Any public repository imports this way, without connecting anything. Private repositories
            need your GitHub connection below.
          </p>
        </form>

        <div className="border-t border-white/[0.07] pt-3">
          {!connected ? (
            <div className="space-y-3">
              <p className="font-body text-[12.5px] leading-relaxed text-muted-foreground">
                Connect your GitHub account to browse your own repositories here and import private
                ones.
              </p>
              <Link
                to="/connections"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-white/15 px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:border-[#b0c4de]/50 hover:text-white"
              >
                <FolderGit2 className="h-3 w-3" strokeWidth={1.8} />
                connect github
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-sm border border-white/10 bg-[#0b0b0b] px-2.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="filter your repositories"
                  className="h-9 min-w-0 flex-1 bg-transparent font-mono text-[11.5px] text-white outline-none placeholder:text-muted-foreground/70"
                />
              </div>

              <div className="max-h-[36vh] overflow-auto rounded-sm border border-white/[0.07]">
                {loading && (
                  <p className="flex items-center gap-2 px-3 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> reading your repositories
                  </p>
                )}

                {!loading && shown.length === 0 && (
                  <p className="px-3 py-4 font-body text-[12px] text-muted-foreground">
                    No repositories match that.
                  </p>
                )}

                {!loading &&
                  shown.map((repo) => (
                    <button
                      key={repo.full_name}
                      type="button"
                      onClick={() => pick(repo)}
                      disabled={Boolean(busy)}
                      className="flex w-full items-center gap-2 border-b border-white/[0.05] px-3 py-2.5 text-left transition last:border-0 hover:bg-white/[0.03] disabled:opacity-50"
                    >
                      <FolderGit2
                        className="h-3.5 w-3.5 shrink-0 text-[#b0c4de]"
                        strokeWidth={1.6}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white">
                        {repo.full_name}
                      </span>
                      {repo.private && (
                        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                      )}
                      {busy === repo.full_name ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#e0f7ff]" />
                      ) : (
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                          {repo.branch}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="font-body text-[11.5px] text-red-400">{error}</p>}
        {(busy || urlBusy) && (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de]">
            copying files into a new project…
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
