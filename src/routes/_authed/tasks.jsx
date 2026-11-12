import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import TaskColumn from "@/components/tasks/TaskColumn";
import { TASK_STATUSES, listTasks } from "@/lib/tasks";

export const Route = createFileRoute("/_authed/tasks")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "task board — xecutr" },
      {
        name: "description",
        content:
          "Live board of what the xecutr agent is working on in each project, and where that work stands.",
      },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState("all");

  useEffect(() => {
    let alive = true;
    const load = () =>
      listTasks()
        .then((rows) => alive && setTasks(rows))
        .finally(() => alive && setLoading(false));

    load();
    const unsubscribe = base44.entities.AgentTask.subscribe(() => load());
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const projects = useMemo(() => {
    const seen = new Map();
    tasks.forEach((task) => {
      const key = task.project_id || "unassigned";
      if (!seen.has(key)) seen.set(key, task.project_name || "unassigned");
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const visible = useMemo(
    () =>
      project === "all"
        ? tasks
        : tasks.filter((task) => (task.project_id || "unassigned") === project),
    [tasks, project],
  );

  const countFor = (key) => visible.filter((task) => task.status === key).length;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <WorkspaceHeader />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-16 pt-8 sm:px-6">
        <p className="label-mono">task board</p>
        <h1 className="mt-2 font-display text-[24px] font-bold uppercase leading-none tracking-[0.03em] text-white sm:text-[30px]">
          what the agent is <span className="text-glow text-[#e0f7ff]">on</span>
        </h1>
        <p className="mt-2 max-w-2xl font-body text-[12.5px] leading-relaxed text-muted-foreground">
          Every project's work in one place. The agent logs each job as it starts and keeps its status
          current, so you can see what is running, what is waiting on you and what is already in place.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setProject("all")}
            className={`rounded-sm border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] transition ${
              project === "all"
                ? "border-[#e0f7ff]/40 bg-[#e0f7ff]/[0.08] text-[#e0f7ff]"
                : "border-white/10 text-muted-foreground hover:border-[#b0c4de]/40 hover:text-white"
            }`}
          >
            all projects
          </button>
          {projects.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setProject(item.id)}
              className={`max-w-[220px] truncate rounded-sm border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] transition ${
                project === item.id
                  ? "border-[#e0f7ff]/40 bg-[#e0f7ff]/[0.08] text-[#e0f7ff]"
                  : "border-white/10 text-muted-foreground hover:border-[#b0c4de]/40 hover:text-white"
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-10 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de]">
            <Loader2 className="h-3 w-3 animate-spin" />
            reading the board
          </div>
        ) : tasks.length === 0 ? (
          <div className="mt-6 rounded-sm border border-white/10 bg-card/60 p-5">
            <p className="font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-white">
              nothing logged yet
            </p>
            <p className="mt-2 max-w-xl font-body text-[12.5px] leading-relaxed text-muted-foreground">
              Open a session and ask the agent to build, audit or fix something in a project. It logs the
              job here the moment it starts, and keeps the status current as it goes.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {TASK_STATUSES.map((status) => (
              <TaskColumn
                key={status.key}
                status={status}
                tasks={visible.filter((task) => task.status === status.key)}
              />
            ))}
          </div>
        )}

        {!loading && tasks.length > 0 && (
          <p className="mt-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
            {countFor("working")} working · {countFor("blocked")} blocked · {countFor("done")} done
          </p>
        )}
      </main>
    </div>
  );
}