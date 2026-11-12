const TONES = {
  cyan: "border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.08] text-[#e0f7ff]",
  steel: "border-[#b0c4de]/25 bg-[#b0c4de]/[0.06] text-[#b0c4de]",
  gray: "border-white/10 bg-white/[0.02] text-muted-foreground",
};

const DOTS = {
  cyan: "bg-[#e0f7ff]",
  steel: "bg-[#b0c4de]",
  gray: "bg-white/30",
};

export default function StatusPill({ status }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${
        TONES[status.tone] || TONES.gray
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status.tone] || DOTS.gray}`} />
      {status.label}
    </span>
  );
}