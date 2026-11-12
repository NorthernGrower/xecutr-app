import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import ChatPane from "@/components/workspace/ChatPane";
import Composer from "@/components/workspace/Composer";
import FeatureStrip from "@/components/workspace/FeatureStrip";
import ProjectRail from "@/components/workspace/ProjectRail";
import { ProjectCard } from "@/components/workspace/ProjectCard";
import Panel from "@/components/workspace/Panel";
import { useAuth } from "@/lib/AuthContext";
import { carryTrialIntoProject } from "@/lib/carryover";
import { projectNameFrom, readTrial } from "@/lib/trial";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "xecutr — build beyond limits" },
      {
        name: "description",
        content:
          "A provider-agnostic coding agent: prompt a project, watch it stream, keep the files and the memory.",
      },
    ],
  }),
  component: WorkspaceEntry,
});

function WorkspaceEntry() {
  const { user, isLoadingAuth, navigateToLogin } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [projects, setProjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [trialMessages, setTrialMessages] = useState([]);
  const bootRef = useRef(false);

  const load = useCallback(async () => {
    const rows = await base44.entities.Project.filter({}, "-updated_date", 40);
    setProjects(rows || []);
  }, []);

  useEffect(() => {
    const stored = readTrial();
    setTrialMessages(
      (stored.messages || []).map((m, i) => ({
        id: `trial-${i}`,
        role: m.role,
        provider: m.role === "assistant" ? "keyless gateway" : undefined,
        model: m.role === "assistant" ? "auto" : undefined,
        parts: [{ type: "text", content: m.content }],
      })),
    );
  }, []);

  useEffect(() => {
    if (!user) return;
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      const carried = await carryTrialIntoProject();
      if (carried) {
        navigate({ to: "/projects/$projectId", params: { projectId: carried.id } });
        return;
      }
      await load();
    })();
  }, [user, navigate, load]);

  const start = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const project = await base44.entities.Project.create({
        name: projectNameFrom(text),
        summary: text.slice(0, 300),
        message_count: 1,
        last_activity: new Date().toISOString(),
      });
      await base44.entities.Message.create({
        project_id: project.id,
        role: "user",
        content: text,
      });
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <WorkspaceHeader providerLabel={user ? undefined : "keyless gateway"} />

      <div className="mx-auto flex w-full max-w-[1400px] flex-1">
        {user && (
          <aside className="hidden w-52 shrink-0 border-r border-white/[0.07] lg:block">
            <ProjectRail projects={projects} activeId={null} />
          </aside>
        )}

        <main className="min-w-0 flex-1 px-4 pb-14 pt-8 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <p className="label-mono text-center">
              {user ? "new project" : "provider-agnostic coding agent"}
            </p>
            <h1 className="mt-3 text-center font-display text-[30px] font-bold uppercase leading-[1.06] tracking-[0.02em] text-white sm:text-[44px]">
              build <span className="text-glow text-[#e0f7ff]">beyond</span> limits
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-center font-body text-[13.5px] leading-relaxed text-muted-foreground">
              {user
                ? "Describe the project. The agent writes the files, keeps the memory and labels every reply with the model behind it."
                : "Prompt a project and watch it stream — no key, no signup. Every reply is labelled with the provider and model that answered it."}
            </p>
          </div>

          {user ? (
            <div className="mx-auto mt-8 max-w-3xl">
              <Composer
                value={prompt}
                onChange={setPrompt}
                onSubmit={start}
                busy={busy}
                placeholder="e.g. build a Python CLI that renames photos by capture date"
                footer={
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    auto routing · free tier first
                  </span>
                }
              />
            </div>
          ) : (
            <div className="mx-auto mt-8 max-w-3xl">
              <Panel glow className="grid-bg overflow-hidden">
                <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
                  <span className="label-mono">prompt window</span>
                  <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[#b0c4de]">
                    no key needed
                  </span>
                </div>
                <div className="h-[430px] px-4 pb-2">
                  <ChatPane trial initialMessages={trialMessages} />
                </div>
              </Panel>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateToLogin()}
                  className="rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14]"
                >
                  sign up to save it
                </button>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  the trial carries over
                </span>
              </div>
            </div>
          )}

          {user && (
            <section className="mx-auto mt-12 max-w-5xl">
              <div className="flex items-end justify-between">
                <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.2em] text-white">
                  recent projects
                </h2>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {projects.length} saved
                  </span>
                  <Link
                    to="/projects"
                    className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de] transition hover:text-[#e0f7ff]"
                  >
                    view all
                  </Link>
                </div>
              </div>
              {projects.length === 0 ? (
                <p className="mt-4 font-body text-[12.5px] text-muted-foreground">
                  Nothing yet — your first prompt creates the project.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.slice(0, 6).map((project) => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="mx-auto mt-14 max-w-5xl border border-white/10 bg-[#0c0c0c]">
            <FeatureStrip />
          </div>
        </main>
      </div>
    </div>
  );
}