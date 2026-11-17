import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { postProjectFiles } from "@/lib/xecutr.server";

/**
 * Publish a project on its own subdomain: its whole file set goes to this
 * server's disk through the gateway, and `<slug>.xecutr.cloud` serves it.
 *
 * The files stay in the project too — this is a copy on the machine that built
 * them, not a move.
 */
export const publishProject = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ projectId: z.string().min(1).max(64) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();

    const project = await base44.entities.Project.get(data.projectId).catch(() => null);
    if (!project) return { ok: false, error: "That project is gone." };

    const rows = await base44.entities.ProjectFile.filter({ project_id: data.projectId }, "path", 500);
    const files = (rows || [])
      .filter((row) => row?.path)
      .map((row) => ({ path: row.path, content: row.content || "" }));
    if (!files.length) {
      return { ok: false, error: "This project has no files to publish yet." };
    }

    try {
      const result = await postProjectFiles({
        projectId: data.projectId,
        projectName: project.name || "",
        files,
        publish: true,
      });
      return { ok: true, url: result.url, slug: result.slug, files: result.files };
    } catch (err) {
      return { ok: false, error: err?.message || "The server could not take the files." };
    }
  });
