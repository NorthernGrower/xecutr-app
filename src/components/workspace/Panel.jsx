import { cn } from "@/lib/utils";

/** A bordered obsidian surface with a faint circuit grid and edge glow. */
export default function Panel({ as: Tag = "div", className, children, glow = false, ...rest }) {
  return (
    <Tag
      className={cn(
        "relative rounded-sm border border-white/10 bg-card/80",
        glow && "glow-edge",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function PanelLabel({ children, className }) {
  return <span className={cn("label-mono", className)}>{children}</span>;
}