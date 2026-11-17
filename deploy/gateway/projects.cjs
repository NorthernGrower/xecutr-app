'use strict';

/**
 * Projects on this server's own disk.
 *
 * Base44 keeps a project's files in its database, which is what the app reads
 * and what makes it work from any device. This module keeps a copy on the VPS as
 * well: every turn the model finishes writes the files it produced here, so the
 * work exists as real files on the machine that produced it, and a published
 * project can be served from a subdomain with nothing in the middle.
 *
 * One directory per project (`/projects/<slug>`), with a `project.json` that
 * names it, so serving only has to find the directory and read its files.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.PROJECTS_DIR || '/projects';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const contentType = (file) => TYPES[path.extname(file).toLowerCase()] || 'text/plain; charset=utf-8';

/** `Hyper Tube!` -> `hyper-tube`, which is a legal subdomain label. */
function slugify(name, fallback = 'project') {
  const slug = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/** Never let a model's `../` reach outside the project's directory. */
function safeRelative(filePath) {
  const clean = String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const parts = clean.split('/').filter((part) => part && part !== '.' && part !== '..');
  return parts.join('/');
}

const decodeDataUrl = (value) => {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(value || '');
  if (!match) return null;
  return { type: match[1], bytes: Buffer.from(match[2], 'base64') };
};

/** The directory this project already owns, by id, or the one its slug names. */
const dirFor = (projectId, projectName) => {
  const slug = slugify(projectName || projectId, 'project');
  const preferred = path.join(ROOT, slug);
  const manifest = path.join(preferred, 'project.json');
  try {
    const existing = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (existing?.id === projectId) return { dir: preferred, slug };
  } catch {
    /* no manifest yet, or the directory belongs to another project */
  }

  if (!fs.existsSync(preferred)) return { dir: preferred, slug };

  // The slug is taken by a different project: keep this one's id in the label.
  const unique = `${slug}-${String(projectId).slice(0, 6)}`;
  return { dir: path.join(ROOT, unique), slug: unique };
};

/**
 * Every project has two folders on this server:
 *
 *   site/  what the project is — published, served at /<slug>
 *   work/  a private workspace for the model: drafts, notes, images it is
 *          working on, anything not meant to be the site yet. Never served.
 *
 * A directory written before this split kept its files at the root; they are
 * moved into site/ the first time it is touched.
 */
const ensureLayout = (dir) => {
  const site = path.join(dir, 'site');
  const work = path.join(dir, 'work');
  fs.mkdirSync(site, { recursive: true });
  fs.mkdirSync(work, { recursive: true });

  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { site, work };
  }

  for (const entry of entries) {
    if (entry.name === 'site' || entry.name === 'work' || entry.name === 'project.json') continue;
    try {
      fs.renameSync(path.join(dir, entry.name), path.join(site, entry.name));
    } catch {
      /* a file we cannot move stays where it is and simply is not served */
    }
  }
  return { site, work };
};

const WORK_PREFIX = /^(work|workspace)\//i;

/**
 * Write a project's files to disk. Called after every finished turn (with the
 * files that turn produced) and by the app's publish action (with all of them).
 *
 * A path under `work/` goes to the model's private workspace; every other path
 * is the project's site.
 */
function mirror({ projectId, projectName, files = [], published = false }) {
  if (!projectId) return null;
  fs.mkdirSync(ROOT, { recursive: true });

  const { dir, slug } = dirFor(projectId, projectName);
  fs.mkdirSync(dir, { recursive: true });
  const { site, work } = ensureLayout(dir);

  let written = 0;
  let workspace = 0;
  for (const file of files) {
    const relative = safeRelative(file.path);
    if (!relative) continue;

    const isWork = WORK_PREFIX.test(relative);
    const target = path.join(isWork ? work : site, relative.replace(WORK_PREFIX, ''));
    if (!target.startsWith(`${isWork ? work : site}${path.sep}`)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });

    const binary = decodeDataUrl(file.content);
    if (binary) fs.writeFileSync(target, binary.bytes);
    else fs.writeFileSync(target, String(file.content || ''), 'utf8');
    if (isWork) workspace += 1;
    else written += 1;
  }

  const manifest = {
    id: projectId,
    name: projectName || slug,
    slug,
    updated_at: new Date().toISOString(),
    ...(published ? { published_at: new Date().toISOString() } : {}),
  };
  try {
    const previous = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
    if (!published && previous.published_at) manifest.published_at = previous.published_at;
  } catch {
    /* first write */
  }
  fs.writeFileSync(path.join(dir, 'project.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return { dir, slug, written, workspace, files: countFiles(site) };
}

function countFiles(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'project.json') continue;
      if (entry.isDirectory()) total += countFiles(path.join(dir, entry.name));
      else total += 1;
    }
  } catch {
    /* unreadable directory counts as empty */
  }
  return total;
}

/** Every published project, for the list a person sees on a subdomain. */
function published() {
  try {
    return fs
      .readdirSync(ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(ROOT, entry.name, 'project.json'), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter((manifest) => manifest?.published_at)
      .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
  } catch {
    return [];
  }
}

/**
 * Serve one project's files for a request that asked for it — either on its own
 * subdomain (the whole path belongs to the project) or under the app's own
 * domain at `/<slug>` (`rest` is then the path inside the project).
 */
function serve(slug, req, res, rest = '') {
  const label = slugify(slug, '');
  if (!label) return false;

  const dir = path.join(ROOT, label);
  const manifest = path.join(dir, 'project.json');
  if (!fs.existsSync(manifest)) return false;

  // Only the site folder is ever served; the model's workspace is private.
  const base = path.join(dir, 'site');
  ensureLayout(dir);

  let relative;
  try {
    relative = safeRelative(decodeURIComponent(rest));
  } catch {
    relative = safeRelative(rest);
  }

  let file = path.join(base, relative || 'index.html');
  if (relative && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }

  // A single-page project: unknown paths fall back to its index.
  if (!fs.existsSync(file) && !path.extname(relative || '')) file = path.join(base, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return true;
  }

  if (!file.startsWith(`${base}${path.sep}`) && file !== path.join(base, 'index.html')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return true;
  }

  res.writeHead(200, {
    'Content-Type': contentType(file),
    'Cache-Control': 'public, max-age=60',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

/** Every file in one project's private workspace, with sizes. */
function listWork(projectId) {
  const dir = dirForProjectId(projectId);
  if (!dir) return null;

  const { work } = ensureLayout(dir);
  const out = [];

  const walk = (current) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      try {
        const stat = fs.statSync(full);
        out.push({
          path: path.relative(work, full).split(path.sep).join('/'),
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      } catch {
        /* unreadable entries are left out */
      }
    }
  };

  walk(work);
  return out.sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 200);
}

/** The directory of the project with this id, if it has one on disk. */
function dirForProjectId(projectId) {
  const id = String(projectId || '');
  if (!id) return null;
  try {
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(ROOT, entry.name);
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'project.json'), 'utf8'));
        if (manifest?.id === id) return candidate;
      } catch {
        /* not a project directory */
      }
    }
  } catch {
    /* no projects yet */
  }
  return null;
}

/** What a subdomain's root shows when no project has that name. */
function listing(res) {
  const projects = published();
  const rows = projects
    .map((p) => `<li>${String(p.name || p.slug).replace(/[<>&]/g, '')}</li>`)
    .join('');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>xecutr</title>` +
      '<body style="font:14px system-ui;padding:2rem"><h1>No project here yet</h1>' +
      `<p>Published projects: ${projects.length}</p><ul>${rows}</ul></body>`,
  );
}

module.exports = { mirror, serve, published, listing, listWork, slugify, ROOT };
