import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, Github, Loader2, Pencil, X } from "lucide-react";
import StatusPill from "@/components/projects/StatusPill";
import ProjectDownloadButton from "@/components/projects/ProjectDownloadButton";
import ProjectGitHubButton from "@/components/projects/ProjectGitHubButton";
import DeleteProjectButton from "@/components/projects/DeleteProjectButton";
import { base44 } from "@/api/base44Client";
import { formatRelative, projectStatus, stampOf } from "@/lib/project-status";

function Stat({ label, value }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <p className="truncate font-mono text-[13px] text-white">{value}</p>
      <p className="mt-0.5 label-mono">{label}</p>
    </div>
  );
}

export default function ProjectStatusCard({ project, onDeleted, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    const name = draft.trim();
    if (!name) {
      setError("A project needs a name.");
      return;
    }
    if (name === (project?.name || "")) {
      setEditing(false);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await base44.entities.Project.update(project.id, { name });
      onSaved?.();
      setEditing(false);
    } catch (err) {
      setError(err?.message || "The name could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-md border border-white/[0.08] bg-gradient-to-b from-card to-[#0a0a0a] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#b0c4de]/30 hover:shadow-[0_20px_45px_-28px_rgba(224,247,255,0.45)]">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#b0c4de]/60 to-transparent" />

      {editing ? (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(project?.name || "");
                }
              }}
              className="h-8 min-w-0 flex-1 rounded-sm border border-[#b0c4de]/40 bg-white px-2 font-display text-[13px] uppercase tracking-[0.08em] text-foreground outline-none"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy}
              title="Save the name"
              aria-label="Save the name"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border border-[#e0f7ff]/40 bg-[#e0f7ff]/[0.08] px-2 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0e7490] transition hover:bg-[#e0f7ff]/[0.16] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" strokeWidth={2.4} />}
              save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(project?.name || "");
                setError(null);
              }}
              aria-label="Cancel renaming"
              className="inline-flex h-8 shrink-0 items-center rounded-sm border border-white/15 px-2 text-muted-foreground transition hover:text-white"
            >
              <X className="h-3 w-3" strokeWidth={2.2} />
            </button>
          </div>
          {error && <p className="mt-1 font-body text-[11px] text-red-500">{error}</p>}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1.5">
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="min-w-0 font-display text-[13px] font-semibold uppercase leading-tight tracking-[0.1em] text-white transition hover:text-[#e0f7ff]"
            >
              <span className="line-clamp-2">{project.name}</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setDraft(project?.name || "");
                setEditing(true);
              }}
              title="Rename this project"
              aria-label="Rename this project"
              className="mt-0.5 shrink-0 rounded-sm p-1 text-muted-foreground/70 transition hover:text-[#0e7490]"
            >
              <Pencil className="h-3 w-3" strokeWidth={1.8} />
            </button>
          </div>
          <StatusPill status={projectStatus(project)} />
        </div>
      )}

      <p className="mt-2 line-clamp-2 min-h-[34px] font-body text-[12.5px] leading-relaxed text-muted-foreground">
        {project.summary || "No summary yet."}
      </p>

      <div className="mt-4 flex items-stretch divide-x divide-white/[0.07] rounded-sm border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
        <Stat label="files" value={project.file_count ?? 0} />
        <Stat label="turns" value={project.message_count ?? 0} />
        <Stat label="model" value={project.model || "auto"} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="truncate">{formatRelative(stampOf(project))}</span>
        <div className="flex shrink-0 items-center gap-3">
          <ProjectGitHubButton project={project} onSaved={onSaved} />
          <ProjectDownloadButton project={project} />
          {project.repo_url && (
            <a
              href={project.repo_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 transition hover:text-white"
            >
              <Github className="h-3 w-3" strokeWidth={1.6} />
              repo
            </a>
          )}
          <DeleteProjectButton project={project} onDeleted={onDeleted} />
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1 text-[#e0f7ff] transition hover:text-white"
          >
            open
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.8} />
          </Link>
        </div>
      </div>
    </div>
  );
}
