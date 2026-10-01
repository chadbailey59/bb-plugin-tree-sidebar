import { useMemo } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  type PluginSidebarThread,
} from "@bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { RowContextMenu } from "./RowContextMenu";
import { StatusGlyph } from "./StatusGlyph";
import { threadDisplayTitle } from "./tree";
import { excerpt, splitHighlights, type Snippet } from "./snippet";
import { useSnippet } from "./useThreadSearch";
import {
  INDENT_STEP_PX,
  ROW_BASE_PADDING_PX,
  THREAD_LABEL_OFFSET_PX,
  TRAILING_SLOT_CLASS,
} from "./layout";

/**
 * One thread. The anchor carries both DOM attributes bb's thread shortcuts
 * look for — they find rows by query selector, not by React state, so
 * `thread.next`, `thread.previous`, and the numbered shortcuts stop working
 * without them.
 */
export function ThreadRow({
  thread,
  depth,
  isActive,
  onNavigate,
}: {
  thread: PluginSidebarThread;
  depth: number;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps } = useSidebarThreadSplit(thread.id);
  const title = threadDisplayTitle(thread);
  // Only set while a search matched something this thread said, rather than
  // its title — the title is already the row.
  const match = useSnippet(thread.id);
  const snippet = useMemo(() => (match ? excerpt(match) : null), [match]);
  const canArchive = !thread.isArchived;
  // The button floats at the row's right edge. A status glyph sits in that same
  // spot and holds width open there, so the button only lands on top of the
  // title when there is no glyph to sit behind.
  const coversTitle = canArchive && thread.indicator === "none";

  return (
    <RowContextMenu thread={thread}>
      {/* The row is the list item, not the anchor: the trailing controls sit
          beside the link rather than inside it, so the highlight covers them
          and a button is never nested in an anchor. */}
      <li
        className={cn(
          "group/row relative flex list-none items-center gap-1.5 rounded-md pr-2 text-xs",
          isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
        )}
      >
        <a
          {...splitProps}
          data-sidebar-thread-shortcut-target=""
          data-sidebar-thread-id={thread.id}
          href="#"
          aria-current={isActive ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
            onNavigate();
          }}
          style={{
            paddingLeft:
              ROW_BASE_PADDING_PX +
              depth * INDENT_STEP_PX +
              THREAD_LABEL_OFFSET_PX,
          }}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer flex-col justify-center",
            snippet === null ? "h-7" : "gap-0.5 py-1",
          )}
        >
          {/* No pin glyph: a pinned thread only ever renders in the Pinned
              section, whose header already says so. */}
          <span
            className={cn(
              "truncate",
              isActive || thread.isUnread
                ? "text-foreground"
                : "text-muted-foreground/80",
              "group-hover/row:text-foreground",
              // The archive button floats over this instead of taking width
              // from it, so a hovered title fades out under the button rather
              // than re-truncating and jittering as the pointer moves down a
              // list. A mask does that whatever the row is coloured. It has to
              // reach fully transparent BEFORE the button starts, or the text
              // shows through the icon instead of getting out of its way.
              coversTitle &&
                "group-hover/row:[mask-image:linear-gradient(to_right,black_calc(100%_-_2.25rem),transparent_calc(100%_-_1.25rem))]",
            )}
          >
            {title}
          </span>
          {snippet === null ? null : <SnippetLine snippet={snippet} />}
        </a>
        {/* An indicator that draws nothing takes no width either, or every
            resting row would hold a 14px gap open at its right edge. The button
            lands on this spot, so the two swap rather than stack. */}
        {thread.indicator === "none" ? null : (
          <span
            className={cn(
              TRAILING_SLOT_CLASS,
              canArchive && "group-hover/row:opacity-0",
            )}
          >
            <StatusGlyph
              indicator={thread.indicator}
              label={thread.indicatorLabel}
            />
          </span>
        )}
        {/* Archiving through the context menu is three gestures per thread, and
            clearing out a project is a job you do to a dozen at once. */}
        {canArchive ? (
          <button
            type="button"
            aria-label={`Archive ${title}`}
            title="Archive"
            onClick={() => actions.archive(thread.id)}
            className={cn(
              TRAILING_SLOT_CLASS,
              "absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100",
            )}
          >
            <Icon name="Archive" className="size-3.5" />
          </button>
        ) : null}
      </li>
    </RowContextMenu>
  );
}

/**
 * Why this row is in the results: the message the query was found in, with the
 * hits marked. One line, because the tree is a place to pick a thread, not to
 * read one.
 */
function SnippetLine({ snippet }: { snippet: Snippet }) {
  return (
    <span className="min-w-0 truncate text-2xs text-muted-foreground/60">
      {splitHighlights(snippet).map((part, index) =>
        part.isMatch ? (
          <mark
            // Parts are positional and the text is static for a given query,
            // so the index is the identity here.
            key={index}
            className="bg-transparent font-medium text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}
