import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { githubAccount, pushProjectToGitHub } from "@/lib/github-fns";
import { readGitHubToken, saveGitHubToken } from "@/lib/providers";
import { GITHUB_TOKEN_URL } from "@/components/workspace/GitHubConnectionCard";

/** Save the project's existing files into a repo on the user's own GitHub. */
export default function GitHubDialog({ open, onOpenChange, project, onSaved }) {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState(null);
  const [repo, setRepo] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRepo((project?.name || "xecutr-project").toLowerCase().replace(/[^a-z0-9._-]+/g, "-"));
    setStatus(null);
    const stored = readGitHubToken();
    if (stored) {
      setToken(stored);
      githubAccount({ data: { token: stored } })
        .then((res) => setAccount(res.ok ? res : null))
        .catch(() => setAccount(null));
    }
  }, [open, project]);

  const connect = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await githubAccount({ data: { token: token.trim() } });
      if (res.ok) {
        saveGitHubToken(token.trim());
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
        data: { projectId: project.id, token: token.trim(), repoName: repo.trim() },
      });
      if (res.ok) {
        setStatus({ ok: `Saved ${res.pushed}/${res.total} files to ${res.repo}`, url: res.url });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0c0c0c] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[13px] uppercase tracking-[0.2em] text-white">
            save to github
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
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
              Stored in this browser only, sent with this request and never kept on the server.
            </p>
            <a
              href={GITHUB_TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de] underline"
            >
              create a token with repo scope
            </a>
          </div>

          {account ? (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
                connected as {account.login}
              </p>
              {project?.repo_url && (
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
              )}
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="repo name"
                className="h-9 w-full rounded-sm border border-white/10 bg-[#0b0b0b] px-2.5 font-mono text-[12px] text-white outline-none focus:border-[#b0c4de]/50"
              />
              <button
                type="button"
                onClick={push}
                disabled={busy || !repo.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                push files
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={busy || token.trim().length < 10}
              className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              verify token
            </button>
          )}

          {status?.error && <p className="font-body text-[12px] text-red-400">{status.error}</p>}
          {status?.ok && (
            <p className="font-body text-[12px] text-[#e0f7ff]">
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