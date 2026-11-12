import { Link } from "@tanstack/react-router";
import { ArrowRight, MessagesSquare } from "lucide-react";

/** Past agent sessions, newest first. */
export default function SessionList({ sessions, loading }) {
  if (loading) {
    return (
      <p className="label-mono mt-6">loading sessions…</p>
    );
  }

  if (!sessions.length) {
    return (
      <div className="mt-6 rounded-sm border border-white/10 bg-card/60 p-6 text-center">
        <p className="font-body text-[12.5px] leading-relaxed text-muted-foreground">
          No sessions yet. Start one and the agent keeps the whole thread for you.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-6 divide-y divide-white/[0.06] overflow-hidden rounded-sm border border-white/10">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            to="/agent/$conversationId"
            params={{ conversationId: session.id }}
            className="flex items-center gap-3 bg-card/60 px-4 py-3 transition hover:bg-white/[0.03]"
          >
            <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-[#b0c4de]" strokeWidth={1.6} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-body text-[13px] text-white">
                {session.metadata?.name || "untitled session"}
              </span>
              <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                {session.messages?.length || 0} messages
                {session.updated_date
                  ? ` · ${new Date(session.updated_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}`
                  : ""}
              </span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
          </Link>
        </li>
      ))}
    </ul>
  );
}