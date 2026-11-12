import TaskCard from "@/components/tasks/TaskCard";

/** One status lane of the board. */
export default function TaskColumn({ status, tasks }) {
  return (
    <section className="flex min-h-[180px] flex-col rounded-sm border border-white/10 bg-[#0d0f11]/60">
      <header className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
        <span className={`h-1.5 w-1.5 rounded-full ${status.bar}`} />
        <span
          className={`font-display text-[10.5px] font-semibold uppercase tracking-[0.18em] ${status.text}`}
        >
          {status.label}
        </span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {tasks.length}
        </span>
      </header>

      <div className="flex-1 space-y-2 p-2">
        {tasks.length === 0 ? (
          <p className="px-1 py-6 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/50">
            {status.hint}
          </p>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </section>
  );
}