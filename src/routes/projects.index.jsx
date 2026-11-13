import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FolderGit2, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Panel from "@/components/workspace/Panel";
import ProjectsSummary from "@/components/projects/ProjectsSummary";
import ProjectStatusCard from "@/components/projects/ProjectStatusCard";
import ImportRepoDialog from "@/components/projects/ImportRepoDialog";
import GitHubConnectionCard from "@/components/workspace/GitHubConnectionCard";
import { useAuth } from "@/lib/AuthContext";

export const Route = createFileRoute("/projects/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "projects — xecutr" },
      {
        name: "description",
        content: "Every project you've started, with its status, activity and files at a glance.",
      },
    ],
  }),
  component: ProjectsDashboard,
});

function ProjectsDashboard() {
  const { user, isLoadingAuth, navigateToLogin } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let alive = true;
    base44.entities.Project.filter({}, "-updated_date", 100).then((rows) => {
      if (!alive) return;
      setProjects(rows || []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const removeProject = (id) => setProjects((prev) => prev.filter((p) => p.id !== id));

  // After a push the card picks up its new repo link.
  const refresh = () =>
    base44.entities.Project.filter({}, "-updated_date", 100).then((rows) => setProjects(rows || []));

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <WorkspaceHeader />

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-16 pt-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-mono">dashboard</p>
            <h1 className="mt-2 font-display text-[24px] font-bold uppercase leading-none tracking-[0.03em] text-white sm:text-[30px]">
              your <span className="text-glow text-[#e0f7ff]">projects</span>
            </h1>
            <p className="mt-2 max-w-md font-body text-[12.5px] leading-relaxed text-muted-foreground">
              Status, activity and output for everything you've started.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {user && (
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-white/15 px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:border-[#b0c4de]/50 hover:text-white"
              >
                <FolderGit2 className="h-3 w-3" strokeWidth={1.8} />
                import repo
              </button>
            )}
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-sm border border-[#e0f7ff]/30 bg-[#e0f7ff]/[0.05] px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14]"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              new project
            </Link>
          </div>
        </div>

        <ImportRepoDialog open={importOpen} onOpenChange={setImportOpen} />

        {!isLoadingAuth && !user && (
          <Panel className="mt-8 p-6 text-center">
            <p className="font-body text-[13px] text-muted-foreground">
              Sign in to see the projects you've built.
            </p>
            <button
              type="button"
              onClick={() => navigateToLogin()}
              className="mt-4 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14]"
            >
              sign in
            </button>
          </Panel>
        )}

        {user && (
          <>
            <div className="mt-7">
              <ProjectsSummary projects={projects} />
            </div>

            <div className="mt-4">
              <GitHubConnectionCard />
            </div>

            {loading ? (
              <p className="mt-8 label-mono">loading projects…</p>
            ) : projects.length === 0 ? (
              <Panel className="mt-8 p-8 text-center">
                <p className="font-display text-[13px] font-semibold uppercase tracking-[0.16em] text-white">
                  no projects yet
                </p>
                <p className="mx-auto mt-2 max-w-sm font-body text-[12.5px] leading-relaxed text-muted-foreground">
                  Send a prompt from the workspace and it shows up here with its status.
                </p>
                <Link
                  to="/"
                  className="mt-5 inline-flex items-center gap-1.5 rounded-sm border border-white/15 px-3.5 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition hover:border-[#b0c4de]/50"
                >
                  start a project
                </Link>
              </Panel>
            ) : (
              <>
                <div className="mt-8 flex items-center justify-between gap-3">
                  <p className="label-mono">all projects</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {projects.length} total
                  </span>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((project) => (
                    <ProjectStatusCard
                      key={project.id}
                      project={project}
                      onDeleted={removeProject}
                      onSaved={refresh}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}