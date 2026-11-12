import { dashboardStats } from "@/lib/project-status";

const TILES = [
  { key: "total", label: "projects" },
  { key: "today", label: "active today" },
  { key: "files", label: "files written" },
  { key: "repos", label: "on github" },
];

export default function ProjectsSummary({ projects }) {
  const stats = dashboardStats(projects);

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {TILES.map((tile) => (
        <div
          key={tile.key}
          className="group relative overflow-hidden rounded-md border border-white/[0.08] bg-card/60 px-3.5 py-3.5 transition hover:border-[#b0c4de]/25 hover:bg-card"
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#b0c4de]/40 to-transparent opacity-0 transition group-hover:opacity-100" />
          <p className="font-display text-[24px] font-semibold leading-none text-white tabular-nums">
            {stats[tile.key]}
          </p>
          <p className="mt-2 label-mono">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}