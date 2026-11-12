import { useState } from "react";
import { History } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Prompts already sent in this project, newest first — click one to load it back. */
export default function PromptHistory({ prompts, onPick }) {
  const [open, setOpen] = useState(false);

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
            <button
              key={`${i}-${entry.slice(0, 12)}`}
              type="button"
              onClick={() => {
                onPick(entry);
                setOpen(false);
              }}
              className="block w-full rounded-sm px-2 py-1.5 text-left font-body text-[12px] leading-snug text-[#c9d3de] transition hover:bg-white/[0.05] hover:text-white"
            >
              {entry}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}