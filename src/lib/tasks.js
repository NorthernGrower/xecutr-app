import { base44 } from "@/api/base44Client";

/** Board columns, in the order they are read: what is live first. */
export const TASK_STATUSES = [
  { key: "working", label: "working", hint: "in progress now", bar: "bg-[#e0f7ff]", text: "text-[#e0f7ff]" },
  { key: "queued", label: "queued", hint: "not started yet", bar: "bg-[#b0c4de]/60", text: "text-[#b0c4de]" },
  { key: "blocked", label: "blocked", hint: "needs your call", bar: "bg-amber-300", text: "text-amber-300" },
  { key: "done", label: "done", hint: "in place", bar: "bg-emerald-300", text: "text-emerald-300" },
  { key: "failed", label: "failed", hint: "could not finish", bar: "bg-red-300", text: "text-red-300" },
];

export const taskStatus = (key) => TASK_STATUSES.find((s) => s.key === key) || TASK_STATUSES[1];

const KINDS = {
  build: "border-[#e0f7ff]/30 text-[#e0f7ff]",
  edit: "border-violet-300/30 text-violet-300",
  audit: "border-amber-300/30 text-amber-300",
  debug: "border-red-300/30 text-red-300",
  inspect: "border-[#b0c4de]/30 text-[#b0c4de]",
};

export const kindClass = (kind) => KINDS[kind] || KINDS.build;

/** The signed-in user's tasks, most recently touched first. */
export async function listTasks() {
  const page = await base44.entities.AgentTask.list({ sort: "-updated_date", limit: 150 });
  return page.items || [];
}

/** Short "3m ago" style stamp, safe to call after mount. */
export function timeAgo(iso) {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}