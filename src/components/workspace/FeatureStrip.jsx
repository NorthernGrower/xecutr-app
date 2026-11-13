const FEATURES = [
  { title: "ultra-fast coding agent", body: "Answers stream token by token, files land as they are written." },
  { title: "advanced AI assistance", body: "Auto routing picks the best ready provider, then fails over." },
  { title: "flexible workflows", body: "Bring your own keys, or start keyless and switch later." },
  { title: "no limits on your ideas", body: "Every project keeps its files and its own memory." },
];

/** Column rules: stacked on phones, two up on tablets, four across on desktop. */
const BORDERS = [
  "px-5 py-5",
  "px-5 py-5 border-t border-white/10 sm:border-l sm:border-t-0",
  "px-5 py-5 border-t border-white/10 lg:border-l lg:border-t-0",
  "px-5 py-5 border-t border-white/10 sm:border-l lg:border-t-0",
];

export default function FeatureStrip() {
  return (
    <div className="grid grid-cols-1 border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map((f, i) => (
        <div key={f.title} className={BORDERS[i]}>
          <p className="font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-white">
            {f.title}
          </p>
          <p className="mt-2 font-body text-[12.5px] leading-relaxed text-muted-foreground">{f.body}</p>
        </div>
      ))}
    </div>
  );
}