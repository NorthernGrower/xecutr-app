import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Mail, Mic, Send, User as UserIcon } from "lucide-react";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Panel from "@/components/workspace/Panel";
import { base44 } from "@/api/base44Client";
import { xecutrChannels } from "@/lib/chat";

export const Route = createFileRoute("/_authed/profile")({
  ssr: false,
  head: () => ({ meta: [{ title: "profile — xecutr" }] }),
  component: ProfilePage,
});

/** The iOS Shortcut the Siri section of the help page walks through. */
const SIRI_SHORTCUT = "shortcuts://run-shortcut?name=Ask%20Xecutr";

const CHANNEL_BUTTON =
  "inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-white/15 px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:border-[#b0c4de]/50 hover:text-white";

function ProfilePage() {
  const user = Route.useRouteContext().user;
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [channels, setChannels] = useState(null);

  /** The gateway knows whether the bot and the voice endpoint are live, so ask it. */
  useEffect(() => {
    let alive = true;
    xecutrChannels()
      .then((next) => alive && setChannels(next))
      .catch(() => alive && setChannels({ configured: false, bot: "", link: "" }));
    return () => {
      alive = false;
    };
  }, []);

  // The page is client-only, so the browser is always there by the time it renders.
  const isIOS =
    typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

  const telegramNote =
    channels === null
      ? "checking the gateway…"
      : !channels.configured
        ? "Not set up yet. It needs a bot token and a webhook secret on the gateway."
        : channels.link
          ? `Connected as @${channels.bot}. Message it and the answer comes back there.`
          : "Connected, but the bot's own name could not be read just now.";

  const siriNote =
    channels === null
      ? "checking the gateway…"
      : !channels.configured
        ? "Not set up yet. It uses the same secret as Telegram."
        : isIOS
          ? "Ready. The “Ask Xecutr” shortcut asks the gateway and speaks the answer."
          : "Ready — the “Ask Xecutr” shortcut runs on an iPhone or iPad.";

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

          <Panel glow className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
              <Send className="h-3.5 w-3.5 text-[#b0c4de]" strokeWidth={1.6} />
              <span className="label-mono">talk to it elsewhere</span>
            </div>

            <div className="divide-y divide-white/[0.07]">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-white">
                    Telegram
                  </p>
                  <p className="mt-1 font-body text-[12px] leading-relaxed text-muted-foreground">
                    {telegramNote}
                  </p>
                </div>
                {channels?.link ? (
                  <a
                    href={channels.link}
                    target="_blank"
                    rel="noreferrer"
                    className={CHANNEL_BUTTON}
                  >
                    <Send className="h-3 w-3" strokeWidth={1.8} />
                    open bot
                  </a>
                ) : (
                  <Link to="/help" hash="telegram" className={CHANNEL_BUTTON}>
                    set it up
                  </Link>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-white">
                    Siri
                  </p>
                  <p className="mt-1 font-body text-[12px] leading-relaxed text-muted-foreground">
                    {siriNote}
                  </p>
                </div>
                {isIOS ? (
                  <a href={SIRI_SHORTCUT} className={CHANNEL_BUTTON}>
                    <Mic className="h-3 w-3" strokeWidth={1.8} />
                    open in siri
                  </a>
                ) : (
                  <Link to="/help" hash="siri" className={CHANNEL_BUTTON}>
                    how to
                  </Link>
                )}
              </div>
            </div>

            <p className="border-t border-white/[0.07] px-4 py-2.5 font-body text-[11.5px] leading-relaxed text-muted-foreground">
              Both answer through the same model chain as the app, without a browser session. Neither
              writes into a project&apos;s files.
            </p>
          </Panel>
        </div>
      </main>
    </div>
  );
}
