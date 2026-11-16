const FEATURES = [
  { title: "prompt to project", body: "One prompt starts a project. Plan first if you like, then build: files land in the project as they are written." },
  { title: "a model chain, not a model", body: "The fastest hosted provider answers first, the chain walks down by speed, and refusals land on this server's own model." },
  { title: "your keys, or none", body: "Start keyless, then add Groq, Gemini, OpenAI or any other provider under Connections — or one shared key for everyone." },
  { title: "memory that survives", body: "Files, pinned tasks and notes travel with the project, so trimming the conversation never loses what matters." },
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