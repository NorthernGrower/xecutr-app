import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Check, Copy, Cpu, KeyRound, Rocket, Shield, Users } from "lucide-react";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Panel from "@/components/workspace/Panel";
import { authQuery } from "@/lib/AuthContext";
import { adminTrialUsage } from "@/lib/admin";
import { BUILD } from "@/lib/build";
import { PUBLISH } from "@/lib/publish";
import { SITE_KEYS, SITE_KEY_NOTES } from "@/lib/server-keys";
import { xecutrHealth } from "@/lib/chat";

export const Route = createFileRoute("/_authed/admin")({
  ssr: false,
  // The _authed layout already required a signed-in visitor; here only admins pass.
  beforeLoad: async ({ context }) => {
    const { user } = await context.queryClient.ensureQueryData(authQuery);
    if (user?.role !== "admin") throw redirect({ to: "/projects" });
  },
  head: () => ({ meta: [{ title: "admin — xecutr" }] }),
  component: AdminPage,
});

function Card({ icon: Icon, title, children }) {
  return (
    <Panel glow className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        <Icon className="h-3.5 w-3.5 text-[#b0c4de]" strokeWidth={1.6} />
        <span className="label-mono">{title}</span>
      </div>
      <div className="px-4 py-4">{children}</div>
    </Panel>
  );
}

function AdminPage() {
  const user = Route.useRouteContext().user;
  const [health, setHealth] = useState(null);
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    xecutrHealth().then(setHealth).catch(() => setHealth({ ok: false }));
    adminTrialUsage()
      .then(setUsage)
      .catch((err) => setUsageError(err?.message || "Could not load usage."));
  }, []);

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard blocked — the command is on screen to select by hand */
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <WorkspaceHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-14 pt-8 sm:px-6">
        <p className="label-mono">restricted area</p>
        <h1 className="mt-2 font-display text-[24px] font-bold uppercase tracking-[0.04em] text-white">
          admin
        </h1>

        <div className="mt-6 space-y-4">
          <Card icon={Shield} title="identity">
            <div className="grid gap-2 font-body text-[13px] text-[#eef3f8]">
              <p>
                <span className="text-muted-foreground">Name:</span> {user?.full_name || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span> {user?.email || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Platform role:</span>{" "}
                <span className="font-mono text-[12px] uppercase text-[#e0f7ff]">{user?.role}</span>
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Roles are managed in the Base44 builder's Members area — whoever is marked
                "admin" there sees this page.
              </p>
            </div>
          </Card>

          <Card icon={Rocket} title="live base44 site">
            <div className="space-y-3 font-body text-[13px] leading-relaxed text-[#eef3f8]">
              <p className="text-muted-foreground">{PUBLISH.intro}</p>

              <ol className="list-decimal space-y-1.5 pl-5">
                {PUBLISH.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  {PUBLISH.commandNote}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-sm border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-[#dfe6ee]">
                    {PUBLISH.command}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(PUBLISH.command, "publish")}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-[#e0f7ff]/30 bg-[#e0f7ff]/[0.05] px-2.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14]"
                  >
                    {copied === "publish" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === "publish" ? "copied" : "copy"}
                  </button>
                </div>
              </div>

              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
                app build · {BUILD}
              </p>

              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  once it has caught up
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[12.5px]">
                  {PUBLISH.after.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <p className="text-[12px] leading-relaxed text-muted-foreground">{PUBLISH.vpsNote}</p>
            </div>
          </Card>

          <Card icon={KeyRound} title="provider keys (site-wide)">
            <div className="space-y-3 font-body text-[13px] leading-relaxed text-[#eef3f8]">
              <p className="text-muted-foreground">
                A server-side key serves every visitor. Each member's own key under Connections is
                still used first for that member's turns; a shared key covers everyone else.
              </p>

              {SITE_KEYS.map((key) => (
                <div key={key.id} className="space-y-2 border-t border-white/10 pt-3 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
                      {key.provider} · {key.environmentVariable}
                    </p>
                    <a
                      href={key.signupUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-[#0e7490] underline-offset-2 hover:underline"
                    >
                      get a key →
                    </a>
                  </div>

                  <div className="flex items-start gap-2">
                    <code className="max-h-24 min-w-0 flex-1 overflow-auto break-all rounded-sm border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-[#dfe6ee]">
                      {key.command}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(key.command, key.id)}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-[#e0f7ff]/30 bg-[#e0f7ff]/[0.05] px-2.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14]"
                    >
                      {copied === key.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === key.id ? "copied" : "copy"}
                    </button>
                  </div>

                  <p className="text-[12px] leading-relaxed text-muted-foreground">{key.note}</p>
                </div>
              ))}

              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                replace the placeholder with the key · check it with {SITE_KEYS[0].check}
              </p>

              <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed">
                {SITE_KEY_NOTES.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </Card>

          <Card icon={Cpu} title="model gateway">
            {health === null ? (
              <p className="font-body text-[13px] text-muted-foreground">Checking…</p>
            ) : health?.ok ? (
              <p className="font-body text-[13px] text-[#eef3f8]">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" />
                Online — answered at {health?.time ? new Date(health.time).toLocaleTimeString() : "just now"}
              </p>
            ) : (
              <p className="font-body text-[13px] text-red-300">
                The gateway did not answer. Check the server: <span className="font-mono">docker ps</span> and{" "}
                <span className="font-mono">journalctl -u xecutr-frontend -n 20</span>
              </p>
            )}
          </Card>

          <Card icon={Users} title="anonymous trial usage (per address per day)">
            {usageError ? (
              <p className="font-body text-[13px] text-red-300">{usageError}</p>
            ) : !usage ? (
              <p className="font-body text-[13px] text-muted-foreground">Loading…</p>
            ) : usage.rows.length === 0 ? (
              <p className="font-body text-[13px] text-muted-foreground">No anonymous turns yet.</p>
            ) : (
              <>
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  limit {usage.limit} turns / address / day · {usage.rows.length} addresses seen
                </p>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full font-mono text-[11px]">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-normal">day</th>
                        <th className="pb-2 pr-4 font-normal">address (hashed)</th>
                        <th className="pb-2 font-normal">turns</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#eef3f8]">
                      {usage.rows.map((row) => (
                        <tr key={row.id} className={row.count >= usage.limit ? "text-red-300" : ""}>
                          <td className="py-1 pr-4">{row.day}</td>
                          <td className="py-1 pr-4">{row.ip_hash}…</td>
                          <td className="py-1">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Activity className="h-3 w-3" strokeWidth={1.6} />
            member management and password resets live in the Base44 builder's Members area
          </p>
        </div>
      </main>
    </div>
  );
}
