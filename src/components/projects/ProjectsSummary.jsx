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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {TILES.map((tile) => (
        <div
          key={tile.key}
          className="rounded-sm border border-white/10 bg-card/60 px-3.5 py-3"
        >
          <p className="font-display text-[22px] font-semibold leading-none text-white tabular-nums">
            {stats[tile.key]}
          </p>
          <p className="mt-1.5 label-mono">{tile.label}</p>
        </div>
      ))}
    </div>
  );
}