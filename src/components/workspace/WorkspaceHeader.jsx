import { Link } from "@tanstack/react-router";
import { Bot, Cpu, LayoutGrid, ListTodo, LogOut, Plug } from "lucide-react";
import Mark from "@/components/brand/Mark";
import { useAuth } from "@/lib/AuthContext";

/** Top chrome shared by every workspace screen. */
export default function WorkspaceHeader({ providerLabel }) {
  const { user, isLoadingAuth, logout, navigateToLogin } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0a]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="shrink-0">
          <Mark size={26} />
        </Link>

        <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
          build beyond limits
        </span>

        <div className="ml-auto flex items-center gap-2">
          {providerLabel && (
            <span className="hidden items-center gap-2 rounded-sm border border-[#b0c4de]/20 bg-white/[0.02] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#b0c4de] md:inline-flex">
              <Cpu className="h-3 w-3" strokeWidth={1.6} />
              {providerLabel}
            </span>
          )}

          {!isLoadingAuth && !user && (
            <button
              type="button"
              onClick={() => navigateToLogin()}
              className="rounded-sm border border-[#e0f7ff]/30 px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e0f7ff] transition hover:border-[#e0f7ff]/70 hover:bg-[#e0f7ff]/[0.07]"
            >
              sign in
            </button>
          )}

          {user && (
            <>
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
              >
                <LayoutGrid className="h-3 w-3" strokeWidth={1.6} />
                projects
              </Link>
              <Link
                to="/tasks"
                className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
              >
                <ListTodo className="h-3 w-3" strokeWidth={1.6} />
                tasks
              </Link>
              <Link
                to="/agent"
                className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
              >
                <Bot className="h-3 w-3" strokeWidth={1.6} />
                agent
              </Link>
              <Link
                to="/connections"
                className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
              >
                <Plug className="h-3 w-3" strokeWidth={1.6} />
                connections
              </Link>
              <span className="hidden max-w-[140px] truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground lg:inline">
                {user.full_name || user.email}
              </span>
              <button
                type="button"
                onClick={() => logout()}
                aria-label="Sign out"
                className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-white/30 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.6} />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}