import { useEffect } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "@/components/DefaultCatchBoundary";
import { NotFound } from "@/components/NotFound";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/AuthContext";
import { watchBuild, watchChunkErrors } from "@/lib/chunk-reload";
import { BUILD } from "@/lib/build";
import { Base44Scripts } from "base44:document";
import appCss from "@/index.css?url";

/**
 * Runs before any script module does, so a page whose script files a newer
 * deploy replaced can still recover: it reloads once at a cache-busting address
 * and then gives up rather than looping. The same key and window are used in
 * src/lib/chunk-reload.js, so the two never reload twice for one failure.
 */
const BOOT_GUARD = `(function(){try{var K="xecutr:reload-at",W=15000;function go(){var last=0;try{last=Number(sessionStorage.getItem(K)||0)}catch(e){}if(last&&Date.now()-last<W)return;try{sessionStorage.setItem(K,String(Date.now()))}catch(e){}var u=new URL(location.href);u.searchParams.set("_v",String(Date.now()));location.replace(u.toString())}function hit(t){return /importing a module script failed|dynamically imported module|unable to preload css|loading chunk \\w+ failed/i.test(String(t||""))}window.addEventListener("error",function(e){var t=e.target;if(t&&t.tagName==="SCRIPT")return go();hit(e.message||(e.error&&e.error.message))&&go()},true);window.addEventListener("unhandledrejection",function(e){var r=e.reason;hit((r&&r.message)||r)&&go()})}catch(e){}})();`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        // resizes-content makes Android Chrome shrink the layout viewport for the
        // keyboard (iOS is handled by --kb-inset in the chat); viewport-fit=cover
        // lets the safe areas be honoured on a notched phone.
        content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { title: "xecutr — build beyond limits" },
      {
        name: "description",
        content:
          "xecutr is a provider-agnostic coding agent that turns prompts into working projects, with file output, project memory and your own provider keys.",
      },
      { name: "theme-color", content: "#f6f8fa" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  // A document cached across a deploy would keep asking for script files that no
  // longer exist, so the page itself is never stored by the browser or an edge.
  headers: () => ({ "cache-control": "no-store" }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
  component: RootComponent,
});

function RootComponent() {
  // A script file the page cannot load means this tab is older than the build.
  // And a tab brought back after a deploy reloads itself, so it never runs code
  // the server no longer serves.
  useEffect(() => {
    const stopChunkWatch = watchChunkErrors();
    const stopBuildWatch = watchBuild(BUILD);
    return () => {
      stopChunkWatch();
      stopBuildWatch();
    };
  }, []);

  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}

function RootDocument({ children }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: BOOT_GUARD }} />
      </head>
      <body data-react-root="true" className="bg-background text-foreground">
        {children}
        <Base44Scripts />
        <Scripts />
      </body>
    </html>
  );
}