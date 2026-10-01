import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { copyPermalink } from "./copyPermalink";
import { threadPermalink } from "./permalink";

/**
 * This sidebar's right-click menu. The plugin API ships no menu component on
 * purpose, so a replaced list owns the surface. Every item is one call on
 * `experimental_useSidebarThreadActions`, and the destructive one is
 * `requestDelete`, which opens bb's confirmation rather than deleting a
 * subtree silently.
 */
export function RowContextMenu({
  thread,
  children,
}: {
  thread: PluginSidebarThread;
  children: ReactNode;
}) {
  const actions = useSidebarThreadActions();

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        {/* The marker keeps `threadMenu.ts` out: this menu shares bb's
            "Thread actions" label, and it already has its own Copy link. */}
        <ContextMenu.Content
          aria-label="Thread actions"
          data-tree-sidebar-row-menu=""
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Item onSelect={() => actions.open(thread.id, { split: true })}>
            Open in split
          </Item>
          {/* The origin, not a fixed one: whatever address bb is open at is
              the one a link has to carry, so a link copied over `bb connect`
              opens for whoever it is pasted to. */}
          <Item
            onSelect={() =>
              void copyPermalink(
                threadPermalink(window.location.origin, {
                  threadId: thread.id,
                  projectId: thread.projectId,
                }),
              )
            }
          >
            Copy link
          </Item>
          <Separator />
          <Item
            onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
          >
            {thread.isUnread ? "Mark read" : "Mark unread"}
          </Item>
          <Item
            onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
          >
            {thread.isPinned ? "Unpin" : "Pin"}
          </Item>
          <Separator />
          {/* Already archived, and the plugin actions have no unarchive to
              offer instead — that lives in bb's own archive view. */}
          {thread.isArchived ? null : (
            <Item onSelect={() => actions.archive(thread.id)}>Archive</Item>
          )}
          <Item destructive onSelect={() => actions.requestDelete(thread.id)}>
            Delete
          </Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function Item({
  children,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        destructive && "text-destructive-text",
      )}
    >
      {children}
    </ContextMenu.Item>
  );
}

function Separator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}
