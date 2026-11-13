import { secrets } from "base44:runtime";

/**
 * Server-side client for the Xecutr gateway (see API.md in NorthernGrower/xecutr).
 * Calls are server-to-server, so browser CORS never applies and provider keys
 * stay on the deployment. Point it somewhere else with the XECUTR_API_URL
 * secret, and set XECUTR_API_TOKEN when the deployment has FORGE_OS_API_TOKEN.
 */
const DEFAULT_BASE = "https://forge-os-8whi.onrender.com";

export const apiBase = () => (secrets.get("XECUTR_API_URL") || DEFAULT_BASE).replace(/\/+$/, "");

const headers = () => {
  const token = secrets.get("XECUTR_API_TOKEN");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export async function fetchProviders() {
  try {
    const res = await fetch(`${apiBase()}/api/providers`, { headers: headers() });
    if (!res.ok) return { providers: [], readyCount: 0, error: `the gateway answered ${res.status}` };
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
  throw Object.assign(
    new Error(`The xecutr gateway answered ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`),
    { status: 502 },
  );
}