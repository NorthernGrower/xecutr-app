import { createFileRoute, Link } from "@tanstack/react-router";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import Panel from "@/components/workspace/Panel";
import { HELP } from "@/lib/help";

export const Route = createFileRoute("/help")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "how to use xecutr" },
      {
        name: "description",
        content:
          "How to connect each part of xecutr: accounts, projects, plan and build, models, provider keys, images, media, tasks, GitHub, Telegram and Siri.",
      },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <WorkspaceHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-8 sm:px-6">
        <p className="label-mono">how to</p>
        <h1 className="mt-2 font-display text-[26px] font-bold uppercase tracking-[0.04em] text-white">
          using xecutr
        </h1>
        <p className="mt-3 max-w-2xl font-body text-[13px] leading-relaxed text-muted-foreground">
          One section per feature: what it does, how to use it, and the limit worth knowing. Every
          page in the app is linked from the top bar; this page explains what to do once you are there.
        </p>

        <nav className="mt-5 flex flex-wrap gap-1.5">
          {HELP.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-sm border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground transition hover:border-[#b0c4de]/40 hover:text-white"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="mt-6 space-y-4">
          {HELP.map((section) => (
            <Panel key={section.id} className="scroll-mt-20 p-4" id={section.id}>
              <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.16em] text-white">
                {section.title}
              </h2>
              <p className="mt-2 font-body text-[12.5px] leading-relaxed text-muted-foreground">
                {section.intro}
              </p>
              <ul className="mt-3 space-y-1.5">
                {section.steps.map((step) => (
                  <li
                    key={step}
                    className="flex gap-2 font-body text-[12.5px] leading-relaxed text-[#334155]"
                  >
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#0e7490]" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/"
            className="rounded-sm border border-[#e0f7ff]/35 bg-[#e0f7ff]/[0.06] px-3.5 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0e7490] transition hover:bg-[#e0f7ff]/[0.14]"
          >
            start a project
          </Link>
          <Link
            to="/connections"
            className="rounded-sm border border-white/15 px-3.5 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition hover:border-[#b0c4de]/50 hover:text-white"
          >
            add a provider key
          </Link>
        </div>
      </main>
    </div>
  );
}
