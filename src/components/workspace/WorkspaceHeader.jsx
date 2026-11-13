import { Link } from "@tanstack/react-router";
import { Bot, Cpu, LayoutGrid, ListTodo, LogOut, Menu, Plug } from "lucide-react";
import Mark from "@/components/brand/Mark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/AuthContext";

const NAV = [
  { to: "/projects", label: "projects", Icon: LayoutGrid },
  { to: "/tasks", label: "tasks", Icon: ListTodo },
  { to: "/agent", label: "agent", Icon: Bot },
  { to: "/connections", label: "connections", Icon: Plug },
];

const NAV_CLASS =
  "inline-flex items-center gap-1.5 rounded-sm border border-white/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white";

/** Top chrome shared by every workspace screen. Nav collapses into a menu on phones. */
export default function WorkspaceHeader({ providerLabel }) {
  const { user, isLoadingAuth, logout, navigateToLogin } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0a]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-3 sm:px-6">
        <Link to="/" className="shrink-0">
          <Mark size={26} />
        </Link>

        <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground lg:inline">
          build beyond limits
        </span>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {providerLabel && (
            <span className="hidden items-center gap-2 rounded-sm border border-[#b0c4de]/20 bg-white/[0.02] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#b0c4de] xl:inline-flex">
              <Cpu className="h-3 w-3" strokeWidth={1.6} />
              {providerLabel}
            </span>
          )}

          {!isLoadingAuth && !user && (
            <button
              type="button"
              onClick={() => navigateToLogin()}
              className="rounded-sm border border-[#e0f7ff]/30 px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e0f7ff] transition hover:border-[#e0f7ff]/70 hover:bg-[#e0f7ff]/[0.07] sm:px-3.5"
            >
              sign in
            </button>
          )}

          {user && (
            <>
              <nav className="hidden items-center gap-1.5 md:flex">
                {NAV.map(({ to, label, Icon }) => (
                  <Link key={to} to={to} className={NAV_CLASS}>
                    <Icon className="h-3 w-3" strokeWidth={1.6} />
                    {label}
                  </Link>
                ))}
              </nav>

              <span className="hidden max-w-[140px] truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground xl:inline">
                {user.full_name || user.email}
              </span>

              <button
                type="button"
                onClick={() => logout()}
                aria-label="Sign out"
                className="hidden rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-white/30 hover:text-white md:inline-block"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.6} />
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Open menu"
                    className="rounded-sm border border-white/10 p-1.5 text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white md:hidden"
                  >
                    <Menu className="h-4 w-4" strokeWidth={1.6} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 border-white/10 bg-[#0b0b0b] p-1"
                >
                  <DropdownMenuLabel className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    {user.full_name || user.email}
                  </DropdownMenuLabel>
                  {NAV.map(({ to, label, Icon }) => (
                    <DropdownMenuItem key={to} asChild>
                      <Link
                        to={to}
                        className="flex items-center gap-2 rounded-sm px-2 py-2 font-display text-[11px] uppercase tracking-[0.14em] text-white outline-none focus:bg-white/[0.06]"
                      >
                        <Icon className="h-3.5 w-3.5 text-[#b0c4de]" strokeWidth={1.6} />
                        {label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onSelect={() => logout()}
                    className="flex items-center gap-2 rounded-sm px-2 py-2 font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground outline-none focus:bg-white/[0.06] focus:text-white"
                  >
                    <LogOut className="h-3.5 w-3.5" strokeWidth={1.6} />
                    sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </header>
  );
}