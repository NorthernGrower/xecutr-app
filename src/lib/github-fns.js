import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "@/lib/auth-middleware";

const GH = "https://api.github.com";
const headersFor = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "user-agent": "xecutr",
});

const b64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

/** Verify a personal access token and return the account that owns it. */
export const githubAccount = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ token: z.string().min(10).max(400) }))
  .handler(async ({ data }) => {
    const res = await fetch(`${GH}/user`, { headers: headersFor(data.token) });
    if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` };
    const user = await res.json();
    return { ok: true, login: user.login, avatar: user.avatar_url };
  });

/**
 * Push the project's existing files into a repository owned by the caller's own
 * GitHub account. Files stay the same ProjectFile records — nothing is copied.
 */
export const pushProjectToGitHub = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      projectId: z.string().max(64),
      token: z.string().min(10).max(400),
      repoName: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
      description: z.string().max(300).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const files = await base44.entities.ProjectFile.filter(
      { project_id: data.projectId },
      "path",
      100,
    );
    if (!files.length) return { ok: false, error: "This project has no files to save yet." };

    const meRes = await fetch(`${GH}/user`, { headers: headersFor(data.token) });
    if (!meRes.ok) return { ok: false, error: `GitHub auth failed (${meRes.status}).` };
    const me = await meRes.json();

    let repoRes = await fetch(`${GH}/user/repos`, {
      method: "POST",
      headers: headersFor(data.token),
      body: JSON.stringify({
        name: data.repoName,
        description: data.description || "Built with xecutr",
        private: true,
        auto_init: false,
      }),
    });
    if (repoRes.status === 422) {
      repoRes = await fetch(`${GH}/repos/${me.login}/${data.repoName}`, {
        headers: headersFor(data.token),
      });
    }
    if (!repoRes.ok) {
      return { ok: false, error: `Could not create the repo (${repoRes.status}).` };
    }

    const pushed = [];
    for (const file of files) {
      const path = file.path.replace(/^\/+/, "");
      const url = `${GH}/repos/${me.login}/${data.repoName}/contents/${path}`;

      let sha;
      const existing = await fetch(url, { headers: headersFor(data.token) });
      if (existing.ok) {
        const body = await existing.json();
        sha = body?.sha;
      }

      const put = await fetch(url, {
        method: "PUT",
        headers: headersFor(data.token),
        body: JSON.stringify({
          message: `xecutr: save ${path}`,
          content: b64(file.content || ""),
          ...(sha ? { sha } : {}),
        }),
      });
      if (put.ok) pushed.push(path);
    }

    return {
      ok: true,
      repo: `${me.login}/${data.repoName}`,
      url: `https://github.com/${me.login}/${data.repoName}`,
      pushed: pushed.length,
      total: files.length,
    };
  });