// The shape of the sidebar: projects placed where they sit on disk.
//
// bb knows each project's workspace path, so a set of projects under
// ~/Code, ~/Projects, and ~/Support already forms a tree. This module turns
// those paths plus the live thread list into that tree. It is deliberately
// pure — no React, no SDK calls — so the layout rules are testable on their
// own.
import type { PluginSidebarThread } from "@bb/plugin-sdk";

/** A project and where its default workspace lives. */
export interface ProjectLocation {
  id: string;
  name: string;
  /** Absolute path of the default source; null for a project with none. */
  path: string | null;
}

/** One thread, with the threads forked or side-chatted under it. */
export interface ThreadNode {
  thread: PluginSidebarThread;
  children: ThreadNode[];
}

/**
 * One row's worth of tree. A node is a directory, a project, or both — a
 * project directory holding another project (~/Support/Acme and
 * ~/Support/Acme/2026-07) carries threads AND child nodes.
 */
export interface TreeNode {
  /** Stable across renders and reloads; the expansion state is keyed on it. */
  key: string;
  label: string;
  project: { id: string; name: string } | null;
  children: TreeNode[];
  threads: ThreadNode[];
  /** Threads at this node and everywhere below it. */
  threadCount: number;
}

export function threadDisplayTitle(thread: PluginSidebarThread): string {
  const title = thread.title?.trim();
  if (title) return title;
  const fallback = thread.titleFallback?.trim();
  return fallback ? fallback : "Untitled thread";
}

interface MutableNode {
  key: string;
  label: string;
  project: { id: string; name: string } | null;
  children: Map<string, MutableNode>;
  threads: PluginSidebarThread[];
}

function emptyNode(key: string, label: string): MutableNode {
  return { key, label, project: null, children: new Map(), threads: [] };
}

/** Path segments, tolerant of trailing slashes and Windows-style separators. */
export function pathSegments(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

/**
 * Pinned first, then most recent attention. Ties break on id so the order is
 * total and does not flicker between renders.
 */
function sortThreads(threads: PluginSidebarThread[]): PluginSidebarThread[] {
  return [...threads].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    return (
      right.latestAttentionAt - left.latestAttentionAt ||
      left.id.localeCompare(right.id)
    );
  });
}

/**
 * Nest each thread under its parent when both are in the same project, so a
 * fork or side chat reads as what it is. A thread whose parent is somewhere
 * else — another project, archived, filtered out — stays at the top level
 * rather than disappearing with it.
 */
export function nestThreads(threads: PluginSidebarThread[]): ThreadNode[] {
  const present = new Set(threads.map((thread) => thread.id));
  const childrenOf = new Map<string, PluginSidebarThread[]>();
  const roots: PluginSidebarThread[] = [];
  for (const thread of threads) {
    const parentId = thread.parentThreadId;
    if (parentId !== null && present.has(parentId) && parentId !== thread.id) {
      const siblings = childrenOf.get(parentId);
      if (siblings) siblings.push(thread);
      else childrenOf.set(parentId, [thread]);
    } else {
      roots.push(thread);
    }
  }
  // A parent cycle would otherwise recurse forever, and every thread in one
  // would be a child of something and so appear nowhere. bb should never
  // produce one, but a sidebar must not be the thing that hangs or hides work
  // if it does: anything left over is promoted to a root.
  const placed = new Set<string>();
  const build = (thread: PluginSidebarThread): ThreadNode => {
    placed.add(thread.id);
    const children = (childrenOf.get(thread.id) ?? []).filter(
      (child) => !placed.has(child.id),
    );
    return { thread, children: sortThreads(children).map(build) };
  };
  const nodes = sortThreads(roots).map(build);
  const stranded = threads.filter((thread) => !placed.has(thread.id));
  return [...nodes, ...sortThreads(stranded).map(build)];
}

export interface BuildTreeArgs {
  projects: readonly ProjectLocation[];
  threads: readonly PluginSidebarThread[];
  /** The host's search box text; "" when it is closed. */
  query?: string;
  /**
   * Thread ids the server's full-text search matched. bb searches message
   * bodies, which a title filter cannot reach, so a thread counts as matching
   * when its title matches OR it is in here. Null means the search has not
   * answered yet and titles are all there is to go on.
   */
  matchedThreadIds?: ReadonlySet<string> | null;
  /**
   * Archived threads the server's search matched, whole rows rather than ids
   * because the sidebar's live list does not carry them. They are matches by
   * construction, so they are not filtered again here.
   */
  archivedThreads?: readonly PluginSidebarThread[];
  /**
   * Drop projects that hold no threads at all. A pinned thread still counts as
   * one: it sits in the section above rather than in the tree, but the project
   * it belongs to is not empty and hiding it would put that thread's project
   * out of reach.
   */
  hideEmptyProjects?: boolean;
}

/** One tree: directory roots, plus the projects that have no path to sit on. */
export interface TreeSection {
  /** Directory roots — ~/Code, ~/Projects, ~/Support and the like. */
  roots: TreeNode[];
  /** Projects with no workspace path of their own, e.g. the personal one. */
  unrooted: TreeNode[];
}

export interface ProjectTree extends TreeSection {
  /** Pinned threads from every project, lifted out into their own section. */
  pinned: ThreadNode[];
  /**
   * Archived matches, in a tree of their own. Empty unless a search is running:
   * archived threads are not in the sidebar's live list, so they only exist
   * here when the server's search returned some.
   */
  archived: TreeSection;
}

/**
 * Build the tree.
 *
 * Two rules keep it shallow. The shared prefix every project happens to have
 * (`/home/user`) is dropped, because a column of chevrons leading to the one
 * place everything lives is pure overhead. Below that, a directory with a
 * single child and no project of its own merges into that child, so an empty
 * link in the chain shows as `Code/vendor` on one row instead of two.
 */
export function buildProjectTree({
  projects,
  threads,
  query = "",
  matchedThreadIds = null,
  archivedThreads = [],
  hideEmptyProjects = false,
}: BuildTreeArgs): ProjectTree {
  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0;
  const matchesQuery = (text: string): boolean =>
    text.toLowerCase().includes(normalizedQuery);

  const live = buildSection({
    projects,
    threads: threads.filter((thread) => !thread.isArchived),
    // A project whose name matches shows all of its threads; otherwise only
    // the threads that match themselves. Searching for a project should not
    // make you guess which of its threads happens to repeat its name.
    keeps: (project) =>
      !isFiltering || matchesQuery(project.name)
        ? null
        : (thread) =>
            matchesQuery(threadDisplayTitle(thread)) ||
            matchedThreadIds?.has(thread.id) === true,
    dropsEmptyProjects: isFiltering,
    dropsThreadlessProjects: hideEmptyProjects,
    liftsPinned: true,
    keyPrefix: "",
  });

  // Every archived thread here came back from the search, so there is nothing
  // left to filter — but a project with none of them is not a branch.
  const archived = buildSection({
    projects,
    threads: archivedThreads,
    keeps: () => null,
    dropsEmptyProjects: true,
    dropsThreadlessProjects: true,
    liftsPinned: false,
    keyPrefix: "archived:",
  });

  return {
    // A pinned fork keeps its pinned parent; one whose parent stayed behind in
    // the tree becomes a root of this section rather than vanishing with it.
    pinned: nestThreads(live.pinned),
    roots: live.roots,
    unrooted: live.unrooted,
    archived: { roots: archived.roots, unrooted: archived.unrooted },
  };
}

interface SectionArgs {
  projects: readonly ProjectLocation[];
  threads: readonly PluginSidebarThread[];
  /**
   * The filter for one project's threads, or null to keep all of them. Called
   * once per project so a project-level rule can waive the thread-level one.
   */
  keeps: (
    project: ProjectLocation,
  ) => ((thread: PluginSidebarThread) => boolean) | null;
  /** Whether a project that contributes no thread should leave the tree. */
  dropsEmptyProjects: boolean;
  /** Whether a project that holds no threads at all should leave the tree. */
  dropsThreadlessProjects: boolean;
  /** Whether pinned threads leave the tree for the section above it. */
  liftsPinned: boolean;
  /**
   * Keeps two sections' node keys apart. Both trees are built from the same
   * paths, so without it folding a directory in one would fold it in the other.
   */
  keyPrefix: string;
}

/** One tree of projects, and the pinned threads lifted out of it. */
function buildSection({
  projects,
  threads,
  keeps,
  dropsEmptyProjects,
  dropsThreadlessProjects,
  liftsPinned,
  keyPrefix,
}: SectionArgs): TreeSection & { pinned: PluginSidebarThread[] } {
  const threadsByProject = new Map<string, PluginSidebarThread[]>();
  for (const thread of threads) {
    const bucket = threadsByProject.get(thread.projectId);
    if (bucket) bucket.push(thread);
    else threadsByProject.set(thread.projectId, [thread]);
  }

  const root = emptyNode(keyPrefix, "");
  const unrooted: MutableNode[] = [];
  const pinned: PluginSidebarThread[] = [];

  for (const project of [...projects].sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const owned = threadsByProject.get(project.id) ?? [];
    // Nothing in it at all is a different question from nothing left after
    // filtering, and it is asked first: a project with no threads is clutter
    // whatever the query is.
    if (dropsThreadlessProjects && owned.length === 0) continue;

    const filter = keeps(project);
    const visible = filter === null ? owned : owned.filter(filter);

    // A pinned thread is one you want at hand wherever it lives, so it leaves
    // the tree for the section above it rather than showing in both places.
    const kept: PluginSidebarThread[] = [];
    for (const thread of visible) {
      if (liftsPinned && thread.isPinned) pinned.push(thread);
      else kept.push(thread);
    }

    // Filtering, a project that contributes nothing to the tree is not a branch
    // worth keeping; unfiltered, an empty project still belongs on it so it can
    // be a place to start a thread.
    if (dropsEmptyProjects && kept.length === 0) continue;

    if (project.path === null) {
      const node = emptyNode(`${keyPrefix}project:${project.id}`, project.name);
      node.project = { id: project.id, name: project.name };
      node.threads = kept;
      unrooted.push(node);
      continue;
    }

    let cursor = root;
    let prefix = keyPrefix;
    for (const segment of pathSegments(project.path)) {
      prefix = `${prefix}/${segment}`;
      const existing = cursor.children.get(segment);
      if (existing) {
        cursor = existing;
      } else {
        const created = emptyNode(prefix, segment);
        cursor.children.set(segment, created);
        cursor = created;
      }
    }
    // Two projects on one path: last one wins the node, which is as good an
    // answer as any for a configuration that should not exist.
    cursor.project = { id: project.id, name: project.name };
    cursor.threads = kept;
  }

  let pruned = root;
  while (
    pruned.children.size === 1 &&
    pruned.project === null &&
    pruned.threads.length === 0
  ) {
    const [only] = [...pruned.children.values()];
    if (only === undefined) break;
    pruned = only;
  }

  const roots =
    pruned.project === null && pruned.threads.length === 0
      ? [...pruned.children.values()].map(finalize)
      : [finalize(pruned)];

  return {
    pinned,
    roots: roots.sort(compareNodes),
    unrooted: unrooted.map(finalize).sort(compareNodes),
  };
}

function compareNodes(left: TreeNode, right: TreeNode): number {
  return left.label.localeCompare(right.label, undefined, { numeric: true });
}

/** Collapse empty links, then freeze the node into its rendered shape. */
function finalize(node: MutableNode): TreeNode {
  let collapsed = node;
  let label = node.label;
  while (
    collapsed.project === null &&
    collapsed.threads.length === 0 &&
    collapsed.children.size === 1
  ) {
    const [only] = [...collapsed.children.values()];
    if (only === undefined) break;
    label = `${label}/${only.label}`;
    collapsed = only;
  }

  const children = [...collapsed.children.values()]
    .map(finalize)
    .sort(compareNodes);
  const threads = nestThreads(collapsed.threads);
  return {
    // The key follows the deepest segment, so collapsing or un-collapsing a
    // chain (a sibling project appearing mid-chain) does not reset the
    // expansion state of everything below it.
    key: collapsed.key,
    label,
    project: collapsed.project,
    children,
    threads,
    threadCount:
      collapsed.threads.length +
      children.reduce((total, child) => total + child.threadCount, 0),
  };
}

/** A project's place in the tree: where its row is, and how far it is indented. */
export interface ProjectRow {
  id: string;
  /** Rendered depth, so a collapsed chain of directories counts as one row. */
  depth: number;
}

/**
 * Every project in the tree, in the order its rows appear.
 *
 * A node's own project comes before the projects below it, because that is
 * where its row sits. Reading this off the built tree rather than re-deriving
 * it from paths means there is one traversal to keep right.
 */
export function projectRows(tree: ProjectTree): ProjectRow[] {
  const rows: ProjectRow[] = [];
  const walk = (node: TreeNode, depth: number): void => {
    if (node.project !== null) rows.push({ id: node.project.id, depth });
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const node of tree.roots) walk(node, 0);
  for (const node of tree.unrooted) walk(node, 0);
  return rows;
}


/** Whether `threadId` is anywhere in these threads or their children. */
export function holdsThread(
  nodes: readonly ThreadNode[],
  threadId: string,
): boolean {
  return nodes.some(
    (node) =>
      node.thread.id === threadId || holdsThread(node.children, threadId),
  );
}

/** Every node key on the path to `threadId`, for revealing the active row. */
export function keysToThread(
  roots: readonly TreeNode[],
  threadId: string,
): string[] {
  const walk = (node: TreeNode, trail: string[]): string[] | null => {
    const nextTrail = [...trail, node.key];
    if (holdsThread(node.threads, threadId)) return nextTrail;
    for (const child of node.children) {
      const found = walk(child, nextTrail);
      if (found) return found;
    }
    return null;
  };

  for (const root of roots) {
    const found = walk(root, []);
    if (found) return found;
  }
  return [];
}
