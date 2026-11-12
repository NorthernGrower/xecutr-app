const DAY_MS = 86400000;

/** The freshest timestamp a project carries. */
export function stampOf(project) {
  return project.last_activity || project.updated_date || project.created_date || null;
}

/** Where a project sits, derived from when it last did anything. */
export function projectStatus(project) {
  const stamp = stampOf(project);
  const age = stamp ? Date.now() - new Date(stamp).getTime() : null;
  if (age === null || !Number.isFinite(age)) {
    return { key: "idle", label: "idle", tone: "gray" };
  }
  if (!project.file_count && age < DAY_MS) {
    return { key: "new", label: "starting", tone: "steel" };
  }
  if (age < DAY_MS) return { key: "active", label: "active today", tone: "cyan" };
  if (age < 7 * DAY_MS) return { key: "week", label: "this week", tone: "steel" };
  return { key: "idle", label: "idle", tone: "gray" };
}

export function formatRelative(stamp) {
  if (!stamp) return "no activity";
  const age = Date.now() - new Date(stamp).getTime();
  if (!Number.isFinite(age) || age < 60000) return "just now";
  const minutes = Math.floor(age / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(stamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function dashboardStats(projects) {
  const today = projects.filter((project) => {
    const stamp = stampOf(project);
    return stamp && Date.now() - new Date(stamp).getTime() < DAY_MS;
  }).length;
  return {
    total: projects.length,
    today,
    files: projects.reduce((sum, project) => sum + (project.file_count || 0), 0),
    repos: projects.filter((project) => project.repo_url).length,
  };
}