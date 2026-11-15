/**
 * The xecutr X, alive: a slow twist and pulse used as the "executing" mark.
 * Motion is disabled under prefers-reduced-motion (see `.xecutr-x` in index.css).
 */
export default function AnimatedX({ size = 12, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`xecutr-x shrink-0 ${className}`}
    >
      <path d="M5 5 L19 19 M19 5 L5 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
  );
}
