import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Unplug } from "lucide-react";
import Panel from "@/components/workspace/Panel";
import { githubAccount } from "@/lib/github-fns";
import { readGitHubToken, saveGitHubToken } from "@/lib/providers";
import { useAuth } from "@/lib/AuthContext";

export const GITHUB_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=xecutr";

/** Each user connects their own GitHub account with a token that carries repo scope. */
export default function GitHubConnectionCard() {
  const { user } = useAuth();
  const [token, setToken] = useState("");
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const stored = readGitHubToken(user?.id);
    if (!stored) {
      setToken("");
      setAccount(null);
      return;
    }
    setToken(stored);
    githubAccount({ data: { token: stored } })
      .then((res) => setAccount(res.ok ? res : null))
      .catch(() => setAccount(null));
  }, [user?.id]);

  const connect = async () => {
    const trimmed = token.trim();
    if (trimmed.length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await githubAccount({ data: { token: trimmed } });
      if (res.ok) {
        saveGitHubToken(user?.id, trimmed);
        setAccount(res);
      } else {
        setAccount(null);
        setError(res.error || "That token was rejected.");
      }
    } catch (err) {
      setError(err?.message || "Could not reach GitHub.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    saveGitHubToken(user?.id, "");
    setToken("");
    setAccount(null);
    setError(null);
  };

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-white">
          GitHub
        </h3>
        {account?.login && (
          <span className="rounded-sm border border-[#b0c4de]/25 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#b0c4de]">
            {account.login}
          </span>
        )}
        <a
          href={GITHUB_TOKEN_URL}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#e0f7ff]"
        >
          create a token <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {account?.login ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#e0f7ff]">
            <Check className="h-3 w-3 shrink-0" />
            connected — projects can create repos here
          </p>
          <button
            type="button"
            onClick={disconnect}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-white/10 px-3 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-red-400/40 hover:text-red-300"
          >
            <Unplug className="h-3 w-3" />
            disconnect
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setError(null);
            }}
            placeholder="personal access token with repo scope"
            className="h-8 min-w-0 flex-1 rounded-sm border border-white/10 bg-[#0b0b0b] px-2.5 font-mono text-[11.5px] text-white outline-none focus:border-[#b0c4de]/50"
          />
          <button
            type="button"
            onClick={connect}
            disabled={busy || token.trim().length < 10}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-[#e0f7ff]/30 bg-[#e0f7ff]/[0.05] px-3 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            connect
          </button>
        </div>
      )}

      {error && <p className="mt-2 font-body text-[11.5px] text-red-400">{error}</p>}
      <p className="mt-2 font-body text-[11px] leading-relaxed text-muted-foreground">
        Your key, your GitHub. It stays in this browser and is used only when you save a project,
        so the repository is created in your own account — no Base44 connector, no shared account,
        no integration credits.
      </p>
    </Panel>
  );
}