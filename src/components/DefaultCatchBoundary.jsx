import { useEffect } from "react";
import { ErrorComponent, Link, rootRouteId, useMatch, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { isChunkError, reloadForChunkError } from "@/lib/chunk-reload";

export function DefaultCatchBoundary({ error }) {
  const router = useRouter();
  const isRoot = useMatch({ strict: false, select: (state) => state.id === rootRouteId });
  const stale = isChunkError(error);

  // The page's script files were replaced by a newer build: only a fresh
  // document can load it, so retrying inside this one would fail again.
  useEffect(() => {
    if (stale) reloadForChunkError();
  }, [stale]);

  if (stale) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-24 text-center">
        <p className="label-mono">new version</p>
        <h1 className="font-display text-[18px] font-semibold uppercase tracking-[0.12em] text-white">
          loading the latest build
        </h1>
        <p className="font-body text-[12.5px] leading-relaxed text-muted-foreground">
          This page was open before the app was updated. It is refreshing itself to pick up the current
          version.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload now
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 py-24">
      <ErrorComponent error={error} />
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.invalidate()}>
          Try again
        </Button>
        <Button asChild>{isRoot ? <Link to="/">Home</Link> : <Link to="/" onClick={(e) => { e.preventDefault(); window.history.back(); }}>Go back</Link>}</Button>
      </div>
    </div>
  );
}