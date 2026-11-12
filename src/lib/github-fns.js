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

/**
 * The caller's own GitHub connection, read on the server with the service role
 * so the token never travels to the browser. Scoped by user_id, which the client
 * cannot set.
 */
const linkFor = async (context) => {
  const rows = await context
    .getBase44()
    .asServiceRole.entities.GitHubLink.filter({ user_id: context.user.id }, "-created_date", 1);
  return rows[0] || null;
};

/** Whether the caller has a GitHub connection, and whose account it is. No token. */
export const githubStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const link = await linkFor(context);
    return { connected: Boolean(link?.token), login: link?.login || "" };
  });

/** Verify a personal access token, then keep it server-side for this user only. */
export const connectGitHub = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ token: z.string().min(10).max(400) }))
  .handler(async ({ data, context }) => {
    const res = await fetch(`${GH}/user`, { headers: headersFor(data.token) });
    if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` };
    const gh = await res.json();

    const admin = context.getBase44().asServiceRole;
    const existing = await linkFor(context);
    const payload = { user_id: context.user.id, login: gh.login, token: data.token };

    if (existing) await admin.entities.GitHubLink.update(existing.id, payload);
    else await admin.entities.GitHubLink.create(payload);

    return { ok: true, login: gh.login, avatar: gh.avatar_url };
  });

/** Forget the caller's stored token. */
export const disconnectGitHub = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    await context
      .getBase44()
      .asServiceRole.entities.GitHubLink.deleteMany({ user_id: context.user.id });
    return { ok: true };
  });

/**
 * Push the project's existing files into a repository owned by the caller's own
 * GitHub account. The token is read from the caller's stored connection.
 */
export const pushProjectToGitHub = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      projectId: z.string().max(64),
      repoName: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
      description: z.string().max(300).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const link = await linkFor(context);
    if (!link?.token) return { ok: false, error: "Connect your GitHub account first." };
    const token = link.token;

    const base44 = context.getBase44();
    const files = await base44.entities.ProjectFile.filter(
      { project_id: data.projectId },
      "path",
      100,
    );
    if (!files.length) return { ok: false, error: "This project has no files to save yet." };

    const meRes = await fetch(`${GH}/user`, { headers: headersFor(token) });
    if (!meRes.ok) return { ok: false, error: `GitHub auth failed (${meRes.status}).` };
    const me = await meRes.json();

    let repoRes = await fetch(`${GH}/user/repos`, {
      method: "POST",
      headers: headersFor(token),
      body: JSON.stringify({
        name: data.repoName,
        description: data.description || "Built with xecutr",
        private: true,
        auto_init: false,
      }),
    });
    if (repoRes.status === 422) {
      repoRes = await fetch(`${GH}/repos/${me.login}/${data.repoName}`, {
        headers: headersFor(token),
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
      const existing = await fetch(url, { headers: headersFor(token) });
      if (existing.ok) {
        const body = await existing.json();
        sha = body?.sha;
      }

      const put = await fetch(url, {
        method: "PUT",
        headers: headersFor(token),
        body: JSON.stringify({
          message: `xecutr: save ${path}`,
          content: b64(file.content || ""),
          ...(sha ? { sha } : {}),
        }),
      });
      if (put.ok) pushed.push(path);
    }

    const repo = `${me.login}/${data.repoName}`;
    const url = `https://github.com/${repo}`;
    await base44.entities.Project.update(data.projectId, {
      repo_full_name: repo,
      repo_url: url,
    }).catch(() => {});

    return {
      ok: true,
      repo,
      url,
      pushed: pushed.length,
      total: files.length,
    };
  });