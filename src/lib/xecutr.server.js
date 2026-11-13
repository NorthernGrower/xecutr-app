import { secrets } from "base44:runtime";

/**
 * Server-side client for the Xecutr gateway, which runs on the same server that
 * hosts the app (deploy/gateway/). Calls are server-to-server, so browser CORS
 * never applies and provider keys stay on the deployment. The domain is served
 * over HTTPS with real certificates, so provider keys ARE forwardable. Point it
 * somewhere else with the XECUTR_API_URL secret, and set XECUTR_API_TOKEN when
 * the deployment has FORGE_OS_API_TOKEN.
 */
const DEFAULT_BASE = "https://xecutr.cloud";

export const apiBase = () => (secrets.get("XECUTR_API_URL") || DEFAULT_BASE).replace(/\/+$/, "");

/** Nothing secret is attached unless the hop is encrypted (or running locally). */
const safeTransport = () => {
  const base = apiBase();
  return base.startsWith("https://") || isLocal(base);
};

const authHeaders = () => {
  const token = safeTransport() ? secrets.get("XECUTR_API_TOKEN") : undefined;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const headers = () => ({ "Content-Type": "application/json", ...authHeaders() });

const isLocal = (base) => /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);

/**
 * A caller's provider keys may only travel over TLS. The gateway default is a
 * plain-http address, so anything sent there would be readable on the wire.
 */
export const forwardableKeys = (keys) =>
  safeTransport() && keys && typeof keys === "object" ? keys : {};

/** Gateway and upstream errors can quote request bodies, so strip key-shaped text. */
export const redact = (text = "") =>
  String(text)
    .replace(/\b(sk-|gsk_|ghp_|gho_|github_pat_|hf_|AIza|Bearer\s+)[A-Za-z0-9._-]{6,}/g, "$1[redacted]")
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "[redacted]");

/**
 * A refusal that never reached the gateway means the address itself is blocked
 * from the deployment host (plain http on port 8080 is not allowed), so say so
 * instead of leaving a bare status code.
 */
const refusal = (status, detail = "") => {
  const snippet = redact(detail).trim().slice(0, 140);
  const hint =
    status === 401 || status === 403
      ? " The request was refused before it reached the gateway — it has to be served over HTTPS on port 443 to be reachable from this app."
      : "";
  return `the gateway answered ${status}${snippet ? ` — ${snippet}` : ""}.${hint}`;
};

/** `keys` scopes the catalogue to a caller's own provider keys for this call only. */
export async function fetchProviders(keys) {
  try {
    const scoped = keys && Object.keys(keys).length > 0;
    const res = await fetch(`${apiBase()}/api/providers`, {
      method: scoped ? "POST" : "GET",
      headers: headers(),
      ...(scoped ? { body: JSON.stringify({ keys }) } : {}),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { providers: [], readyCount: 0, error: refusal(res.status, detail) };
    }
    const body = await res.json();
    return {
      providers: Array.isArray(body?.providers) ? body.providers : [],
      readyCount: body?.readyCount ?? 0,
      demo: Boolean(body?.demo),
    };
  } catch (err) {
    return { providers: [], readyCount: 0, error: String(err?.message || err) };
  }
}

/** One streaming turn: returns the gateway's SSE response untouched. */
export async function postChat(body) {
  const res = await fetch(`${apiBase()}/api/chat`, {
    method: "POST",
    headers: { ...headers(), Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  if (res.ok) {
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  const detail = await res.text().catch(() => "");
  throw Object.assign(new Error(refusal(res.status, detail)), { status: 502 });
}

/** POST /api/uploads — raw bytes, referenced by id in later chat turns. */
export async function postUpload(bytes, name) {
  const res = await fetch(`${apiBase()}/api/uploads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-upload-id": crypto.randomUUID(),
      "x-upload-name": encodeURIComponent(name),
      ...authHeaders(),
    },
    body: bytes,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    throw Object.assign(new Error(`The gateway refused the upload (${res.status}).`), { status: 502 });
  }
  return { id: body.uploadId, name: body.name || name, size: body.size ?? bytes.byteLength };
}

/** GET /api/health — liveness probe. */
export async function fetchHealth() {
  try {
    const res = await fetch(`${apiBase()}/api/health`, { headers: headers() });
    if (!res.ok) return { ok: false, error: refusal(res.status) };
    const body = await res.json();
    return { ok: Boolean(body?.ok), name: body?.name || "xecutr", time: body?.time || null };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}