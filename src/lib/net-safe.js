/**
 * Address checks and fetch helpers for anything the app did not author itself.
 * Shared by the workspace chat's fetch tool and the agent's inspection route.
 */

/**
 * Only public web addresses may be fetched. Blocks loopback, private ranges,
 * link-local (cloud metadata), CGNAT and single-label internal hostnames, and
 * refuses credentials or non-standard ports.
 */
export const isPublicHttpUrl = (url) => {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".")) return false;
  if (/(^|\.)(localhost|internal|local|home|lan|corp|intranet)$/.test(host)) return false;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }
  return true;
};

const HOPS = 4;
const TIMEOUT_MS = 12000;
const UA = { "user-agent": "xecutr-inspect" };

/** Requests one public address, re-checking every redirect hop before following it. */
const requestPublic = async (raw) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: "That is not a valid URL." };
  }

  for (let hop = 0; hop < HOPS; hop += 1) {
    if (!isPublicHttpUrl(url)) return { error: "Only public web addresses can be fetched." };

    const res = await fetch(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: UA,
    });

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { status: res.status, url: url.toString(), res };
      url = new URL(next, url);
      continue;
    }

    return { status: res.status, url: url.toString(), res };
  }

  return { error: "That address redirected too many times." };
};

/** A public page as plain text, capped. */
export const fetchPublicText = async (raw, maxChars = 20000) => {
  const got = await requestPublic(raw);
  if (got.error) return { error: got.error };

  const type = got.res.headers.get("content-type") || "";
  if (type && !/text\/|json|xml|javascript/i.test(type)) {
    return { status: got.status, error: `that address served ${type}` };
  }

  const text = await got.res.text();
  return { status: got.status, text: text.slice(0, maxChars) };
};

/** A public page with its status, final address and headers, for inspection. */
export const fetchPublicPage = async (raw, maxChars = 400000) => {
  const got = await requestPublic(raw);
  if (got.error) return { error: got.error };

  const headers = {};
  got.res.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const type = headers["content-type"] || "";
  if (type && !/text\/|json|xml|javascript|html/i.test(type)) {
    return { error: `That address served ${type}, not a page.`, url: got.url };
  }

  const text = (await got.res.text()).slice(0, maxChars);
  return { status: got.status, url: got.url, headers, text };
};

/** A public file as bytes, capped. Nothing is executed. */
export const fetchPublicBinary = async (raw, maxBytes = 3 * 1024 * 1024) => {
  const got = await requestPublic(raw);
  if (got.error) return { error: got.error };

  const buffer = await got.res.arrayBuffer();
  return {
    status: got.status,
    url: got.url,
    size: buffer.byteLength,
    contentType: got.res.headers.get("content-type") || "",
    bytes: new Uint8Array(buffer.slice(0, maxBytes)),
  };
};