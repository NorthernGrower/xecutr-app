import { fetchPublicPage } from "@/lib/net-safe";

/**
 * Static inspection of a live site: what it is built with, what it loads, which
 * hosts it talks to and which endpoints its inline scripts reference. The page is
 * read, never executed.
 */

const SIGNALS = [
  { name: "Next.js", pattern: /__next_data__|\/_next\// },
  { name: "React", pattern: /data-reactroot|data-reactid|__react|react-dom/ },
  { name: "Vue", pattern: /data-v-[0-9a-f]{6,}|__vue__|vue(?:\.runtime)?(?:\.min)?\.js/ },
  { name: "Nuxt", pattern: /__nuxt__|\/_nuxt\// },
  { name: "Svelte / SvelteKit", pattern: /svelte-[a-z0-9]{5,}|__sveltekit/ },
  { name: "Angular", pattern: /ng-version=|ng-app/ },
  { name: "Astro", pattern: /astro-island|data-astro/ },
  { name: "WordPress", pattern: /wp-content|wp-includes/ },
  { name: "Shopify", pattern: /cdn\.shopify\.com|shopify\.theme/ },
  { name: "Webflow", pattern: /webflow/ },
  { name: "Tailwind CSS", pattern: /tailwind/ },
  { name: "Google Tag Manager / Analytics", pattern: /googletagmanager\.com|gtag\(|google-analytics\.com/ },
  { name: "Stripe.js", pattern: /js\.stripe\.com/ },
  { name: "Sentry", pattern: /sentry\.io|__sentry__/ },
  { name: "Algolia", pattern: /algolia(?:net|\.com)/ },
  { name: "Intercom", pattern: /intercom(?:cdn|\.io)/ },
];

const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];

const decode = (text) =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const textOf = (html) => decode(String(html || "").replace(/<[^>]+>/g, " "));

const firstOf = (html, pattern) => {
  const hit = pattern.exec(html);
  return hit ? textOf(hit[1]) : "";
};

const allOf = (html, pattern) => {
  const out = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let hit;
  while ((hit = regex.exec(html))) if (hit[1]) out.push(hit[1]);
  return out;
};

const absolute = (value, base) => {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
};

const hostOf = (value, base) => {
  const url = absolute(value, base);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol.startsWith("http") ? parsed.hostname : null;
  } catch {
    return null;
  }
};

const unique = (values, limit) => [...new Set(values.filter(Boolean))].slice(0, limit);

export async function analyzeWebsite(raw) {
  const page = await fetchPublicPage(raw);
  if (page.error) return { mode: "website", target: raw, error: page.error };

  const html = page.text || "";
  const lowered = html.toLowerCase();
  const headers = page.headers || {};
  const pageHost = hostOf(page.url, page.url) || "";

  const frameworks = SIGNALS.map((signal) => {
    const hit = signal.pattern.exec(lowered);
    return hit ? { name: signal.name, evidence: hit[0] } : null;
  })
    .filter(Boolean)
    .slice(0, 12);

  const scripts = unique(
    allOf(html, /<script[^>]+src=["']([^"']+)["']/gi).map((src) => absolute(src, page.url)),
    18,
  );

  const hosts = unique(
    allOf(html, /<(?:script|link|img|iframe)[^>]+(?:src|href)=["']([^"']+)["']/gi)
      .map((value) => hostOf(value, page.url))
      .filter((host) => host && host !== pageHost),
    18,
  );

  const forms = [...html.matchAll(/<form([^>]*)>([\s\S]{0,800}?)<\/form>/gi)]
    .slice(0, 6)
    .map(([, attrs, inner]) => ({
      action: absolute((/action=["']([^"']*)["']/i.exec(attrs) || [])[1] || page.url, page.url),
      method: ((/method=["']([^"']*)["']/i.exec(attrs) || [])[1] || "get").toLowerCase(),
      fields: unique(allOf(inner, /name=["']([^"']+)["']/gi), 10),
    }));

  const inline = allOf(html, /<script(?![^>]+src=)[^>]*>([\s\S]*?)<\/script>/gi).join("\n").slice(0, 200000);
  const endpoints = unique(
    [
      ...allOf(inline, /["'`](https?:\/\/[^"'`\s]+)["'`]/g),
      ...allOf(inline, /["'`](\/(?:api|v\d|graphql|rest|auth|oauth|socket|ws)[^"'`\s]*)["'`]/g),
    ].map((value) => value.slice(0, 300)),
    18,
  );

  return {
    mode: "website",
    target: page.url,
    status: page.status,
    title: firstOf(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: firstOf(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i),
    headline: {
      h1: allOf(html, /<h1[^>]*>([\s\S]*?)<\/h1>/gi).map(textOf).filter(Boolean).slice(0, 6),
      h2: allOf(html, /<h2[^>]*>([\s\S]*?)<\/h2>/gi).map(textOf).filter(Boolean).slice(0, 6),
    },
    frameworks,
    server: {
      server: headers.server || "",
      poweredBy: headers["x-powered-by"] || "",
      generator: firstOf(html, /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']*)["']/i),
    },
    scripts,
    thirdPartyHosts: hosts,
    forms,
    endpoints,
    securityHeaders: Object.fromEntries(
      SECURITY_HEADERS.map((name) => [name, headers[name] ? "present" : "missing"]),
    ),
    limitations: [
      "The delivered HTML, headers and inline scripts are read statically; nothing is executed.",
      "Framework detection is fingerprint evidence, not proof; a page rendered fully in the browser may show little.",
      "External bundles are listed by address but not downloaded or analysed.",
    ],
  };
}