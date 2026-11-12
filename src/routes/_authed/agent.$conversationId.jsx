import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import AgentChat from "@/components/agent/AgentChat";

export const Route = createFileRoute("/_authed/agent/$conversationId")({
  ssr: false,
  head: () => ({ meta: [{ title: "agent session — xecutr" }] }),
  component: AgentSessionPage,
});

function AgentSessionPage() {
  const { conversationId } = Route.useParams();

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <WorkspaceHeader />

      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2 sm:px-6">
        <Link
          to="/agent"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition hover:text-white"
        >
          <ChevronLeft className="h-3 w-3" strokeWidth={1.8} />
          all sessions
        </Link>
        <span className="ml-auto font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
          xecutr agent
        </span>
      </div>

      <AgentChat conversationId={conversationId} />
    </div>
  );
}