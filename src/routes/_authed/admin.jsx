import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Cpu, Shield, Users } from "lucide-react";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Panel from "@/components/workspace/Panel";
import { authQuery } from "@/lib/AuthContext";
import { adminTrialUsage } from "@/lib/admin";
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

  useEffect(() => {
    xecutrHealth().then(setHealth).catch(() => setHealth({ ok: false }));
    adminTrialUsage()
      .then(setUsage)
      .catch((err) => setUsageError(err?.message || "Could not load usage."));
  }, []);

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
