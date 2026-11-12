import { Link } from "@tanstack/react-router";
import { FileCode2, ArrowUpRight } from "lucide-react";

export function ProjectCard({ project }) {
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="group flex flex-col justify-between rounded-sm border border-white/10 bg-card/70 p-4 transition hover:border-[#b0c4de]/35 hover:bg-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-white">
          {project.name}
        </h3>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-[#e0f7ff]" />
      </div>
      <p className="mt-2 line-clamp-2 font-body text-[12.5px] leading-relaxed text-muted-foreground">
        {project.summary || "No summary yet."}
      </p>
      <div className="mt-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <FileCode2 className="h-3 w-3" strokeWidth={1.6} />
          {project.file_count ?? 0} files
        </span>
        <span className="text-white/15">/</span>
        <span>{project.model || "auto"}</span>
      </div>
    </Link>
  );
}