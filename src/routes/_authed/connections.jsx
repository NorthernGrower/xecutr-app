import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Panel from "@/components/workspace/Panel";
import { discoverModels } from "@/lib/chat";
import { githubAccount } from "@/lib/github-fns";
import {
  PROVIDERS,
  clearKey,
  readGitHubToken,
  readKeys,
  readModelCache,
  saveKey,
  saveGitHubToken,
  saveModelCache,
} from "@/lib/providers";

export const Route = createFileRoute("/_authed/connections")({
  ssr: false,
  head: () => ({ meta: [{ title: "connections — xecutr" }] }),
  component: ConnectionsPage,
});

function ProviderRow({ provider }) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setKey(readKeys()[provider.id] || "");
    setModels(readModelCache()[provider.id]?.models || null);
  }, [provider.id]);

  const save = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      clearKey(provider.id);
      setSaved(false);
      setModels(null);
      return;
    }
    saveKey(provider.id, trimmed);
    setSaved(true);
    setBusy(true);
    try {
      const res = await discoverModels({ data: { providerId: provider.id, apiKey: trimmed } });
      if (res.models?.length) {
        setModels(res.models);
        saveModelCache(provider.id, res.models);
      }
    } catch {
      /* discovery is optional */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-white">
          {provider.label}
        </h3>
        {models?.length ? (
          <span className="rounded-sm border border-[#b0c4de]/25 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#b0c4de]">
            {models.length} models
          </span>
        ) : null}
        <a
          href={provider.connect}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-[#e0f7ff]"
        >
          get key <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setSaved(false);
          }}
          placeholder="paste API key"
          className="h-8 min-w-0 flex-1 rounded-sm border border-white/10 bg-[#0b0b0b] px-2.5 font-mono text-[11.5px] text-white outline-none focus:border-[#b0c4de]/50"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-[#e0f7ff]/30 bg-[#e0f7ff]/[0.05] px-3 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14]"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : null}
          {saved ? "saved" : "save"}
        </button>
      </div>
      <p className="mt-2 font-body text-[11px] leading-relaxed text-muted-foreground">
        Stored on this device only. It is forwarded once per request and never kept on our servers.
        Each key carries its own provider limits.
      </p>
    </Panel>
  );
}

function ConnectionsPage() {
  const [token, setToken] = useState("");
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const stored = readGitHubToken();
    if (!stored) return;
    setToken(stored);
    githubAccount({ data: { token: stored } })
      .then((res) => setAccount(res.ok ? res : null))
      .catch(() => setAccount(null));
  }, []);

  const verify = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await githubAccount({ data: { token: token.trim() } });
      if (res.ok) {
        saveGitHubToken(token.trim());
        setAccount(res);
      } else {
        setStatus(res.error || "That token was rejected.");
        setAccount(null);
      }
    } catch (err) {
      setStatus(err?.message || "Could not reach GitHub.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <WorkspaceHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="label-mono">connections</p>
        <h1 className="mt-3 font-display text-[26px] font-bold uppercase tracking-[0.04em] text-white">
          your providers
        </h1>
        <p className="mt-3 max-w-xl font-body text-[13px] leading-relaxed text-muted-foreground">
          Turns start on the keyless gateway. Add your own keys to route to a specific provider and
          model, and the picker in the chat fills with the models that provider reports.
        </p>

        <div className="mt-8 space-y-3">
          {PROVIDERS.map((provider) => (
            <ProviderRow key={provider.id} provider={provider} />
          ))}
        </div>

        <div className="mt-10">
          <p className="label-mono">github</p>
          <Panel className="mt-3 p-4">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-white">
                save projects to your repos
              </h3>
              {account?.login && (
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
                  {account.login}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="personal access token with repo scope"
                className="h-8 min-w-0 flex-1 rounded-sm border border-white/10 bg-[#0b0b0b] px-2.5 font-mono text-[11.5px] text-white outline-none focus:border-[#b0c4de]/50"
              />
              <button
                type="button"
                onClick={verify}
                disabled={busy || token.trim().length < 10}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-[#e0f7ff]/30 bg-[#e0f7ff]/[0.05] px-3 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                verify
              </button>
            </div>
            {status && <p className="mt-2 font-body text-[11.5px] text-red-400">{status}</p>}
            <p className="mt-2 font-body text-[11px] leading-relaxed text-muted-foreground">
              Verified through GitHub and stored on this device only. Each user connects their own
              account, so nobody can write to another person's repos.
            </p>
          </Panel>
        </div>
      </main>
    </div>
  );
}