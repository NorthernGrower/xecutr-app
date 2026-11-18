import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  connectGitHub,
  githubRepoExists,
  githubStatus,
  pushProjectToGitHub,
} from "@/lib/github-fns";
import { useAuth } from "@/lib/AuthContext";
import { GITHUB_TOKEN_URL } from "@/components/workspace/GitHubConnectionCard";

/**
 * Save the project's files into a repository in the caller's own GitHub account.
 *
 * When an account is already connected there is nothing to paste: this is just
 * the repository name, whether it will be created or updated, and the button.
 * A token field appears only for someone who is not connected yet.
 */
export default function GitHubDialog({ open, onOpenChange, project, onSaved }) {
  const { user } = useAuth();
  const [token, setToken] = useState("");
  const [account, setAccount] = useState(null);
  const [repo, setRepo] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!open) return;
    // The repository to save into is one of *yours*: named after the project,
    // never the one it was imported from (that belongs to someone else).
    const suggestion = (project?.name || "xecutr-project")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    setRepo(suggestion || "xecutr-project");
    setStatus(null);
    if (!user) return;
    githubStatus()
      .then((res) => setAccount(res.connected ? res : null))
      .catch(() => setAccount(null));
  }, [open, project, user?.id]);

  // Does that repository already exist in the account? It decides whether the
  // button says "create" or "update" (the push does the same either way).
  useEffect(() => {
    const name = repo.trim();
    if (!open || !account || !/^[A-Za-z0-9._-]{1,100}$/.test(name)) {
      setExists(false);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      githubRepoExists({ data: { name } })
        .then((res) => alive && setExists(Boolean(res?.exists)))
        .catch(() => alive && setExists(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [repo, account, open]);

  // Is the project's repo already one of this account's own?
  const mine = Boolean(
    account?.login && project?.repo_full_name?.startsWith(`${account.login}/`),
  );

  const connect = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await connectGitHub({ data: { token: token.trim() } });
      if (res.ok) {
        setToken("");
        setAccount(res);
      } else {
        setStatus({ error: res.error || "That token was rejected." });
      }
    } catch (err) {
      setStatus({ error: err?.message || "Could not reach GitHub." });
    } finally {
      setBusy(false);
    }
  };

  const push = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await pushProjectToGitHub({
        data: { projectId: project.id, repoName: repo.trim() },
      });
      if (res.ok) {
        setStatus({
          ok: `${res.created ? "Created" : "Updated"} ${res.repo} — ${res.pushed}/${res.total} files`,
          url: res.url,
        });
        onSaved?.();
      } else {
        setStatus({ error: res.error });
      }
    } catch (err) {
      setStatus({ error: err?.message || "Push failed." });
    } finally {
      setBusy(false);
    }
  };

  const label = mine || exists ? "update repo" : "create repo";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0c0c0c] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[13px] uppercase tracking-[0.2em] text-white">
            save to github
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!account && (
            <div>
              <p className="label-mono mb-1.5">personal access token</p>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_… (repo scope)"
                className="h-9 w-full rounded-sm border border-white/10 bg-[#0b0b0b] px-2.5 font-mono text-[12px] text-white outline-none focus:border-[#b0c4de]/50"
              />
              <p className="mt-1.5 font-body text-[11px] leading-relaxed text-muted-foreground">
                Verified and kept on the server for your account only — never stored in this
                browser, and never sent back to it. Connect once under /connections and this box
                never appears again.
              </p>
              <a
                href={GITHUB_TOKEN_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de] underline"
              >
                create a token with repo scope <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <button
                type="button"
                onClick={connect}
                disabled={busy || token.trim().length < 10}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                verify token
              </button>
            </div>
          )}

          {account && (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
                connected as {account.login}
              </p>

              {mine ? (
                project?.repo_url && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    saved to{" "}
                    <a
                      href={project.repo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#e0f7ff] underline"
                    >
                      {project.repo_full_name}
                    </a>
                  </p>
                )
              ) : project?.repo_full_name ? (
                <p className="font-body text-[11px] leading-relaxed text-muted-foreground">
                  Imported from{" "}
                  <a
                    href={project.repo_url || `https://github.com/${project.repo_full_name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-[#e0f7ff] underline"
                  >
                    {project.repo_full_name}
                  </a>
                  . That one belongs to someone else and is read-only from here — saving creates a
                  copy in your account.
                </p>
              ) : null}

              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="repo name in your account"
                className="h-9 w-full rounded-sm border border-white/10 bg-[#0b0b0b] px-2.5 font-mono text-[12px] text-white outline-none focus:border-[#b0c4de]/50"
              />
              <p className="font-body text-[11px] leading-relaxed text-muted-foreground">
                {exists
                  ? `github.com/${account.login}/${repo.trim()} already exists — the files are updated in it.`
                  : `github.com/${account.login}/${repo.trim() || "…"} will be created, private, when you save.`}
              </p>

              <button
                type="button"
                onClick={push}
                disabled={busy || !repo.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {busy ? "saving…" : label}
              </button>
            </div>
          )}

          {status?.error && <p className="font-body text-[12px] text-red-500">{status.error}</p>}
          {status?.ok && (
            <p className="font-body text-[12px] text-[#0e7490]">
              {status.ok} ·{" "}
              <a href={status.url} target="_blank" rel="noreferrer" className="underline">
                open repo
              </a>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
