import { cn } from "@/lib/utils";

/**
 * xecutr mark: a microchip die with a circuit-X trace inside it, plus the
 * geometric wordmark. Sharp corners, slate outline, teal core — drawn for the
 * light canvas (the darker lines would vanish on paper).
 */
export default function Mark({ size = 30, withWordmark = true, className }) {
  return (
    <span className={cn("inline-flex select-none items-center gap-3", className)}>
      <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <rect x="0.75" y="0.75" width="32.5" height="32.5" rx="3" stroke="#94a3b8" strokeOpacity="0.8" />
        <rect x="4.5" y="4.5" width="25" height="25" rx="1.5" stroke="#0e7490" strokeOpacity="0.45" />
        {/* die pins */}
        <g stroke="#64748b" strokeOpacity="0.8" strokeWidth="1.4" strokeLinecap="square">
          <path d="M11 0.75V4.5M17 0.75V4.5M23 0.75V4.5M11 29.5v3.75M17 29.5v3.75M23 29.5v3.75" />
          <path d="M0.75 11H4.5M0.75 17H4.5M0.75 23H4.5M29.5 11h3.75M29.5 17h3.75M29.5 23h3.75" />
        </g>
        {/* circuit-X */}
        <path d="M11.5 11.2 L22.5 22.8 M22.5 11.2 L11.5 22.8" stroke="#0e7490" strokeWidth="2.1" strokeLinecap="square" />
        <circle cx="17" cy="17" r="1.6" fill="#ffffff" stroke="#0e7490" strokeWidth="1.1" />
      </svg>
      {withWordmark && (
        <span className="font-display text-[15px] font-bold uppercase leading-none tracking-[0.34em] text-white">
          xecutr
        </span>
      )}
    </span>
  );
}