const GH = "https://api.github.com";
const MAX_FILES = 50;
const MAX_TOTAL = 320000;
const CODE = /\.(js|mjs|cjs|jsx|ts|tsx|json)$/i;
const SKIP =
  /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|coverage|vendor|__snapshots__|fixtures)(\/|$)/i;

const FRAMEWORK_DEPS = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["nuxt", "Nuxt"],
  ["svelte", "Svelte"],
  ["@angular/core", "Angular"],
  ["electron", "Electron"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["koa", "Koa"],
  ["@nestjs/core", "NestJS"],
  ["react-native", "React Native"],
  ["expo", "Expo"],
  ["vite", "Vite"],
  ["webpack", "Webpack"],
  ["tailwindcss", "Tailwind CSS"],
  ["@prisma/client", "Prisma"],
];

const headersFor = (token) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "user-agent": "xecutr-inspect",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const lineAt = (text, index) => {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (text.charCodeAt(cursor) === 10) line += 1;
  return line;
};

/** Every match of one pattern across the loaded files, with file and line evidence. */
const scan = (files, pattern, limit, pick = (hit) => hit[1]) => {
  const out = [];
  for (const file of files) {
    const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let hit;
    while ((hit = regex.exec(file.content))) {
      const value = pick(hit);
      if (value) out.push({ file: file.path, line: lineAt(file.content, hit.index), value });
      if (out.length >= limit) return out;
    }
  }
  return out;
};

const packageName = (specifier) => {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
};

const dirOf = (path) => path.split("/").slice(0, -1).join("/");

const normalise = (path) =>
  path
    .split("/")
    .reduce((parts, part) => {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part);
      return parts;
    }, [])
    .join("/");

const resolveImport = (from, specifier, known) => {
  const base = specifier.startsWith("/") ? specifier.slice(1) : `${dirOf(from)}/${specifier}`;
  const clean = normalise(base);
  const extensions = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json"];
  const indexes = ["/index.js", "/index.jsx", "/index.ts", "/index.tsx"];
  return [...extensions.map((ext) => `${clean}${ext}`), ...indexes.map((suffix) => `${clean}${suffix}`)].find((candidate) =>
    known.has(candidate),
  );
};

const importsOf = (content) => {
  const found = [];
  const regex = /(?:import\s[^"'`]*?from\s*|require\(\s*|import\(\s*)["']([^"']+)["']/g;
  let hit;
  while ((hit = regex.exec(content))) found.push({ specifier: hit[1], line: lineAt(content, hit.index) });
  return found;
};

function readJson(files, path) {
  const file = files.find((entry) => entry.path === path);
  if (!file) return null;
  try {
    return JSON.parse(file.content);
  } catch {
    return null;
  }
}

export async function analyzeRepository(repo, branch, token) {
  const metaRes = await fetch(`${GH}/repos/${repo}`, { headers: headersFor(token) });
  if (!metaRes.ok) {
    const hint =
      metaRes.status === 404
        ? "That repository is missing, private, or not reachable with the signed-in user's GitHub connection."
        : metaRes.status === 403
          ? "GitHub rate-limited this request; connecting a GitHub account raises the limit."
          : `GitHub answered ${metaRes.status}.`;
    return { mode: "repository", target: repo, error: hint };
  }
  const meta = await metaRes.json();
  const ref = branch || meta.default_branch || "main";

  const treeRes = await fetch(`${GH}/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, {
    headers: headersFor(token),
  });
  if (!treeRes.ok) {
    return { mode: "repository", target: repo, error: `Could not read the ${ref} branch (${treeRes.status}).` };
  }
  const tree = await treeRes.json();

  const candidates = (tree.tree || [])
    .filter((entry) => entry.type === "blob" && CODE.test(entry.path || "") && !SKIP.test(entry.path || ""))
    .sort((a, b) => {
      if (a.path === "package.json") return -1;
      if (b.path === "package.json") return 1;
      return a.path.length - b.path.length;
    });

  const selected = [];
  let budget = MAX_TOTAL;
  for (const entry of candidates) {
    const size = entry.size ?? 0;
    if (size > 60000 || size > budget || selected.length >= MAX_FILES) continue;
    selected.push(entry.path);
    budget -= size;
  }
  if (!selected.length) return { mode: "repository", target: repo, error: "No readable JavaScript or TypeScript source in that repository." };

  const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
  const files = [];
  for (let index = 0; index < selected.length; index += 8) {
    const batch = selected.slice(index, index + 8);
    const loaded = await Promise.all(
      batch.map(async (path) => {
        try {
          const res = await fetch(
            `${GH}/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
            { headers: { ...headersFor(token), Accept: "application/vnd.github.raw" }, signal: AbortSignal.timeout(15000) },
          );
          if (!res.ok) return null;
          return { path, content: await res.text() };
        } catch {
          return null;
        }
      }),
    );
    files.push(...loaded.filter(Boolean));
  }
  if (!files.length) return { mode: "repository", target: repo, error: "Those files could not be read." };

  const pkg = readJson(files, "package.json") || {};
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const stack = FRAMEWORK_DEPS.filter(([dep]) => dependencies[dep]).map(([dep, label]) => `${label} (${dep}@${dependencies[dep]})`);

  // Module graph: how the code is wired, and where a relative import points at nothing.
  const known = new Set(files.map((file) => file.path));
  const external = new Map();
  const unresolved = [];
  for (const file of files) {
    for (const { specifier, line } of importsOf(file.content)) {
      if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/")) {
        const target = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : specifier;
        if (!resolveImport(file.path, target, known) && unresolved.length < 10) {
          unresolved.push({ file: file.path, line, value: specifier });
        }
        continue;
      }
      const name = packageName(specifier);
      external.set(name, (external.get(name) || 0) + 1);
    }
  }
  const topImports = [...external.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => `${name} ×${count}`);

  // Electron boundaries: the IPC surface and the renderer's privileges.
  const ipcMain = scan(files, /ipcMain\.(?:handle|handleOnce|on|once)\(\s*["'`]([^"'`]+)["'`]/, 20);
  const ipcRenderer = scan(files, /ipcRenderer\.(?:invoke|send|sendSync|postMessage|on)\(\s*["'`]([^"'`]+)["'`]/, 20);
  const exposed = scan(files, /contextBridge\.exposeInMainWorld\(\s*["'`]([^"'`]+)["'`]/, 20);
  const webPreferences = scan(
    files,
    /\b(nodeIntegration|contextIsolation|sandbox|webSecurity|allowRunningInsecureContent|preload)\s*:\s*(true|false|["'][^"']+["'])/,
    20,
    (hit) => `${hit[1]}: ${hit[2]}`,
  );

  const findings = [];
  const nodeIntegration = webPreferences.find((entry) => entry.value === "nodeIntegration: true");
  if (nodeIntegration) {
    findings.push({
      severity: "high",
      finding: "nodeIntegration is enabled",
      evidence: `${nodeIntegration.file}:${nodeIntegration.line}`,
      why: "Renderer code gets Node access, so any injected script can reach the filesystem and spawn processes.",
    });
  }
  const isolationOff = webPreferences.find((entry) => entry.value === "contextIsolation: false");
  if (isolationOff) {
    findings.push({
      severity: "high",
      finding: "contextIsolation is disabled",
      evidence: `${isolationOff.file}:${isolationOff.line}`,
      why: "Preload globals leak into page scripts, so page content can call privileged APIs directly.",
    });
  }
  const secrets = scan(
    files,
    /(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/,
    8,
    (hit) => `${hit[1].slice(0, 4)}…redacted`,
  );
  if (secrets.length) {
    findings.push({
      severity: "high",
      finding: `Possible committed secret in ${secrets.length} place(s)`,
      evidence: secrets.map((entry) => `${entry.file}:${entry.line}`).join(", "),
      why: "Credentials in source are readable by anyone with repo access and live on in git history.",
    });
  }
  const risky = scan(files, /\b(eval\(|new Function\(|child_process|dangerouslySetInnerHTML|\.innerHTML\s*=)/, 12);
  if (risky.length) {
    findings.push({
      severity: "medium",
      finding: "Dynamic code or raw HTML sinks",
      evidence: risky.map((entry) => `${entry.file}:${entry.line} ${entry.value}`).slice(0, 8),
      why: "These execute or inject strings; anything user-controlled reaching them is an injection path.",
    });
  }

  const network = scan(files, /(?:fetch|\$\.ajax|axios\.(?:get|post|put|delete))\(\s*["'`]([^"'`]+)["'`]/, 15);
  const envVars = [...new Set(scan(files, /(?:process\.env|import\.meta\.env)\.([A-Z0-9_]{2,})/, 60).map((entry) => entry.value))].slice(0, 30);
  const routes = scan(files, /\b(?:app|router)\.(?:get|post|put|patch|delete|use)\(\s*["'`](\/[^"'`]*)["'`]/, 15);

  const entries = [...new Set([pkg.main, ...tree.tree || []
    .map((entry) => entry.path)
    .filter((path) => path && /(^|\/)(index|main|app|server|electron)\.(js|mjs|cjs|ts|jsx|tsx)$/.test(path))])]
    .filter(Boolean)
    .slice(0, 8);

  return {
    mode: "repository",
    target: meta.full_name || repo,
    url: meta.html_url,
    branch: ref,
    private: Boolean(meta.private),
    description: meta.description || "",
    stack: {
      name: pkg.name || "",
      frameworks: stack,
      scripts: Object.keys(pkg.scripts || {}).slice(0, 12),
      dependencyCount: Object.keys(dependencies).length,
      topImports,
    },
    analysed: { files: files.length, paths: files.map((file) => file.path).slice(0, MAX_FILES) },
    entryPoints: entries,
    moduleGraph: { unresolvedInternalImports: unresolved },
    electron: {
      ipcMainChannels: ipcMain,
      ipcRendererChannels: ipcRenderer,
      exposedApis: exposed,
      webPreferences,
    },
    network,
    envVars,
    routes,
    findings,
    limitations: [
      "Source is read statically; nothing is installed, built or executed, so runtime behaviour is inferred, not observed.",
      "Only JavaScript, TypeScript and JSON text files were read; native binaries, bundles and dependencies are out of scope.",
      `Analysis covered ${files.length} file(s) within a ${MAX_FILES}-file cap, so large repositories are sampled.`,
    ],
  };
}