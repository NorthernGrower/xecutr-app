import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";

const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Mints a short-lived, read-only address that serves one of the caller's
 * projects. Ownership is checked with the caller's own client, so the entity
 * rules decide whether the project is theirs.
 */
export const createPreviewLink = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ projectId: z.string().max(64) }))
  .handler(async ({ data, context }) => {
    const project = await context
      .getBase44()
      .entities.Project.get(data.projectId)
      .catch(() => null);
    if (!project) return { error: "That project is not available." };

    const admin = context.getBase44().asServiceRole;
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const expires_at = new Date(Date.now() + TTL_MS).toISOString();

    await admin.entities.PreviewSession.deleteMany({ project_id: data.projectId });
    await admin.entities.PreviewSession.create({ token, project_id: data.projectId, expires_at });

    return { token, expires_at };
  });