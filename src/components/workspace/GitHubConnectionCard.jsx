import { useEffect, useState } from "react";
import { Check, ExternalLink, Github, Loader2, Unplug } from "lucide-react";
import Panel from "@/components/workspace/Panel";
import {
  connectGitHub,
  disconnectGitHub,
  githubOAuthEnabled,
  githubOAuthFinish,
  githubOAuthStart,
  githubStatus,
} from "@/lib/github-fns";
import { purgeLegacyGitHubTokens } from "@/lib/providers";
import { useAuth } from "@/lib/AuthContext";

export const GITHUB_TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo&description=xecutr";

const STATE_KEY = "xecutr:github-state";
const RETURN_PATH = "/connections";

/**
 * The GitHub connection.
 *
 * Where the deployment has a GitHub OAuth app, this is a sign-in: press
 * "authorize github", GitHub asks which account, and the token comes back here
 * and is stored on the server for this account only. Without the app configured
 * (no GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET), a personal access token does the
 * same job.
 */
export default function GitHubConnectionCard() {
  const { user } = useAuth();
  const [token, setToken] = useState("");
  const [account, setAccount] = useState(null);
  const [oauth, setOauth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    purgeLegacyGitHubTokens();
    githubStatus()
      .then((res) => alive && setAccount(res.connected ? res : null))
      .catch(() => alive && setAccount(null));
    githubOAuthEnabled()
      .then((res) => alive && setOauth(Boolean(res?.enabled)))
      .catch(() => alive && setOauth(false));
    return () => {
      alive = false;
    };
  }, [user?.id]);

  /** GitHub sends the person back here with a one-time code. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;

    const state = params.get("state");
    window.history.replaceState({}, "", RETURN_PATH);

    const expected = window.sessionStorage.getItem(STATE_KEY) || "";
    window.sessionStorage.removeItem(STATE_KEY);
    if (state && expected && state !== expected) {
      setError("That sign-in did not come from this browser. Try again.");
      return;
    }

    setBusy(true);
    githubOAuthFinish({
      data: { code, redirectUri: `${window.location.origin}${RETURN_PATH}` },
    })
      .then((res) => {
        if (res?.ok) {
          setAccount({ login: res.login });
          setOauth(true);
        } else {
          setError(res?.error || "GitHub did not finish the sign-in.");
        }
      })
      .catch((err) => setError(err?.message || "Could not reach GitHub."))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authorize = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await githubOAuthStart({
        data: { redirectUri: `${window.location.origin}${RETURN_PATH}` },
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      window.sessionStorage.setItem(STATE_KEY, res.state);
      window.location.assign(res.url);
    } catch (err) {
      setError(err?.message || "Could not start the GitHub sign-in.");
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    const trimmed = token.trim();
    if (trimmed.length < 10 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await connectGitHub({ data: { token: trimmed } });
      if (res.ok) {
        setToken("");
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

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectGitHub();
      setToken("");
      setAccount(null);
    } catch (err) {
      setError(err?.message || "Could not disconnect.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        <Github className="h-3.5 w-3.5 text-[#b0c4de]" strokeWidth={1.6} />
        <span className="label-mono">github</span>
        {account?.login && (
          <span className="rounded-sm border border-[#b0c4de]/25 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#b0c4de]">
            {account.login}
          </span>
        )}
      </div>

      {account?.login ? (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <p className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#0e7490]">
            <Check className="h-3 w-3 shrink-0" />
            connected — projects can create repos here
          </p>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-white/10 px-3 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-red-400/40 hover:text-red-300 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
            disconnect
          </button>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-3">
          {oauth !== false && (
            <button
              type="button"
              onClick={authorize}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}
              authorize github
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              or use a token
            </span>
            <a
              href={GITHUB_TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#e0f7ff]"
            >
              create one <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>

          <div className="flex items-center gap-2">
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
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-white/15 px-3 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-[#b0c4de]/50 hover:text-white disabled:opacity-40"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              use token
            </button>
          </div>
        </div>
      )}

      {error && <p className="px-4 pb-3 font-body text-[11.5px] text-red-500">{error}</p>}

      <p className="border-t border-white/[0.07] px-4 py-2.5 font-body text-[11px] leading-relaxed text-muted-foreground">
        Your account, your repositories. The token stays on the server for your account only, never
        in this browser and never handed back to it. Repositories are created in your own account —
        a project imported from someone else&apos;s repository is read-only and is copied to yours.
      </p>
    </Panel>
  );
}
