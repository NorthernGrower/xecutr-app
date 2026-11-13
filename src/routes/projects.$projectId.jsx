import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, Files, MessageSquare } from "lucide-react";
import { base44 } from "@/api/base44Client";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import ChatPane from "@/components/workspace/ChatPane";
import FilePanel from "@/components/workspace/FilePanel";
import GitHubRepoButton from "@/components/workspace/GitHubRepoButton";
import ProjectPreview from "@/components/workspace/ProjectPreview";
import ProjectRail from "@/components/workspace/ProjectRail";
import { useAuth } from "@/lib/AuthContext";

export const Route = createFileRoute("/projects/$projectId")({
  ssr: false,
  head: () => ({ meta: [{ title: "project — xecutr" }] }),
  component: ProjectWorkspace,
});

const toUiMessage = (record) => ({
  id: record.id,
  role: record.role,
  provider: record.provider,
  model: record.model,
  parts: [{ type: "text", content: record.content || "" }],
});

function SignInPrompt({ onSignIn }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="label-mono">private workspace</p>
      <h2 className="mt-3 font-display text-[20px] uppercase tracking-[0.08em] text-white">
        sign in to open this project
      </h2>
      <p className="mt-3 font-body text-[13px] leading-relaxed text-muted-foreground">
        Projects, files and memory belong to one account and are invisible to everyone else.
      </p>
      <button
        type="button"
        onClick={onSignIn}
        className="mt-6 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14]"
      >
        sign in
      </button>
    </div>
  );
}

function ProjectWorkspace() {
  const { projectId } = Route.useParams();
  const { user, isLoadingAuth, navigateToLogin } = useAuth();

  const [project, setProject] = useState(null);
  const [boot, setBoot] = useState([]);
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [files, setFiles] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [pane, setPane] = useState("chat");

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!user || !projectId) return;
    let alive = true;

    (async () => {
      const [record, messages, projectFiles, all] = await Promise.all([
        base44.entities.Project.get(projectId).catch(() => null),
        base44.entities.Message.filter({ project_id: projectId }, "created_date", 200),
        base44.entities.ProjectFile.filter({ project_id: projectId }, "path", 100),
        base44.entities.Project.filter({}, "-updated_date", 40),
      ]);
      if (!alive) return;

      setProject(record);
      setFiles(projectFiles);
      setProjects(all);
      setSelected((prev) => prev || projectFiles[0]?.path || null);

      const open = messages[messages.length - 1];
      const waiting = open && open.role === "user";
      setPendingPrompt(waiting ? open.content : null);
      setBoot((waiting ? messages.slice(0, -1) : messages).map(toUiMessage));
    })();

    return () => {
      alive = false;
    };
  }, [user, projectId, refreshKey]);

  const title = project?.name || "loading…";
  const headerLabel = useMemo(
    () => (project?.provider ? `${project.provider}${project.model ? ` · ${project.model}` : ""}` : null),
    [project],
  );

  const openFile = (path) => {
    if (!path) return;
    setSelected(path);
    if (typeof window !== "undefined" && window.innerWidth < 768) setPane("files");
  };

  if (!isLoadingAuth && !user) {
    return (
      <div className="min-h-screen bg-background">
        <WorkspaceHeader />
        <SignInPrompt onSignIn={() => navigateToLogin()} />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <WorkspaceHeader providerLabel={headerLabel} />

      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 gap-0 px-0 sm:px-3">
        <aside className="hidden w-52 shrink-0 border-r border-white/[0.07] lg:block">
          <ProjectRail projects={projects} activeId={projectId} />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col border-white/[0.07] sm:border-x">
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-2.5">
            {renaming ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = nameDraft.trim();
                  if (name) {
                    await base44.entities.Project.update(projectId, { name });
                    setProject({ ...project, name });
                  }
                  setRenaming(false);
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-7 w-56 rounded-sm border border-[#b0c4de]/40 bg-[#0b0b0b] px-2 font-display text-[12px] uppercase tracking-[0.1em] text-white outline-none"
                />
                <button type="submit" className="text-[#e0f7ff]">
                  <Check className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(project?.name || "");
                  setRenaming(true);
                }}
                className="truncate font-display text-[12.5px] font-semibold uppercase tracking-[0.14em] text-white hover:text-[#e0f7ff]"
                title="Click to rename"
              >
                {title}
              </button>
            )}

            <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
              {files.length} files
            </span>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
              <GitHubRepoButton project={project} onSaved={reload} />
              <button
                type="button"
                onClick={() => setPane("chat")}
                aria-label="Chat"
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                  pane === "chat"
                    ? "border-[#e0f7ff]/40 bg-[#e0f7ff]/[0.06] text-[#e0f7ff]"
                    : "border-white/10 text-muted-foreground hover:text-white"
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.6} />
                chat
              </button>
              <button
                type="button"
                onClick={() => setPane("preview")}
                aria-label="Preview"
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                  pane !== "chat"
                    ? "border-[#e0f7ff]/40 bg-[#e0f7ff]/[0.06] text-[#e0f7ff]"
                    : "border-white/10 text-muted-foreground hover:text-white"
                }`}
              >
                <Eye className="h-3.5 w-3.5" strokeWidth={1.6} />
                preview
              </button>
              <button
                type="button"
                onClick={() => setPane("files")}
                aria-label="Files"
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] transition md:hidden ${
                  pane === "files"
                    ? "border-[#e0f7ff]/40 bg-[#e0f7ff]/[0.06] text-[#e0f7ff]"
                    : "border-white/10 text-muted-foreground"
                }`}
              >
                <Files className="h-3.5 w-3.5" strokeWidth={1.6} />
                files
              </button>
            </div>
          </div>

          <div className={`min-h-0 flex-1 px-3 sm:px-4 ${pane === "chat" ? "block" : "hidden"}`}>
            <ChatPane
              key={projectId}
              projectId={projectId}
              initialMessages={boot}
              pendingPrompt={pendingPrompt}
              onSaved={reload}
              onOpenFile={openFile}
            />
          </div>

          <div className={`min-h-0 flex-1 px-3 pb-3 sm:px-4 ${pane !== "chat" ? "block" : "hidden"}`}>
            <ProjectPreview project={project} files={files} />
          </div>

          <div className="min-h-0 flex-1 px-3 pb-3 md:hidden">
            {pane === "files" && (
              <FilePanel
                project={project}
                files={files}
                selected={selected}
                onSelect={setSelected}
                onRefresh={reload}
                onPreview={() => setPane("preview")}
              />
            )}
          </div>
        </main>

        <aside className="hidden w-[300px] shrink-0 border-l border-white/[0.07] md:block lg:w-[340px]">
          <FilePanel
            project={project}
            files={files}
            selected={selected}
            onSelect={setSelected}
            onRefresh={reload}
            onPreview={() => setPane("preview")}
          />
        </aside>
      </div>
    </div>
  );
}