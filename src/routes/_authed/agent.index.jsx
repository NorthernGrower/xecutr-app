import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import SessionList from "@/components/agent/SessionList";
import { createSession, listSessions } from "@/lib/agent";

export const Route = createFileRoute("/_authed/agent/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "agent — xecutr" },
      {
        name: "description",
        content:
          "Talk to the xecutr agent: it creates projects, writes and edits their code, audits it and fixes bugs.",
      },
    ],
  }),
  component: AgentPage,
});

const CAPABILITIES = [
  "creates a project and writes its files",
  "edits code on your existing projects",
  "audits code and lists the real risks",
  "debugs a symptom down to the root cause",
  "inspects a live site, repo or binary before rebuilding a feature",
];

function AgentPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listSessions()
      .then((rows) => alive && setSessions(rows))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    const created = await createSession();
    navigate({ to: "/agent/$conversationId", params: { conversationId: created.id } });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <WorkspaceHeader />

      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 pb-16 pt-8 sm:px-6">
        <p className="label-mono">agent</p>
        <h1 className="mt-2 font-display text-[24px] font-bold uppercase leading-none tracking-[0.03em] text-white sm:text-[30px]">
          the <span className="text-glow text-[#e0f7ff]">xecutr</span> agent
        </h1>
        <p className="mt-2 max-w-xl font-body text-[12.5px] leading-relaxed text-muted-foreground">
          A build partner with access to your projects and their files. It follows your house
          guidelines and works only on your own work.
        </p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {CAPABILITIES.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 rounded-sm border border-white/[0.08] bg-card/60 px-3 py-2 font-body text-[12px] leading-relaxed text-[#dfe6ee]"
            >
              <span className="mt-1.5 inline-block h-1 w-1 shrink-0 bg-[#e0f7ff]" />
              {item}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="mt-5 inline-flex items-center gap-2 rounded-sm border border-[#e0f7ff]/30 bg-[#e0f7ff]/[0.05] px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          new session
        </button>

        <p className="label-mono mt-8">sessions</p>
        <SessionList sessions={sessions} loading={loading} />
      </main>
    </div>
  );
}