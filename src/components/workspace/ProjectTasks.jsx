import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ListTodo, Pencil, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

/**
 * The project's pinned task list, directly under the prompt window.
 *
 * It is the harness's memory of "what must not be forgotten": a reply that marks
 * a step adds it here, every turn sends the list along with the project, and the
 * person can add, edit, tick or delete anything themselves. Because it travels
 * with the turn, trimming the conversation never loses it.
 */
export default function ProjectTasks({ projectId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return [];
    return base44.entities.AgentTask.filter({ project_id: projectId }, "created_date", 100);
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((rows) => alive && setTasks(rows || []))
      .finally(() => alive && setLoading(false));

    // The harness writes tasks from a turn too; follow the entity, not a guess.
    const unsubscribe = base44.entities.AgentTask.subscribe(() => {
      load().then((rows) => alive && setTasks(rows || []));
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [load]);

  const openCount = useMemo(() => tasks.filter((t) => t.status !== "done").length, [tasks]);

  const refresh = async () => setTasks((await load()) || []);

  const add = async (event) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await base44.entities.AgentTask.create({ project_id: projectId, title, status: "queued", kind: "build" });
      setDraft("");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (task) => {
    await base44.entities.AgentTask.update(task.id, { status: task.status === "done" ? "queued" : "done" });
    await refresh();
  };

  const remove = async (task) => {
    await base44.entities.AgentTask.delete(task.id);
    await refresh();
  };

  const saveEdit = async (task) => {
    const title = editDraft.trim();
    setEditing(null);
    if (!title || title === task.title) return;
    await base44.entities.AgentTask.update(task.id, { title });
    await refresh();
  };

  const startEdit = (task) => {
    setEditing(task.id);
    setEditDraft(task.title);
  };

  return (
    <div className="mt-2 overflow-hidden rounded-sm border border-white/10 bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/[0.03]"
      >
        <ListTodo className="h-3 w-3 shrink-0 text-[#b0c4de]" strokeWidth={1.6} />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#b0c4de]">tasks</span>
        <span className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {loading ? "reading…" : `${openCount} open · ${tasks.length} total`}
        </span>
        <ChevronDown
          className={cn("ml-auto h-3 w-3 shrink-0 text-muted-foreground transition", open && "rotate-180")}
          strokeWidth={1.6}
        />
      </button>

      {open && (
        <div className="border-t border-white/10 px-2 py-2">
          <ul className="max-h-44 space-y-0.5 overflow-auto">
            {!loading && tasks.length === 0 && (
              <li className="px-2 py-1 font-body text-[11.5px] leading-relaxed text-muted-foreground">
                Nothing pinned yet. A reply that marks a step adds it here, and you can add one below.
              </li>
            )}

            {tasks.map((task) => {
              const done = task.status === "done";
              return (
                <li key={task.id} className="group flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => toggle(task)}
                    aria-label={done ? "Mark as open" : "Mark as done"}
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition",
                      done ? "border-emerald-600 bg-emerald-600 text-white" : "border-[#b0c4de]/50 hover:border-[#0e7490]",
                    )}
                  >
                    {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </button>

                  {editing === task.id ? (
                    <input
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => saveEdit(task)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveEdit(task);
                        }
                        if (e.key === "Escape") setEditing(null);
                      }}
                      className="h-6 min-w-0 flex-1 rounded-sm border border-[#b0c4de]/40 bg-white px-1.5 font-body text-[12px] text-foreground outline-none"
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startEdit(task)}
                      title="Double-click to edit"
                      className={cn(
                        "min-w-0 flex-1 truncate font-body text-[12px]",
                        done ? "text-muted-foreground line-through" : "text-foreground",
                      )}
                    >
                      {task.title}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => startEdit(task)}
                    aria-label="Edit task"
                    className="shrink-0 text-muted-foreground/60 transition hover:text-[#0e7490]"
                  >
                    <Pencil className="h-2.5 w-2.5" strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(task)}
                    aria-label="Delete task"
                    className="shrink-0 text-muted-foreground/60 transition hover:text-red-600"
                  >
                    <X className="h-3 w-3" strokeWidth={2} />
                  </button>
                </li>
              );
            })}
          </ul>

          <form onSubmit={add} className="mt-1.5 flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="add a step to keep in view…"
              className="h-7 min-w-0 flex-1 rounded-sm border border-white/10 bg-white px-2 font-body text-[12px] text-foreground outline-none placeholder:text-[#94a3b8] focus:border-[#b0c4de]/50"
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label="Add task"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-sm border border-[#e0f7ff]/30 bg-[#e0f7ff]/[0.05] px-2 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e0f7ff] transition hover:bg-[#e0f7ff]/[0.14] disabled:opacity-40"
            >
              <Plus className="h-3 w-3" strokeWidth={2} />
              add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
