import { createFileRoute } from "@tanstack/react-router";

const TYPES = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  webmanifest: "application/manifest+json",
};

const clean = (path = "") => path.replace(/^\/+/, "").replace(/^\.\//, "");

const NO_ENTRY = `<!doctype html><html><head><meta charset="utf-8"><title>nothing to run yet</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#b0c4de;font:13px/1.7 ui-sans-serif,system-ui,sans-serif;text-align:center;padding:24px}code{color:#e0f7ff}</style>
</head><body><div><p style="letter-spacing:.24em;text-transform:uppercase;font-size:10px">no entry file</p>
<p style="margin-top:12px">Ask the agent for an <code>index.html</code> and it renders right here.</p></div></body></html>`;

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });

async function serve({ params, context }) {
  const admin = context.getBase44().asServiceRole;

  const sessions = await admin.entities.PreviewSession.filter({ token: params.token }, "-created_date", 1);
  const session = sessions?.[0];
  if (!session) return new Response("preview not found", { status: 404 });
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return new Response("this preview address has expired", { status: 410 });
  }

  const wanted = clean(params._splat);
  if (wanted.includes("..")) return new Response("bad path", { status: 400 });

  const files = await admin.entities.ProjectFile.filter({ project_id: session.project_id }, "path", 200);
  const byPath = new Map(files.map((f) => [clean(f.path), f]));

  let file = wanted ? byPath.get(wanted) : null;
  if (!file && (!wanted || /^index\.html?$/i.test(wanted))) {
    const entries = [...byPath.values()]
      .filter((f) => /(^|\/)index\.html?$/i.test(clean(f.path)))
      .sort((a, b) => clean(a.path).length - clean(b.path).length);
    file = entries[0] || [...byPath.values()].find((f) => /\.html?$/i.test(f.path));
  }

  if (!file) return wanted ? new Response("not found", { status: 404 }) : html(NO_ENTRY);

  const ext = (clean(file.path).split(".").pop() || "").toLowerCase();
  return new Response(file.content || "", {
    headers: {
      "content-type": TYPES[ext] || "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/preview/$token/$")({
  server: { handlers: { GET: serve } },
});