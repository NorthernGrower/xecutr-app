import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { spendTrialMedia } from "@/lib/trial-quota.server";
import { fetchMediaHealth, fetchMediaJob, postMediaJob } from "@/lib/xecutr.server";

/**
 * Image, clip and track generation runs on this deployment's own CPU
 * (deploy/media). It is expensive and serial, so a signed-in member gets it
 * without limit — and the signed-out trial gets a taste: one small image or a
 * short track, a few times a day, so the tool is visible before signup.
 */
const requestSchema = z.object({
  kind: z.enum(["image", "video", "music"]),
  prompt: z.string().trim().min(1).max(900),
  steps: z.number().int().min(1).max(8).optional(),
  size: z.number().int().min(256).max(768).optional(),
  frames: z.number().int().min(8).max(32).optional(),
  seconds: z.number().int().min(5).max(480).optional(),
  seed: z.number().int().min(0).max(2147483647).optional(),
});

/** What the trial may ask for: no clips (minutes of CPU), short tracks, small frames. */
const TRIAL_MUSIC_SECONDS = 30;
const TRIAL_SIZE = 512;

const refuse = (message) => Object.assign(new Error(message), { status: 401 });

/** The visitor, or null — a signed-out caller is a first-class case here. */
const visitor = async (context) => {
  try {
    return await context.getBase44().auth.me();
  } catch {
    return null;
  }
};

/** Queue one generation; resolves with the job to poll. */
export const startMedia = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data, context }) => {
    if (await visitor(context)) return postMediaJob(data);

    if (data.kind === "video") throw refuse("Sign in to generate clips — each one is minutes of CPU.");
    if (data.kind === "music" && (data.seconds ?? 10) > TRIAL_MUSIC_SECONDS) {
      throw refuse(`Sign in for tracks longer than ${TRIAL_MUSIC_SECONDS} seconds.`);
    }
    if ((data.size ?? 512) > TRIAL_SIZE) throw refuse("Sign in for images larger than 512px.");
    if (!(await spendTrialMedia(context))) {
      throw Object.assign(
        new Error("The free generator is used up for today. Sign in to keep making media."),
        { status: 429 },
      );
    }
    return postMediaJob(data);
  });

/**
 * Poll one job; a finished job carries its bytes. No session needed: the job id
 * is an unguessable capability, and the bytes are already public at /media/.
 */
export const mediaJob = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(4).max(64) }))
  .handler(({ data }) => fetchMediaJob(data.id));

/** Which models the server has, for the media panel's status line. */
export const mediaHealth = createServerFn({ method: "GET" }).handler(() => fetchMediaHealth());
