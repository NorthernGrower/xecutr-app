import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { KeyRound, Mail, User as UserIcon } from "lucide-react";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Panel from "@/components/workspace/Panel";
import { base44 } from "@/api/base44Client";

export const Route = createFileRoute("/_authed/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "profile — xecutr" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const user = Route.useRouteContext().user;
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  /**
   * Passwords belong to the Base44 platform account, so the way to change one
   * is the platform's own reset flow: an email with a link, valid for the
   * account on every address the app is served from (here and on www).
   */
  const sendReset = async () => {
    if (!user?.email) return;
    setBusy(true);
    try {
      await base44.auth.resetPasswordRequest(user.email);
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <WorkspaceHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pb-14 pt-8 sm:px-6">
        <p className="label-mono">members</p>
        <h1 className="mt-2 font-display text-[24px] font-bold uppercase tracking-[0.04em] text-white">
          profile
        </h1>

        <div className="mt-6 space-y-4">
          <Panel glow className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
              <UserIcon className="h-3.5 w-3.5 text-[#b0c4de]" strokeWidth={1.6} />
              <span className="label-mono">account</span>
            </div>
            <div className="grid gap-2 px-4 py-4 font-body text-[13px] text-[#eef3f8]">
              <p>
                <span className="text-muted-foreground">Name:</span> {user?.full_name || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span> {user?.email || "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Role:</span>{" "}
                <span className="font-mono text-[12px] uppercase text-[#e0f7ff]">{user?.role || "user"}</span>
              </p>
            </div>
          </Panel>

          <Panel glow className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
              <KeyRound className="h-3.5 w-3.5 text-[#b0c4de]" strokeWidth={1.6} />
              <span className="label-mono">change password</span>
            </div>
            <div className="px-4 py-4">
              <p className="font-body text-[13px] leading-relaxed text-muted-foreground">
                Your password belongs to your account, so changing it works through a secure
                email link. The new password then works everywhere you're signed in — here and
                on www.
              </p>
              {sent ? (
                <p className="mt-4 flex items-start gap-2 font-body text-[13px] leading-relaxed text-[#e0f7ff]">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                  Reset link sent to {user?.email}. Open it on this device, set the new password,
                  and log in again with it.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={sendReset}
                  disabled={busy}
                  className="mt-4 rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-3.5 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e0f7ff] transition hover:border-[#e0f7ff]/70 hover:bg-[#e0f7ff]/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Email me a reset link"}
                </button>
              )}
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
