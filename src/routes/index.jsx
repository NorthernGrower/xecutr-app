import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Terminal, SquareArrowOutUpRight } from "lucide-react";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Composer from "@/components/workspace/Composer";
import FeatureStrip from "@/components/workspace/FeatureStrip";
import { ProjectCard } from "@/components/workspace/ProjectCard";
import Panel from "@/components/workspace/Panel";
import { useAuth } from "@/lib/AuthContext";

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

/** Labeled local sample data — replaced by real project records once signed in. */
const SAMPLE_PROJECTS = [
  {
    id: "sample-1",
    name: "orbit-cli",
    summary: "A Node CLI that scaffolds typed API clients from an OpenAPI document.",
    file_count: 9,
    model: "llama-3.3-70b",
  },
  {
    id: "sample-2",
    name: "signal-dash",
    summary: "Realtime dashboard reading queue metrics over websockets.",
    file_count: 14,
    model: "gpt-oss-120b",
  },
];

const SAMPLE_ANSWER = {
  provider: "ovhcloud-gateway",
  model: "gpt-oss-120b",
  text: "Here's a minimal typed fetcher plus a runnable entry file.\n\n```file path=\"src/api.ts\"\nexport type Row = { id: string; value: number };\n\nexport async function fetchRows(base: string): Promise<Row[]> {\n  const res = await fetch(`${base}/rows`);\n  if (!res.ok) throw new Error(`rows failed: ${res.status}`);\n  return res.json();\n}\n```",
};

function WorkspaceEntry() {
  const { user, isLoadingAuth } = useAuth();
  const [prompt, setPrompt] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <WorkspaceHeader providerLabel={user ? undefined : "keyless gateway"} />

      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-10 sm:px-6">
        {/* headline */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="label-mono">provider-agnostic coding agent</p>
          <h1 className="mt-4 font-display text-[34px] font-bold uppercase leading-[1.05] tracking-[0.02em] text-white sm:text-[52px]">
            build <span className="text-glow text-[#e0f7ff]">beyond</span> limits
          </h1>
          <p className="mx-auto mt-4 max-w-xl font-body text-[14px] leading-relaxed text-muted-foreground">
            Prompt a project and watch it stream. Every reply is labelled with the provider and model
            that answered it.
          </p>
        </div>

        {/* prompt window */}
        <div className="mx-auto mt-9 max-w-3xl">
          <Panel glow className="grid-bg overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
              <Terminal className="h-3.5 w-3.5 text-[#b0c4de]" strokeWidth={1.6} />
              <span className="label-mono">prompt window</span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[#b0c4de]">
                no key needed
              </span>
            </div>
            <div className="p-4">
              <Composer
                value={prompt}
                onChange={setPrompt}
                onSubmit={() => {}}
                placeholder="e.g. build a CLI that scaffolds typed API clients"
                footer={
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    auto routing · free tier first
                  </span>
                }
              />

              {/* sample answer, labelled */}
              <div className="mt-5 rounded-sm border border-white/10 bg-[#0b0b0b] p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#e0f7ff]" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#b0c4de]">
                    {SAMPLE_ANSWER.provider} · {SAMPLE_ANSWER.model}
                  </span>
                </div>
                <pre className="mt-3 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-[#c9d3de]">
                  {SAMPLE_ANSWER.text}
                </pre>
              </div>
            </div>
          </Panel>

          {!isLoadingAuth && !user && (
            <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              sign up to save this project, its files and its memory
            </p>
          )}
        </div>

        {/* signed-in project rail */}
        {user && (
          <section className="mt-12">
            <div className="flex items-end justify-between">
              <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.2em] text-white">
                your projects
              </h2>
              <Link
                to="/projects/$projectId"
                params={{ projectId: "new" }}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#b0c4de] hover:text-[#e0f7ff]"
              >
                <SquareArrowOutUpRight className="h-3 w-3" strokeWidth={1.6} />
                open workspace
              </Link>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SAMPLE_PROJECTS.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </section>
        )}

        {/* feature strip */}
        <div className="mx-auto mt-14 max-w-5xl border border-white/10 bg-[#0c0c0c]">
          <FeatureStrip />
        </div>
      </main>
    </div>
  );
}