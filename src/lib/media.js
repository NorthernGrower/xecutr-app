import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";
import { fetchMediaHealth, fetchMediaJob, postMediaJob } from "@/lib/xecutr.server";

/**
 * Image and clip generation runs on this deployment's own CPU (deploy/media).
 * It is expensive and serial, so only a signed-in member may start a job.
 */
const requestSchema = z.object({
  kind: z.enum(["image", "video"]),
  prompt: z.string().trim().min(1).max(900),
  steps: z.number().int().min(1).max(8).optional(),
  size: z.number().int().min(256).max(768).optional(),
  frames: z.number().int().min(8).max(32).optional(),
  seed: z.number().int().min(0).max(2147483647).optional(),
});

/** Queue one generation; resolves with the job to poll. */
export const startMedia = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(requestSchema)
  .handler(async ({ data }) => postMediaJob(data));

/** Poll one job; a finished job carries its bytes. */
export const mediaJob = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ id: z.string().min(4).max(64) }))
  .handler(async ({ data }) => fetchMediaJob(data.id));

/** Which models the server has, for the media panel's status line. */
export const mediaHealth = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(() => fetchMediaHealth());
