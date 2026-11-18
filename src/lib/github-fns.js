import { createServerFn } from "@tanstack/react-start";
import { secrets } from "base44:runtime";
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
 * The caller's own GitHub connection, read on the server so the token never
 * travels to the browser.
 *
 * Base44's edge attaches a service credential to `asServiceRole`; a copy served
 * from this app's own host (the VPS behind Caddy) has none, and asking for it
 * throws "Service token is required to use asServiceRole". So the row is also
 * read through the member's own client, which the entity's rules allow for the
 * member who created it.
 */
const linkFor = async (context) => {
  const base44 = context.getBase44();
  try {
    const rows = await base44.asServiceRole.entities.GitHubLink.filter(
      { user_id: context.user.id },
      "-created_date",
      1,
    );
    return rows[0] || null;
  } catch {
    try {
      const rows = await base44.entities.GitHubLink.filter(
        { user_id: context.user.id },
        "-created_date",
        1,
      );
      return rows[0] || null;
    } catch {
      return null;
    }
  }
};

/** Write the connection with the service credential, or the member's own client. */
const writeLink = async (context, { id, payload }) => {
  const base44 = context.getBase44();
  try {
    const admin = base44.asServiceRole;
    if (id) await admin.entities.GitHubLink.update(id, payload);
    else await admin.entities.GitHubLink.create(payload);
    return true;
  } catch {
    if (id) await base44.entities.GitHubLink.update(id, payload);
    else await base44.entities.GitHubLink.create(payload);
    return true;
  }
};

/** Forget the caller's stored token. */
const dropLink = async (context) => {
  const base44 = context.getBase44();
  try {
    await base44.asServiceRole.entities.GitHubLink.deleteMany({ user_id: context.user.id });
    return true;
  } catch {
    await base44.entities.GitHubLink.deleteMany({ user_id: context.user.id });
    return true;
  }
};

/** Whether the caller has a GitHub connection, and whose account it is. No token. */
export const githubStatus = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const link = await linkFor(context);
    return { connected: Boolean(link?.token), login: link?.login || "" };
  });

/** Whether the deployment has a GitHub OAuth app, and the page to come back to. */
export const githubOAuthStart = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ redirectUri: z.string().url().max(300) }))
  .handler(async ({ data }) => {
    const clientId = secrets.get("GITHUB_CLIENT_ID") || "";
    if (!clientId) {
      return {
        error:
          "GitHub sign-in is not set up on this deployment yet. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the app's settings, or use a personal access token below.",
      };
    }

    const state = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", data.redirectUri);
    url.searchParams.set("scope", "repo read:user");
    url.searchParams.set("state", state);

    return { url: url.toString(), state };
  });

/**
 * The other half of the sign-in: GitHub sends the person back to the app with a
 * one-time code, and this exchanges it for a token that is stored on the server
 * for their account only — the same place a pasted token would go.
 */
export const githubOAuthFinish = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      code: z.string().min(4).max(200),
      redirectUri: z.string().url().max(300),
    }),
  )
  .handler(async ({ data, context }) => {
    const clientId = secrets.get("GITHUB_CLIENT_ID") || "";
    const clientSecret = secrets.get("GITHUB_CLIENT_SECRET") || "";
    if (!clientId || !clientSecret) {
      return { ok: false, error: "GitHub sign-in is not set up on this deployment yet." };
    }

    const exchange = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: data.code,
        redirect_uri: data.redirectUri,
      }),
    });
    const body = await exchange.json().catch(() => null);
    const token = typeof body?.access_token === "string" ? body.access_token : "";
    if (!token) {
      return { ok: false, error: body?.error_description || "GitHub did not return a token." };
    }

    const meRes = await fetch(`${GH}/user`, { headers: headersFor(token) });
    if (!meRes.ok) return { ok: false, error: `GitHub answered ${meRes.status}.` };
    const me = await meRes.json();

    const existing = await linkFor(context);
    try {
      await writeLink(context, {
        id: existing?.id,
        payload: { user_id: context.user.id, login: me.login, token },
      });
    } catch (err) {
      return { ok: false, error: err?.message || "The connection could not be stored." };
    }

    return { ok: true, login: me.login, avatar: me.avatar_url };
  });

/** Whether a deployment has the two values the sign-in needs. */
export const githubOAuthEnabled = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async () => ({
    enabled: Boolean(secrets.get("GITHUB_CLIENT_ID") && secrets.get("GITHUB_CLIENT_SECRET")),
  }));

/** Verify a personal access token, then keep it server-side for this user only. */
export const connectGitHub = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ token: z.string().min(10).max(400) }))
  .handler(async ({ data, context }) => {
    const res = await fetch(`${GH}/user`, { headers: headersFor(data.token) });
    if (!res.ok) return { ok: false, error: `GitHub answered ${res.status}` };
    const gh = await res.json();

    const existing = await linkFor(context);
    const payload = { user_id: context.user.id, login: gh.login, token: data.token };

    try {
      await writeLink(context, { id: existing?.id, payload });
    } catch (err) {
      return {
        ok: false,
        error:
          "This deployment cannot store the connection yet (" +
          (err?.message || "the server has no service credential") +
          "). Publish the app from Base44, or import a public repository by link instead.",
      };
    }

    return { ok: true, login: gh.login, avatar: gh.avatar_url };
  });

/** Forget the caller's stored token. */
export const disconnectGitHub = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    try {
      await dropLink(context);
    } catch {
      /* nothing stored, or no permission to remove it */
    }
    return { ok: true };
  });

const TEXT_FILE =
  /\.(txt|md|markdown|json|jsonc|js|jsx|mjs|cjs|ts|tsx|css|scss|sass|less|html|htm|xml|yml|yaml|csv|svg|py|rb|go|rs|java|c|h|cpp|hpp|cs|php|sh|toml|ini|env|sql|vue|svelte|astro|graphql|prisma|dockerfile)$/i;
const SKIP_DIR =
  /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.venv|venv|__pycache__|vendor|coverage|target|\.cache)(\/|$)/i;
const MAX_FILES = 80;
const MAX_CHARS = 120000;

const langOf = (path) => {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const map = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    rs: "rust",
    go: "go",
  };
  return map[ext] || "text";
};

/** The caller's GitHub repositories, for the import picker. */
export const listGitHubRepos = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const link = await linkFor(context);
    if (!link?.token) return { connected: false, repos: [] };

    const res = await fetch(
      `${GH}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator`,
      { headers: headersFor(link.token) },
    );
    if (!res.ok) {
      return { connected: true, login: link.login, repos: [], error: `GitHub answered ${res.status}.` };
    }

    const rows = await res.json();
    const repos = (Array.isArray(rows) ? rows : []).map((repo) => ({
      full_name: repo.full_name,
      name: repo.name,
      private: Boolean(repo.private),
      branch: repo.default_branch || "main",
      updated_at: repo.updated_at || null,
    }));
    return { connected: true, login: link.login, repos };
  });

/**
 * Copy a repository's source files into a new project of the caller's, using
 * their own stored GitHub connection.
 */
export const importGitHubRepo = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(
    z.object({
      repoFullName: z
        .string()
        .max(140)
        .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "Use owner/repo"),
      branch: z.string().max(120).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const link = await linkFor(context);
    if (!link?.token) return { ok: false, error: "Connect your GitHub account first." };
    const token = link.token;

    const metaRes = await fetch(`${GH}/repos/${data.repoFullName}`, { headers: headersFor(token) });
    if (!metaRes.ok) return { ok: false, error: `GitHub answered ${metaRes.status}.` };
    const meta = await metaRes.json();
    const branch = data.branch?.trim() || meta.default_branch || "main";

    const treeRes = await fetch(
      `${GH}/repos/${data.repoFullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers: headersFor(token) },
    );
    if (!treeRes.ok) {
      return { ok: false, error: `Could not read the ${branch} branch (${treeRes.status}).` };
    }
    const tree = await treeRes.json();

    const paths = (tree.tree || [])
      .filter(
        (entry) =>
          entry.type === "blob" &&
          entry.path &&
          TEXT_FILE.test(entry.path) &&
          !SKIP_DIR.test(entry.path) &&
          (entry.size ?? 0) <= MAX_CHARS,
      )
      .map((entry) => entry.path)
      .sort()
      .slice(0, MAX_FILES);

    if (!paths.length) return { ok: false, error: "That repository has no readable source files." };

    const files = await readFiles({ fullName: data.repoFullName, branch, paths, token });
    if (!files.length) return { ok: false, error: "Those files could not be read." };

    return createImportedProject(context, { fullName: data.repoFullName, meta, files });
  });

/**
 * `https://github.com/owner/repo(.git)`, a link into a branch
 * (`…/tree/main`), `github.com/owner/repo` or `owner/repo`.
 */
const parseRepoRef = (value) => {
  const cleaned = String(value || "")
    .trim()
    .replace(/^git\+/, "")
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null;
  const branch =
    parts[2] === "tree" && parts.length > 3 ? decodeURIComponent(parts.slice(3).join("/")) : "";
  return { fullName: `${owner}/${repo}`, branch };
};

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

/**
 * The bytes of each path. Public repositories are read from
 * raw.githubusercontent.com, which needs no token and has no API quota; a
 * connected account's token falls back to the API, which also reads private
 * repositories.
 */
async function readFiles({ fullName, branch, paths, token }) {
  const raw = token ? { ...headersFor(token), Accept: "application/vnd.github.raw" } : null;
  const files = [];

  for (let index = 0; index < paths.length; index += 10) {
    const batch = paths.slice(index, index + 10);
    const got = await Promise.all(
      batch.map(async (path) => {
        try {
          const url = token
            ? `${GH}/repos/${fullName}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
            : `https://raw.githubusercontent.com/${fullName}/${encodePath(branch)}/${encodePath(path)}`;
          const res = await fetch(url, {
            headers: raw || { "user-agent": "xecutr" },
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) return null;
          const text = await res.text();
          return { path, content: text.slice(0, MAX_CHARS) };
        } catch {
          return null;
        }
      }),
    );
    files.push(...got.filter(Boolean));
  }

  return files;
}

async function createImportedProject(context, { fullName, meta, files }) {
  const base44 = context.getBase44();
  const project = await base44.entities.Project.create({
    name: meta.name || fullName.split("/")[1] || fullName,
    summary: (meta.description || `Imported from ${fullName}`).slice(0, 300),
    file_count: files.length,
    message_count: 0,
    last_activity: new Date().toISOString(),
    repo_full_name: fullName,
    repo_url: meta.html_url || `https://github.com/${fullName}`,
  });

  await base44.entities.ProjectFile.bulkCreate(
    files.map((file) => ({
      project_id: project.id,
      path: file.path,
      content: file.content,
      language: langOf(file.path),
      size: file.content.length,
    })),
  );

  return { ok: true, projectId: project.id, name: project.name, files: files.length };
}

/**
 * Import any GitHub repository by link — someone else's public repository needs
 * no connection at all, which is what "import this repo" usually means.
 */
export const importRepoByUrl = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ repo: z.string().min(3).max(300), branch: z.string().max(120).optional() }))
  .handler(async ({ data, context }) => {
    const ref = parseRepoRef(data.repo);
    if (!ref) {
      return { ok: false, error: "That is not a GitHub repository link. Use https://github.com/owner/repo." };
    }
    const { fullName } = ref;

    const link = await linkFor(context);
    const token = link?.token || "";
    const headers = token
      ? headersFor(token)
      : { Accept: "application/vnd.github+json", "user-agent": "xecutr", "X-GitHub-Api-Version": "2022-11-28" };

    const metaRes = await fetch(`${GH}/repos/${fullName}`, { headers });
    if (!metaRes.ok) {
      return {
        ok: false,
        error:
          metaRes.status === 404
            ? "That repository is private or does not exist. Connect GitHub to import a private one."
            : metaRes.status === 403
              ? "GitHub is rate-limiting this server. Connect GitHub to import right now."
              : `GitHub answered ${metaRes.status}.`,
      };
    }
    const meta = await metaRes.json();
    const branch = data.branch || ref.branch || meta.default_branch || "main";

    const treeRes = await fetch(
      `${GH}/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers },
    );
    if (!treeRes.ok) {
      return { ok: false, error: `Could not read the ${branch} branch (${treeRes.status}).` };
    }
    const tree = await treeRes.json();

    const paths = (tree.tree || [])
      .filter(
        (entry) =>
          entry.type === "blob" &&
          entry.path &&
          TEXT_FILE.test(entry.path) &&
          !SKIP_DIR.test(entry.path) &&
          (entry.size ?? 0) <= MAX_CHARS,
      )
      .map((entry) => entry.path)
      .sort()
      .slice(0, MAX_FILES);

    if (!paths.length) return { ok: false, error: "That repository has no readable source files." };

    const files = await readFiles({ fullName, branch, paths, token });
    if (!files.length) return { ok: false, error: "Those files could not be read." };

    return createImportedProject(context, { fullName, meta, files });
  });

/**
 * Bring a project's files back in line with its GitHub repository: new and
 * changed files are written, files the repository no longer has are removed.
 * The repository is the source of truth once a project is linked to one.
 */
export const syncProjectFromRepo = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ projectId: z.string().min(1).max(64) }))
  .handler(async ({ data, context }) => {
    const base44 = context.getBase44();
    const project = await base44.entities.Project.get(data.projectId).catch(() => null);
    if (!project) return { ok: false, error: "That project is gone." };

    const fullName = String(project.repo_full_name || "").trim();
    if (!fullName) return { ok: false, error: "This project has no repository linked yet." };

    const link = await linkFor(context);
    const token = link?.token || "";
    const headers = token
      ? headersFor(token)
      : { Accept: "application/vnd.github+json", "user-agent": "xecutr", "X-GitHub-Api-Version": "2022-11-28" };

    const metaRes = await fetch(`${GH}/repos/${fullName}`, { headers });
    if (!metaRes.ok) {
      return {
        ok: false,
        error:
          metaRes.status === 404
            ? "That repository is private or does not exist. Connect GitHub to sync a private one."
            : `GitHub answered ${metaRes.status}.`,
      };
    }
    const meta = await metaRes.json();
    const branch = meta.default_branch || "main";

    const treeRes = await fetch(
      `${GH}/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers },
    );
    if (!treeRes.ok) return { ok: false, error: `Could not read the ${branch} branch (${treeRes.status}).` };
    const tree = await treeRes.json();

    const paths = (tree.tree || [])
      .filter(
        (entry) =>
          entry.type === "blob" &&
          entry.path &&
          TEXT_FILE.test(entry.path) &&
          !SKIP_DIR.test(entry.path) &&
          (entry.size ?? 0) <= MAX_CHARS,
      )
      .map((entry) => entry.path)
      .sort()
      .slice(0, MAX_FILES);

    if (!paths.length) return { ok: false, error: "That repository has no readable source files." };

    const files = await readFiles({ fullName, branch, paths, token });
    if (!files.length) return { ok: false, error: "Those files could not be read." };

    const existing = await base44.entities.ProjectFile.filter(
      { project_id: data.projectId },
      "path",
      500,
    );
    const byPath = new Map((existing || []).map((row) => [row.path, row]));
    let added = 0;
    let updated = 0;
    let removed = 0;

    for (const file of files) {
      const row = byPath.get(file.path);
      if (row) {
        if ((row.content || "") !== file.content) {
          await base44.entities.ProjectFile.update(row.id, {
            content: file.content,
            size: file.content.length,
          });
          updated += 1;
        }
        byPath.delete(file.path);
        continue;
      }
      await base44.entities.ProjectFile.create({
        project_id: data.projectId,
        path: file.path,
        content: file.content,
        language: langOf(file.path),
        size: file.content.length,
      });
      added += 1;
    }

    for (const row of byPath.values()) {
      await base44.entities.ProjectFile.delete(row.id).catch(() => {});
      removed += 1;
    }

    await base44.entities.Project.update(data.projectId, {
      file_count: files.length,
      last_activity: new Date().toISOString(),
    }).catch(() => {});

    return { ok: true, added, updated, removed, files: files.length, repo: fullName };
  });

/** Does a repository with this name already exist in the caller's account? */
export const githubRepoExists = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .validator(z.object({ name: z.string().min(1).max(100) }))
  .handler(async ({ data, context }) => {
    const link = await linkFor(context);
    if (!link?.token) return { connected: false, exists: false, login: "" };

    const meRes = await fetch(`${GH}/user`, { headers: headersFor(link.token) });
    if (!meRes.ok) return { connected: true, exists: false, login: link.login || "" };
    const me = await meRes.json();

    const res = await fetch(`${GH}/repos/${me.login}/${data.name}`, {
      headers: headersFor(link.token),
    });
    return { connected: true, login: me.login, exists: res.ok };
  });

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
    // Already there: that is the update case, not a failure.
    let created = repoRes.ok;
    if (repoRes.status === 422) {
      created = false;
      repoRes = await fetch(`${GH}/repos/${me.login}/${data.repoName}`, {
        headers: headersFor(token),
      });
    }
    if (!repoRes.ok) {
      return { ok: false, error: `Could not create the repo (${repoRes.status}).` };
    }

    const pushed = [];
    let branch = "main";
    try {
      const info = await repoRes.json();
      branch = info?.default_branch || "main";
    } catch {
      /* keep main */
    }

    // For an existing repository, one tree call gives every path's blob sha, so
    // each file needs a single PUT instead of a GET and a PUT.
    const shaByPath = new Map();
    if (!created) {
      try {
        const treeRes = await fetch(
          `${GH}/repos/${me.login}/${data.repoName}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
          { headers: headersFor(token) },
        );
        if (treeRes.ok) {
          const tree = await treeRes.json();
          for (const entry of tree.tree || []) {
            if (entry.type === "blob" && entry.path) shaByPath.set(entry.path, entry.sha);
          }
        }
      } catch {
        /* fall back to a lookup per file */
      }
    }

    const queue = [...files];
    const workers = 5;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (;;) {
          const file = queue.shift();
          if (!file) return;
          try {
            const path = file.path.replace(/^\/+/, "");
            const url = `${GH}/repos/${me.login}/${data.repoName}/contents/${path}`;

            let sha = shaByPath.get(path);
            if (sha === undefined && !created) {
              const existing = await fetch(url, { headers: headersFor(token) });
              if (existing.ok) {
                const body = await existing.json().catch(() => null);
                sha = body?.sha;
              }
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
          } catch {
            /* one file failing does not stop the rest */
          }
        }
      }),
    );

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
      created,
      pushed: pushed.length,
      total: files.length,
    };
  });