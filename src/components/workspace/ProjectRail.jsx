import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

/** Left rail: the signed-in user's projects. */
export default function ProjectRail({ projects, activeId }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="label-mono">projects</span>
        <Link
          to="/"
          className="rounded-sm border border-white/10 p-1 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
          aria-label="New project"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-3">
        {projects.length === 0 && (
          <p className="px-2 py-2 font-body text-[12px] leading-relaxed text-muted-foreground">
            No projects yet — send a prompt to start one.
          </p>
        )}
        {projects.map((project) => (
          <Link
            key={project.id}
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className={`mb-1 block truncate rounded-sm px-2.5 py-2 font-mono text-[11.5px] transition ${
              project.id === activeId
                ? "bg-[#e0f7ff]/[0.07] text-[#e0f7ff]"
                : "text-[#9aa6b2] hover:bg-white/[0.03] hover:text-white"
            }`}
          >
            {project.name}
          </Link>
        ))}
      </div>
    </div>
  );
}