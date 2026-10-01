import { useEffect, useMemo } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  useSettings,
  type PluginThreadListProps,
} from "@bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { ThreadRow } from "./ThreadRow";
import { useCollapsed } from "./useCollapsed";
import { useProjectPaths } from "./useProjectPaths";
import { useProjectSync } from "./useProjectSync";
import { INDENT_FLAG } from "./projectMenu";
import { depthsById, publishProjectDepths } from "./projectDepths";
import { projectRows } from "./tree";
import { SnippetProvider, useThreadSearch } from "./useThreadSearch";
import {
  INDENT_STEP_PX,
  ROW_BASE_PADDING_PX,
  TRAILING_SLOT_CLASS,
} from "./layout";
import {
  buildProjectTree,
  holdsThread,
  keysToThread,
  type ThreadNode,
  type TreeNode,
  type TreeSection,
} from "./tree";

/**
 * The sidebar list: threads nested under their projects, and projects placed
 * where they sit on disk.
 *
 * The host owns the New-thread button and the search field above this, so this
 * ships neither and filters on the `searchQuery` prop instead.
 */
export function ProjectTree({
  activeThreadId,
  onNavigate,
  searchQuery,
}: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const locations = useProjectPaths(projects);
  const collapsed = useCollapsed();
  const search = useThreadSearch(searchQuery);
  // Match the descriptor's own default while the values load, so the tree does
  // not show a column of empty projects and then take them away again.
  const { values } = useSettings();
  const hideEmptyProjects = values?.hideEmptyProjects !== false;
  const indentProjectNames = values?.indentProjectNames === true;

  // Where every project sits, from a tree built with no query and no threads —
  // never the one on screen. Searching or hiding empty projects changes which
  // rows render, and nothing outside the sidebar should follow that.
  const rows = useMemo(
    () => projectRows(buildProjectTree({ projects: locations, threads: [] })),
    [locations],
  );

  useProjectSync({
    order: values?.syncProjectOrder === true,
    rows,
    projects,
  });

  // The picker's content script reads this to know how far to indent each row.
  useEffect(() => {
    publishProjectDepths(depthsById(rows));
  }, [rows]);

  // The content script keys on this, so restyling bb's picker is part of the
  // option rather than a standing change to its chrome.
  useEffect(() => {
    const root = document.documentElement;
    if (!indentProjectNames) {
      root.removeAttribute(INDENT_FLAG);
      return;
    }
    root.setAttribute(INDENT_FLAG, "");
    return () => root.removeAttribute(INDENT_FLAG);
  }, [indentProjectNames]);

  const tree = useMemo(
    () =>
      buildProjectTree({
        projects: locations,
        threads,
        query: searchQuery,
        matchedThreadIds: search.matchedIds,
        archivedThreads: search.archivedThreads,
        hideEmptyProjects,
      }),
    [
      hideEmptyProjects,
      locations,
      search.archivedThreads,
      search.matchedIds,
      searchQuery,
      threads,
    ],
  );

  // Opening a thread from anywhere else — a shortcut, a link, a split — must
  // put its row on screen, even inside a branch that was folded shut.
  const { reveal } = collapsed;
  useEffect(() => {
    if (activeThreadId === null) return;
    if (holdsThread(tree.pinned, activeThreadId)) {
      reveal([PINNED_KEY]);
      return;
    }
    const trail = keysToThread(
      [...tree.roots, ...tree.unrooted],
      activeThreadId,
    );
    if (trail.length > 0) reveal(trail);
  }, [activeThreadId, reveal, tree]);

  const archivedCount =
    tree.archived.roots.length + tree.archived.unrooted.length;
  const isEmpty =
    tree.pinned.length + tree.roots.length + tree.unrooted.length ===
      0 && archivedCount === 0;
  // Everything left in the tree while filtering is a hit, so a branch that was
  // folded shut last week has no business hiding one.
  const isFiltering = searchQuery.trim().length > 0;

  return (
    <SnippetProvider value={search.snippets}>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {status === "loading" ? null : status === "error" ? (
          <Notice>Could not load threads.</Notice>
        ) : isEmpty ? (
          <Notice>{isFiltering ? "No threads found" : "No projects yet"}</Notice>
        ) : (
          <>
            {tree.pinned.length > 0 ? (
              <PinnedSection
                nodes={tree.pinned}
                collapsed={collapsed}
                forceOpen={isFiltering}
                activeThreadId={activeThreadId}
                onNavigate={onNavigate}
              />
            ) : null}
            {tree.roots.map((node) => (
              <Branch
                key={node.key}
                node={node}
                depth={0}
                activeThreadId={activeThreadId}
                collapsed={collapsed}
                forceOpen={isFiltering}
                onNavigate={onNavigate}
              />
            ))}
            {tree.unrooted.length > 0 ? (
              <div className="mt-1">
                {tree.unrooted.map((node) => (
                  <Branch
                    key={node.key}
                    node={node}
                    depth={0}
                    activeThreadId={activeThreadId}
                    collapsed={collapsed}
                    forceOpen={isFiltering}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            ) : null}
            {archivedCount > 0 ? (
              <ArchivedSection
                section={tree.archived}
                collapsed={collapsed}
                activeThreadId={activeThreadId}
                onNavigate={onNavigate}
              />
            ) : null}
          </>
        )}
      </div>
    </SnippetProvider>
  );
}

/**
 * The row that names a section and folds it.
 *
 * Pinned and Archived are the same row with a different glyph, so they share
 * one: a folded section shows how much is inside, an open one lets its rows
 * answer that better than a number can.
 */
function SectionHeader({
  icon,
  label,
  isOpen,
  onToggle,
  count,
}: {
  icon: "Pin" | "Archive";
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  count?: number;
}) {
  return (
    <div
      style={{ paddingLeft: ROW_BASE_PADDING_PX }}
      className="flex h-7 items-center gap-1 rounded-md pr-2 hover:bg-sidebar-accent/40"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
      >
        <Icon name={icon} className="size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/90">
          {label}
        </span>
        {!isOpen && count !== undefined ? (
          <span className="shrink-0 text-2xs tabular-nums text-muted-foreground/50">
            {count}
          </span>
        ) : null}
      </button>
    </div>
  );
}

/** Key for the pinned section's fold state; not a path, so it cannot collide. */
const PINNED_KEY = "pinned:section";

/**
 * Pinned threads, from every project at once, above the tree.
 *
 * A pin says "wherever this lives, keep it at hand", so these rows leave their
 * project behind and sit flat at the top — the point of pinning is not having
 * to remember which branch a thread is on.
 */
function PinnedSection({
  nodes,
  collapsed,
  forceOpen,
  activeThreadId,
  onNavigate,
}: {
  nodes: ThreadNode[];
  collapsed: ReturnType<typeof useCollapsed>;
  forceOpen: boolean;
  activeThreadId: string | null;
  onNavigate: () => void;
}) {
  const isOpen = forceOpen || !collapsed.isCollapsed(PINNED_KEY);

  return (
    <div className="mb-1">
      <SectionHeader
        icon="Pin"
        label="Pinned"
        isOpen={isOpen}
        onToggle={() => collapsed.toggle(PINNED_KEY)}
        count={nodes.length}
      />
      {isOpen ? (
        <ul className="flex flex-col gap-px">
          {nodes.map((node) => (
            <ThreadBranch
              key={node.thread.id}
              node={node}
              depth={0}
              activeThreadId={activeThreadId}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Key for the archived section's fold state; not a path, so it cannot collide. */
const ARCHIVED_KEY = "archived:section";

/**
 * Archived threads the search matched, in a tree of their own below the live
 * one.
 *
 * They keep the same shape — same directories, same projects, same nesting —
 * because an archived thread is still the thread it was; it is just not one of
 * the threads you are working on. The section exists only while searching, so
 * it starts open and folds if you want it out of the way.
 */
function ArchivedSection({
  section,
  collapsed,
  activeThreadId,
  onNavigate,
}: {
  section: TreeSection;
  collapsed: ReturnType<typeof useCollapsed>;
  activeThreadId: string | null;
  onNavigate: () => void;
}) {
  const isOpen = !collapsed.isCollapsed(ARCHIVED_KEY);

  return (
    <div className="mt-1 border-t border-border/50 pt-1">
      <SectionHeader
        icon="Archive"
        label="Archived"
        isOpen={isOpen}
        onToggle={() => collapsed.toggle(ARCHIVED_KEY)}
      />
      {isOpen
        ? [...section.roots, ...section.unrooted].map((node) => (
            <Branch
              key={node.key}
              node={node}
              depth={0}
              activeThreadId={activeThreadId}
              collapsed={collapsed}
              // Every row under here is a search hit; nothing may hide one.
              forceOpen
              onNavigate={onNavigate}
            />
          ))
        : null}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="px-2 py-6 text-center text-xs text-muted-foreground"
    >
      {children}
    </p>
  );
}

function Branch({
  node,
  depth,
  activeThreadId,
  collapsed,
  forceOpen,
  onNavigate,
}: {
  node: TreeNode;
  depth: number;
  activeThreadId: string | null;
  collapsed: ReturnType<typeof useCollapsed>;
  forceOpen: boolean;
  onNavigate: () => void;
}) {
  const actions = useSidebarThreadActions();
  const hasContent = node.children.length > 0 || node.threads.length > 0;
  const isOpen = hasContent && (forceOpen || !collapsed.isCollapsed(node.key));
  const isProject = node.project !== null;

  return (
    <div>
      <div
        style={{ paddingLeft: ROW_BASE_PADDING_PX + depth * INDENT_STEP_PX }}
        className="group/branch flex h-7 items-center gap-1 rounded-md pr-2 hover:bg-sidebar-accent/40"
      >
        <button
          type="button"
          onClick={() => collapsed.toggle(node.key)}
          disabled={!hasContent}
          aria-expanded={hasContent ? isOpen : undefined}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left disabled:cursor-default"
        >
          {/* The folder is the only open/closed indicator: open means open,
              and a project keeps its git badge while it is shut. */}
          <Icon
            name={isOpen ? "FolderOpen" : isProject ? "FolderGit" : "Folder"}
            className={cn(
              "size-3.5 shrink-0",
              isProject ? "text-muted-foreground" : "text-muted-foreground/50",
            )}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs",
              isProject
                ? "font-medium text-foreground/90"
                : "text-muted-foreground/70",
            )}
          >
            {node.label}
          </span>
          {/* The count answers "is anything in there" for a folded branch;
              open, the rows answer it better than a number can. */}
          {!isOpen && node.threadCount > 0 ? (
            <span className="shrink-0 text-2xs tabular-nums text-muted-foreground/50">
              {node.threadCount}
            </span>
          ) : null}
        </button>
        {node.project !== null ? (
          <button
            type="button"
            aria-label={`New thread in ${node.project.name}`}
            title={`New thread in ${node.project.name}`}
            onClick={() => {
              if (node.project === null) return;
              actions.openNewThread({
                projectId: node.project.id,
                focusPrompt: true,
              });
              onNavigate();
            }}
            className={cn(
              TRAILING_SLOT_CLASS,
              "cursor-pointer rounded text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover/branch:opacity-100",
            )}
          >
            <Icon name="Plus" className="size-3.5" />
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <>
          {/* A node's own threads come before its subfolders, so a folder that
              is also a project keeps its threads right under its name instead
              of below every nested branch. */}
          {node.threads.length > 0 ? (
            <ul className="flex flex-col gap-px">
              {node.threads.map((threadNode) => (
                <ThreadBranch
                  key={threadNode.thread.id}
                  node={threadNode}
                  depth={depth + 1}
                  activeThreadId={activeThreadId}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          ) : null}
          {node.children.map((child) => (
            <Branch
              key={child.key}
              node={child}
              depth={depth + 1}
              activeThreadId={activeThreadId}
              collapsed={collapsed}
              forceOpen={forceOpen}
              onNavigate={onNavigate}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

/** A thread and the forks and side chats under it, at the same indent rules. */
function ThreadBranch({
  node,
  depth,
  activeThreadId,
  onNavigate,
}: {
  node: ThreadNode;
  depth: number;
  activeThreadId: string | null;
  onNavigate: () => void;
}) {
  return (
    <>
      <ThreadRow
        thread={node.thread}
        depth={depth}
        isActive={node.thread.id === activeThreadId}
        onNavigate={onNavigate}
      />
      {node.children.map((child) => (
        <ThreadBranch
          key={child.thread.id}
          node={child}
          depth={depth + 1}
          activeThreadId={activeThreadId}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}
