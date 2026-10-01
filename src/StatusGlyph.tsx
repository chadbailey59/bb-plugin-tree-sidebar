import type { PluginSidebarThreadIndicator } from "@bb/plugin-sdk";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * bb's own status vocabulary, drawn by this plugin.
 *
 * The SDK ships `indicator` as data and no component on purpose, so a replaced
 * sidebar can look how it likes. This one deliberately matches the built-in
 * list shape for shape: a user switching between the two should not have to
 * learn a second set of glyphs.
 *
 * An unrecognized indicator draws nothing — bb adds kinds over time, and a
 * sidebar built today must not break on one shipped tomorrow.
 */
export function StatusGlyph({
  indicator,
  label,
}: {
  indicator: PluginSidebarThreadIndicator;
  label: string | null;
}) {
  const shared = "size-3.5 shrink-0";
  const aria = label ?? undefined;

  switch (indicator) {
    case "unread-error":
      return (
        <Icon
          name="CircleX"
          aria-label={aria}
          className={cn(shared, "text-destructive")}
        />
      );
    case "waiting-for-input":
      return (
        <Icon
          name="CircleQuestion"
          aria-label={aria}
          className={cn(shared, "text-muted-foreground/75")}
        />
      );
    case "runtime":
      return (
        <Icon
          name="Loading"
          aria-label={aria}
          className={cn(shared, "animate-spin text-muted-foreground/50")}
        />
      );
    case "workflow":
      return <ShineIcon name="Workflow" label={aria} className={shared} />;
    case "background-agent":
      return <ShineIcon name="UserRoundPlus" label={aria} className={shared} />;
    case "background-command":
      return <ShineIcon name="Terminal" label={aria} className={shared} />;
    case "plan-mode":
      return <ShineIcon name="ListTodo" label={aria} className={shared} />;
    case "goal":
      return <ShineIcon name="Target" label={aria} className={shared} />;
    case "draft":
    case "working-draft":
      return (
        <Icon
          name="Edit"
          aria-label={aria}
          className={cn(shared, "text-muted-foreground")}
        />
      );
    case "unread-success":
      // The notification dot, centered in a box the size of every other glyph
      // so the trailing column stays a column.
      return (
        <span
          aria-label={aria}
          className={cn("flex items-center justify-center", shared)}
        >
          <span className="size-[5px] rounded-full bg-timeline-accent" />
        </span>
      );
    default:
      return null;
  }
}

function ShineIcon({
  name,
  label,
  className,
}: {
  name: "Workflow" | "UserRoundPlus" | "Terminal" | "ListTodo" | "Target";
  label: string | undefined;
  className: string;
}) {
  return (
    <Icon
      name={name}
      aria-label={label}
      className={cn("animate-shine-icon text-muted-foreground/50", className)}
    />
  );
}
