import { Link } from "@tanstack/react-router";
import { FolderGit2, MessageSquare } from "lucide-react";
import { kindClass, timeAgo } from "@/lib/tasks";

function ProjectLink({ task }) {
  if (!task.project_id) {
    return task.project_name ? (
      <span className="truncate">{task.project_name}</span>
    ) : (
      <span className="truncate">unassigned</span>
    );
  }
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: task.project_id }}
      className="inline-flex min-w-0 items-center gap-1 transition hover:text-white"
    >
      <FolderGit2 className="h-3 w-3 shrink-0" strokeWidth={1.6} />
      <span className="truncate">{task.project_name || "project"}</span>
    </Link>
  );
}

/** One piece of agent work on the board. */
export default function TaskCard({ task }) {
  return (
    <article className="rounded-sm border border-white/10 bg-card/70 p-3 transition hover:border-[#b0c4de]/30">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-sm border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.16em] ${kindClass(task.kind)}`}
        >
          {task.kind || "build"}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {timeAgo(task.updated_date)}
        </span>
      </div>

      <p className="mt-2 font-body text-[12.5px] leading-snug text-[#eef3f8]">{task.title}</p>
      {task.note && (
        <p className="mt-1.5 font-body text-[11.5px] leading-relaxed text-muted-foreground">
          {task.note}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-3 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/80">
        <ProjectLink task={task} />
        {task.conversation_id && (
          <Link
            to="/agent/$conversationId"
            params={{ conversationId: task.conversation_id }}
            className="ml-auto inline-flex shrink-0 items-center gap-1 transition hover:text-white"
          >
            <MessageSquare className="h-3 w-3" strokeWidth={1.6} />
            session
          </Link>
        )}
      </div>
    </article>
  );
}