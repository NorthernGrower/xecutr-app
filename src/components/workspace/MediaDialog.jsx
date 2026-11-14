import { useEffect, useState } from "react";
import { Clapperboard, Image as ImageIcon, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import useMediaJob from "@/hooks/use-media-job";
import { mediaHealth } from "@/lib/media";

const KINDS = [
  { id: "image", label: "image", icon: ImageIcon, hint: "seconds per image on this CPU" },
  { id: "video", label: "clip", icon: Clapperboard, hint: "minutes per clip on this CPU" },
];

const SIZES = [384, 512, 640];

const Field = ({ label, children }) => (
  <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
    {label}
    {children}
  </label>
);

const selectClass =
  "rounded-sm border border-white/10 bg-[#0b0b0b] px-1.5 py-1 font-mono text-[10px] text-[#dfe6ee] outline-none focus:border-[#b0c4de]/50";

/**
 * Generate one image or clip with the models this deployment runs itself
 * (deploy/media). A clip is minutes of CPU, so the job is followed by polling
 * and the dialog stays open with its progress until the file lands.
 */
export default function MediaDialog({ open, onOpenChange, onGenerated }) {
  const [kind, setKind] = useState("image");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState(512);
  const [steps, setSteps] = useState(2);
  const [frames, setFrames] = useState(16);
  const [health, setHealth] = useState(null);

  const { job, error, busy, run } = useMediaJob();

  useEffect(() => {
    if (!open || health) return undefined;
    let alive = true;
    mediaHealth()
      .then((next) => {
        if (alive) setHealth(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, health]);

  const submit = async (event) => {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;

    const request =
      kind === "image"
        ? { kind, prompt: text, size, steps }
        : { kind, prompt: text, size, steps: Math.max(steps, 4), frames };

    const done = await run(request);
    if (done) onGenerated?.({ ...done, kind, prompt: text });
  };

  const progress = Math.round((job?.progress || 0) * 100);
  const src = job?.dataUrl || job?.url || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0b0b0b] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[13px] uppercase tracking-[0.16em] text-white">
            generate media
          </DialogTitle>
          <DialogDescription className="font-body text-[12px] leading-relaxed text-muted-foreground">
            Runs the open Hugging Face models installed on this server. One job at a time — images
            take seconds, clips take minutes, and a running job holds the model in RAM.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="inline-flex overflow-hidden rounded-sm border border-white/10">
            {KINDS.map(({ id, label, icon: Icon, hint }) => {
              const active = kind === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={hint}
                  onClick={() => setKind(id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
                    active
                      ? "bg-[#e0f7ff]/[0.14] text-[#e0f7ff]"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="a dusk coastline, long exposure, teal and amber, low horizon"
            className="w-full resize-none rounded-sm border border-white/10 bg-[#11151a] px-3 py-2.5 font-body text-[13px] leading-relaxed text-[#eef3f8] outline-none placeholder:text-[#7e8b99] focus:border-[#b0c4de]/40"
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Field label="size">
              <select value={size} onChange={(e) => setSize(Number(e.target.value))} className={selectClass}>
                {SIZES.map((value) => (
                  <option key={value} value={value}>
                    {value}px
                  </option>
                ))}
              </select>
            </Field>

            <Field label="steps">
              <select value={steps} onChange={(e) => setSteps(Number(e.target.value))} className={selectClass}>
                {(kind === "image" ? [1, 2, 3, 4] : [2, 4, 6, 8]).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>

            {kind === "video" && (
              <Field label="frames">
                <select value={frames} onChange={(e) => setFrames(Number(e.target.value))} className={selectClass}>
                  {[12, 16, 24, 32].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="inline-flex items-center gap-2 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:border-[#e0f7ff]/70 hover:bg-[#e0f7ff]/[0.14] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-muted-foreground"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy ? `generating ${progress}%` : "generate"}
            </button>

            {job?.status === "queued" && !busy && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                queued
              </span>
            )}
            {!busy && job?.status === "done" && job?.seconds != null && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b0c4de]">
                {job.seconds}s
              </span>
            )}
            {error && (
              <span className="font-body text-[11.5px] leading-relaxed text-red-300">{error}</span>
            )}
          </div>

          {src && (
            <figure className="overflow-hidden rounded-sm border border-white/10 bg-black/30">
              {job.kind === "video" ? (
                <video src={src} controls playsInline className="w-full" />
              ) : (
                <img src={src} alt={job.prompt || "generated"} className="w-full" />
              )}
              <figcaption className="truncate px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                saved into the project as assets/generated/{job.kind}
              </figcaption>
            </figure>
          )}

          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
            {health?.ok
              ? `${health.image_model} · ${health.video_model}`
              : health?.error || "checking the media service…"}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
