import { cn } from "@/lib/utils";

/**
 * xecutr mark: a microchip die with a circuit-X trace inside it, plus the
 * geometric wordmark. Sharp corners, steel outline, cyan-white core.
 */
export default function Mark({ size = 30, withWordmark = true, className }) {
  return (
    <span className={cn("inline-flex select-none items-center gap-3", className)}>
      <svg width={size} height={size} viewBox="0 0 34 34" fill="none" aria-hidden="true">
        <rect x="0.75" y="0.75" width="32.5" height="32.5" rx="3" stroke="#b0c4de" strokeOpacity="0.45" />
        <rect x="4.5" y="4.5" width="25" height="25" rx="1.5" stroke="#e0f7ff" strokeOpacity="0.28" />
        {/* die pins */}
        <g stroke="#b0c4de" strokeOpacity="0.55" strokeWidth="1.4" strokeLinecap="square">
          <path d="M11 0.75V4.5M17 0.75V4.5M23 0.75V4.5M11 29.5v3.75M17 29.5v3.75M23 29.5v3.75" />
          <path d="M0.75 11H4.5M0.75 17H4.5M0.75 23H4.5M29.5 11h3.75M29.5 17h3.75M29.5 23h3.75" />
        </g>
        {/* circuit-X */}
        <path d="M11.5 11.2 L22.5 22.8 M22.5 11.2 L11.5 22.8" stroke="#e0f7ff" strokeWidth="2.1" strokeLinecap="square" />
        <circle cx="17" cy="17" r="1.6" fill="#0a0a0a" stroke="#e0f7ff" strokeWidth="1.1" />
      </svg>
      {withWordmark && (
        <span className="font-display text-[15px] font-bold uppercase leading-none tracking-[0.34em] text-white">
          xecutr
        </span>
      )}
    </span>
  );
}