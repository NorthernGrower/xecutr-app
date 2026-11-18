import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, Files, MessageSquare, Pencil, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import ChatPane from "@/components/workspace/ChatPane";
import FilePanel from "@/components/workspace/FilePanel";
import GitHubRepoButton from "@/components/workspace/GitHubRepoButton";
import DeleteProjectButton from "@/components/projects/DeleteProjectButton";
import PublishProjectButton from "@/components/projects/PublishProjectButton";
import SyncRepoButton from "@/components/projects/SyncRepoButton";
import ProjectPreview from "@/components/workspace/ProjectPreview";
import ProjectRail from "@/components/workspace/ProjectRail";
import { useAuth } from "@/lib/AuthContext";
import { useLayoutMode } from "@/hooks/use-layout-mode";

export const Route = createFileRoute("/projects/$projectId")({
  ssr: false,
  // The landing page hands a plan choice over when it opens a new project.
  validateSearch: z.object({ mode: z.enum(["plan", "build"]).optional() }).parse,
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
  const { mode: searchMode } = Route.useSearch();
  const { user, isLoadingAuth, navigateToLogin } = useAuth();
  const { isMobile } = useLayoutMode();
  const navigate = useNavigate();

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
      const [record, openMessages, projectFiles, all] = await Promise.all([
        base44.entities.Project.get(projectId).catch(() => null),
        // Newest first (a limit with an ascending sort returns the *oldest*
        // turns), then put back in reading order.
        base44.entities.Message.filter({ project_id: projectId }, "-created_date", 200).then((rows) =>
          (rows || []).slice().reverse(),
        ),
        base44.entities.ProjectFile.filter({ project_id: projectId }, "path", 100),
        base44.entities.Project.filter({}, "-updated_date", 40),
      ]);
      if (!alive) return;
      const messages = openMessages;

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
    if (isMobile) setPane("files");
  };

  if (!isLoadingAuth && !user) {
    return (
      <div className="min-h-screen bg-background">
        <WorkspaceHeader />
        <SignInPrompt onSignIn={() => navigateToLogin()} />
      </div>
    );
  }

  const titleBlock = renaming ? (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const name = nameDraft.trim();
        if (!name) return;
        try {
          await base44.entities.Project.update(projectId, { name });
          setProject({ ...project, name });
          setRenaming(false);
        } catch {
          /* the input stays open with the typed name */
        }
      }}
      className="flex min-w-0 items-center gap-1.5"
    >
      <input
        autoFocus
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-sm border border-[#b0c4de]/40 bg-white px-2 font-display text-[12px] uppercase tracking-[0.1em] text-foreground outline-none sm:w-56"
      />
      <button
        type="submit"
        disabled={!nameDraft.trim()}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border border-[#e0f7ff]/40 bg-[#e0f7ff]/[0.08] px-2 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0e7490] transition hover:bg-[#e0f7ff]/[0.16] disabled:opacity-40"
      >
        <Check className="h-3 w-3" strokeWidth={2.4} />
        save
      </button>
      <button
        type="button"
        onClick={() => setRenaming(false)}
        aria-label="Cancel renaming"
        className="inline-flex h-8 shrink-0 items-center rounded-sm border border-white/15 px-2 text-muted-foreground transition hover:text-white"
      >
        <X className="h-3 w-3" strokeWidth={2.2} />
      </button>
    </form>
  ) : (
    <span className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => {
          setNameDraft(project?.name || "");
          setRenaming(true);
        }}
        className="min-w-0 truncate text-left font-display text-[12.5px] font-semibold uppercase tracking-[0.14em] text-white hover:text-[#e0f7ff]"
        title="Rename this project"
      >
        {title}
      </button>
      <button
        type="button"
        onClick={() => {
          setNameDraft(project?.name || "");
          setRenaming(true);
        }}
        aria-label="Rename this project"
        title="Rename this project"
        className="shrink-0 rounded-sm p-1 text-muted-foreground/70 transition hover:text-[#0e7490]"
      >
        <Pencil className="h-3 w-3" strokeWidth={1.8} />
      </button>
    </span>
  );

  const deleteButton = (
    <DeleteProjectButton
      project={project}
      onDeleted={() => navigate({ to: "/projects" })}
      className="rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-red-500/40 hover:text-red-600"
    />
  );

  // The phone bar holds three short things: a name, a count and two icons.
  const mobileDeleteButton = (
    <DeleteProjectButton
      project={project}
      onDeleted={() => navigate({ to: "/projects" })}
      iconOnly
      className="rounded-sm border border-white/10 p-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-red-500/40 hover:text-red-600"
    />
  );

  /**
   * The phone layout: one pane at a time, a thin project bar, and a bottom tab
   * bar within reach of a thumb. The desktop layout below keeps the rail, the
   * side-by-side panes and the inline toolbar.
   */
  if (isMobile) {
    const tabs = [
      { id: "chat", label: "chat", Icon: MessageSquare },
      { id: "files", label: "files", Icon: Files },
      { id: "preview", label: "preview", Icon: Eye },
    ];

    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
        <WorkspaceHeader providerLabel={headerLabel} />

        <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
          {titleBlock}
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {files.length} files
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <SyncRepoButton
              project={project}
              onSynced={reload}
              iconOnly
              className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 p-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-[#b0c4de]/40 hover:text-white"
            />
            <PublishProjectButton
              project={project}
              iconOnly
              className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 p-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:border-[#e0f7ff]/40 hover:text-[#e0f7ff]"
            />
            <GitHubRepoButton project={project} onSaved={reload} iconOnly />
            {mobileDeleteButton}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {pane === "chat" && (
            <div className="h-full px-3">
              <ChatPane
                key={projectId}
                projectId={projectId}
                initialMessages={boot}
                pendingPrompt={pendingPrompt}
                onSaved={reload}
                onOpenFile={openFile}
                mode={searchMode || "build"}
              />
            </div>
          )}

          {pane === "files" && (
            <div className="h-full px-3 pb-2">
              <FilePanel
                project={project}
                files={files}
                selected={selected}
                onSelect={setSelected}
                onRefresh={reload}
                onPreview={() => setPane("preview")}
              />
            </div>
          )}

          {pane === "preview" && (
            <div className="h-full px-3 pb-2">
              <ProjectPreview project={project} files={files} />
            </div>
          )}
        </div>

        <nav
          className="grid shrink-0 grid-cols-3 border-t border-white/[0.07] bg-card/80"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {tabs.map(({ id, label, Icon }) => {
            const active = pane === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setPane(id)}
                aria-label={label}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1 py-2.5 font-mono text-[9px] uppercase tracking-[0.16em] transition ${
                  active ? "text-[#e0f7ff]" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <WorkspaceHeader providerLabel={headerLabel} />

      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 gap-0 px-0 sm:px-3">
        <aside className="hidden w-52 shrink-0 border-r border-white/[0.07] lg:block">
          <ProjectRail projects={projects} activeId={projectId} />
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col border-white/[0.07] sm:border-x">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.07] px-3 py-2 sm:px-4 sm:py-2.5">
            {titleBlock}

            <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
              {files.length} files · {project?.message_count || 0} msgs
            </span>

            <div className="ml-auto flex w-full flex-wrap items-center justify-start gap-1 sm:w-auto sm:justify-end">
              <SyncRepoButton
                project={project}
                onSynced={reload}
                className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-50"
              />
              <PublishProjectButton
                project={project}
                className="inline-flex items-center gap-1.5 rounded-sm border border-[#e0f7ff]/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.08] disabled:opacity-50"
              />
              <GitHubRepoButton project={project} onSaved={reload} />
              {deleteButton}
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
                <span className="hidden sm:inline">chat</span>
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
                <span className="hidden sm:inline">preview</span>
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
                <span className="hidden sm:inline">files</span>
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
              mode={searchMode || "build"}
            />
          </div>

          <div className={`min-h-0 flex-1 px-3 pb-3 sm:px-4 ${pane !== "chat" ? "block" : "hidden"}`}>
            <ProjectPreview project={project} files={files} />
          </div>

          {pane === "files" && (
            <div className="min-h-0 flex-1 px-3 pb-3 md:hidden">
              <FilePanel
                project={project}
                files={files}
                selected={selected}
                onSelect={setSelected}
                onRefresh={reload}
                onPreview={() => setPane("preview")}
              />
            </div>
          )}
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