import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Github } from "lucide-react";
import StatusPill from "@/components/projects/StatusPill";
import { formatRelative, projectStatus, stampOf } from "@/lib/project-status";

function Stat({ label, value }) {
  return (
    <div>
      <p className="font-mono text-[13px] text-white">{value}</p>
      <p className="mt-0.5 label-mono">{label}</p>
    </div>
  );
}

export default function ProjectStatusCard({ project }) {
  return (
    <div className="flex flex-col rounded-sm border border-white/10 bg-card/70 p-4 transition hover:border-[#b0c4de]/35 hover:bg-card">
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

      <p className="mt-2 line-clamp-2 font-body text-[12.5px] leading-relaxed text-muted-foreground">
        {project.summary || "No summary yet."}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
        <Stat label="files" value={project.file_count ?? 0} />
        <Stat label="turns" value={project.message_count ?? 0} />
        <Stat label="model" value={project.model || "auto"} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span>{formatRelative(stampOf(project))}</span>
        <div className="flex items-center gap-3">
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
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex items-center gap-1 transition hover:text-[#e0f7ff]"
          >
            open
            <ArrowUpRight className="h-3 w-3" strokeWidth={1.8} />
          </Link>
        </div>
      </div>
    </div>
  );
}