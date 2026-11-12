import ReactMarkdown from "react-markdown";

/** Agent prose: markdown rendered on the obsidian surface, code kept readable. */
export default function AgentMarkdown({ children }) {
  return (
    <div className="font-body text-[13.5px] leading-relaxed text-[#dfe6ee]">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap">{children}</p>,
          h1: ({ children }) => (
            <h3 className="mt-3 mb-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-white">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mt-3 mb-1.5 font-display text-[12.5px] font-semibold uppercase tracking-[0.12em] text-white">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 mb-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.12em] text-[#e0f7ff]">
              {children}
            </h4>
          ),
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4">{children}</ol>,
          li: ({ children }) => <li className="marker:text-[#b0c4de]">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[#e0f7ff] underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => (
            <code className="rounded-sm border border-white/10 bg-white/[0.05] px-1 py-0.5 font-mono text-[11.5px] text-[#e0f7ff]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-auto rounded-sm border border-white/10 bg-[#0b0b0b] p-3 font-mono text-[11.5px] leading-relaxed text-[#dfe6ee]">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-3 border-white/10" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}