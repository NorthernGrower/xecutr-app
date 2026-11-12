import { useState } from "react";
import { FileArchive, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { downloadZip } from "@/lib/zip";

const PAGE = 100;
const MAX_PAGES = 10;

/** Pulls every file of one project and hands it over as a single zip. */
export default function ProjectDownloadButton({ project }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy || !project?.id) return;
    setBusy(true);
    try {
      const files = [];
      let cursor = null;
      for (let i = 0; i < MAX_PAGES; i++) {
        const page = await base44.entities.ProjectFile.filter(
          { project_id: project.id },
          { sort: "path", limit: PAGE, ...(cursor ? { cursor } : {}) },
        );
        const items = Array.isArray(page) ? page : page.items || [];
        files.push(...items);
        cursor = Array.isArray(page) ? null : page.has_more ? page.next_cursor : null;
        if (!cursor) break;
      }
      if (files.length) downloadZip(files, project.name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy || !project?.file_count}
      title="Download every file in this project as a zip"
      className="inline-flex items-center gap-1 transition hover:text-[#e0f7ff] disabled:opacity-40 disabled:hover:text-muted-foreground"
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <FileArchive className="h-3 w-3" strokeWidth={1.6} />
      )}
      zip
    </button>
  );
}