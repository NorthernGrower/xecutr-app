import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Github } from "lucide-react";
import StatusPill from "@/components/projects/StatusPill";
import ProjectDownloadButton from "@/components/projects/ProjectDownloadButton";
import ProjectGitHubButton from "@/components/projects/ProjectGitHubButton";
import DeleteProjectButton from "@/components/projects/DeleteProjectButton";
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
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-md border border-white/[0.08] bg-gradient-to-b from-card to-[#0a0a0a] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#b0c4de]/30 hover:shadow-[0_20px_45px_-28px_rgba(224,247,255,0.45)]">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#b0c4de]/60 to-transparent" />

      <div className="flex items-start justify-between gap-2">
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="min-w-0 font-display text-[13px] font-semibold uppercase leading-tight tracking-[0.1em] text-white transition hover:text-[#e0f7ff]"
        >
          <span className="line-clamp-2">{project.name}</span>
        </Link>
        <StatusPill status={projectStatus(project)} />
      </div>

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