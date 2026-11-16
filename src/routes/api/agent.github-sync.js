import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUserRoute } from "@/lib/auth-middleware";

const GH = "https://api.github.com";
const headersFor = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "user-agent": "xecutr",
});

const TEXT_FILE =
  /\.(txt|md|markdown|json|jsonc|js|jsx|mjs|cjs|ts|tsx|css|scss|sass|less|html|htm|xml|yml|yaml|csv|svg|py|rb|go|rs|java|c|h|cpp|hpp|cs|php|sh|toml|ini|env|sql|vue|svelte|astro|graphql|prisma|dockerfile)$/i;
const SKIP_DIR =
  /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.venv|venv|__pycache__|vendor|coverage|target|\.cache)(\/|$)/i;

const FILES_PER_PROJECT = 30;
const MAX_FILE_CHARS = 20000;
const MAX_PROMPT_CHARS = 60000;

const Body = z.object({ link_id: z.string().min(1).max(64) });

/** The readable files of one repository, so the agent works from real contents. */
const snapshot = async (token, repo, ref) => {
  const metaRes = await fetch(`${GH}/repos/${repo}`, { headers: headersFor(token) });
  if (!metaRes.ok) return { error: `GitHub answered ${metaRes.status} for ${repo}.` };
  const meta = await metaRes.json();
  const branch = ref || meta.default_branch || "main";

  const treeRes = await fetch(
    `${GH}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: headersFor(token) },
  );
  if (!treeRes.ok) return { error: `Could not read ${repo}@${branch} (${treeRes.status}).` };
  const tree = await treeRes.json();

  const paths = (tree.tree || [])
    .filter(
      (entry) =>
        entry.type === "blob" &&
        entry.path &&
        TEXT_FILE.test(entry.path) &&
        !SKIP_DIR.test(entry.path) &&
        (entry.size ?? 0) <= MAX_FILE_CHARS,
    )
    .map((entry) => entry.path)
    .sort();
  const kept = paths.slice(0, FILES_PER_PROJECT);

  const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
  const files = [];
  for (let index = 0; index < kept.length; index += 10) {
    const batch = await Promise.all(
      kept.slice(index, index + 10).map(async (path) => {
        try {
          const res = await fetch(
            `${GH}/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
            {
              headers: { ...headersFor(token), Accept: "application/vnd.github.raw" },
              signal: AbortSignal.timeout(15000),
            },
          );
          if (!res.ok) return null;
          const text = await res.text();
          return { path, content: text.slice(0, MAX_FILE_CHARS) };
        } catch {
          return null;
        }
      }),
    );
    files.push(...batch.filter(Boolean));
  }

  return { branch, files, truncated: paths.length > kept.length };
};

/** One project's section of the agent's brief, bounded by the remaining budget. */
const sectionFor = (project, snap, budget) => {
  const blocks = [];
  let used = 0;
  for (const file of snap.files) {
    const block = `\`\`\`file path="${file.path}"\n${file.content}\n\`\`\``;
    if (used + block.length > budget) return null;
    used += block.length;
    blocks.push(block);
  }
  return {
    text: [
      `## Project: ${project.name} (id: ${project.id})`,
      `repository: ${project.repo_full_name} @ ${snap.branch}`,
      `files in this snapshot: ${blocks.length}${snap.truncated ? " (the repository has more; this is a slice)" : ""}`,
      "",
      blocks.join("\n\n"),
    ].join("\n"),
    used,
    files: blocks.length,
  };
};

const brief = (login, sections) =>
  [
    `Automatic GitHub sync for the GitHub account ${login}. Nobody is watching this run, so do not ask questions.`,
    "",
    "For every project below, make the project's ProjectFile records match its repository snapshot:",
    "1. Update an existing ProjectFile when its content differs (write the complete new content).",
    "2. Create a ProjectFile for every path in the snapshot the project does not have yet.",
    "3. Leave files that the snapshot does not mention in place — the snapshot can be a slice of a larger repository.",
    "4. When the project is consistent, update its Project record: file_count = the number of its files, last_activity = now.",
    "5. Create one AgentTask per project (kind \"edit\", status \"working\") and set it to \"done\" once that project is saved.",
    "Work only on the project ids listed here. Do not create projects and do not touch any other project.",
    "Finish with one short line per project: how many files were created, updated and left unchanged.",
    "",
    sections.join("\n\n---\n\n"),
  ].join("\n");

/**
 * The automation's first step: read every repository linked to one GitHub
 * connection, then hand the contents to the build agent so it updates the
 * matching ProjectFile records. Returns at once; the workflow polls the
 * conversation with /api/agent/github-sync-status.
 */
export const Route = createFileRoute("/api/agent/github-sync")({
  server: {
    middleware: [requireUserRoute],
    handlers: {
      POST: async ({ request, context }) => {
        if (context.user?.role !== "admin") {
          return Response.json({ error: "Only an admin can run the sync." }, { status: 403 });
        }

        let body;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Send a JSON body." }, { status: 400 });
        }
        const parsed = Body.safeParse(body);
        if (!parsed.success) return Response.json({ error: "A link_id is required." }, { status: 400 });

        const admin = context.getBase44().asServiceRole;
        const link = await admin.entities.GitHubLink.get(parsed.data.link_id).catch(() => null);
        if (!link?.token) return Response.json({ ok: false, error: "That GitHub connection is gone." });

        const projects = await admin.entities.Project.filter(
          { created_by_id: link.user_id },
          "-last_activity",
          25,
        );
        const linked = (projects || []).filter((project) => project.repo_full_name);
        if (!linked.length) {
          return Response.json({
            ok: false,
            error: `No project of ${link.login} is linked to a repository yet.`,
          });
        }

        let budget = MAX_PROMPT_CHARS;
        const sections = [];
        let total = 0;
        for (const project of linked) {
          if (budget <= 2000) break;
          const snap = await snapshot(link.token, project.repo_full_name);
          if (snap.error || !snap.files.length) continue;
          const section = sectionFor(project, snap, budget);
          if (!section) continue;
          budget -= section.used;
          total += section.files;
          sections.push(section.text);
        }

        if (!sections.length) {
          return Response.json({
            ok: false,
            error: `Nothing readable came back from the repositories of ${link.login}.`,
          });
        }

        const conversation = await admin.agents.createConversation({
          agent_name: "xecutr_agent",
          metadata: {
            name: `GitHub sync · ${link.login}`,
            description: "Automatic project file sync after a GitHub connection",
          },
        });
        await admin.agents.addMessage(conversation, {
          role: "user",
          content: brief(link.login, sections),
        });

        return Response.json({
          ok: true,
          conversation_id: conversation.id,
          projects: sections.length,
          files: total,
        });
      },
    },
  },
});