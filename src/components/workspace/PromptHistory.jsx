import { useState } from "react";
import { Check, History, ListTodo, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Prompts already sent here, newest first — click one to load it back.
 *
 * The X removes a prompt from this list for good (it is remembered on this
 * device, not only until the next reload), and the pin button keeps it as a
 * project task instead, for the prompts that describe work still to do.
 */
export default function PromptHistory({ prompts, onPick, onDelete, onToTask }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState([]);

  const pin = async (entry) => {
    if (!onToTask) return;
    const done = await onToTask(entry);
    if (done) setPinned((prev) => (prev.includes(entry) ? prev : [...prev, entry]));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!prompts.length}
          title="Prompt history"
          aria-label="Prompt history"
          className="inline-flex items-center gap-1 rounded-sm border border-white/10 px-1.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white disabled:opacity-35"
        >
          <History className="h-3 w-3" strokeWidth={1.6} />
          {prompts.length > 0 && prompts.length}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[300px] border-white/10 bg-[#121212] p-1"
      >
        <p className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          prompt history
        </p>
        <div className="max-h-64 overflow-auto">
          {prompts.map((entry, i) => (
            <div
              key={`${i}-${entry.slice(0, 12)}`}
              className="group flex items-start gap-0.5 rounded-sm transition hover:bg-white/[0.05]"
            >
              <button
                type="button"
                onClick={() => {
                  onPick(entry);
                  setOpen(false);
                }}
                className="min-w-0 flex-1 rounded-sm px-2 py-1.5 text-left font-body text-[12px] leading-snug text-[#c9d3de] hover:text-white"
              >
                <span className="line-clamp-2">{entry}</span>
              </button>

              {onToTask && (
                <button
                  type="button"
                  onClick={() => pin(entry)}
                  title="Keep this prompt as a task"
                  aria-label="Keep this prompt as a task"
                  className="mt-1 shrink-0 rounded-sm p-1 text-muted-foreground/60 transition hover:text-[#0e7490]"
                >
                  {pinned.includes(entry) ? (
                    <Check className="h-3 w-3" strokeWidth={2.2} />
                  ) : (
                    <ListTodo className="h-3 w-3" strokeWidth={1.8} />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => onDelete(entry)}
                title="Delete from prompt history"
                aria-label="Delete this prompt from history"
                className="mt-1 shrink-0 rounded-sm p-1 text-muted-foreground/60 transition hover:text-red-600"
              >
                <X className="h-3 w-3" strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
        <p className="px-2 pb-1 pt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
          X deletes · pin keeps it as a task
        </p>
      </PopoverContent>
    </Popover>
  );
}
