import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@bb/plugin-sdk";
import type { ProjectTree } from "./tree";
import {
  buildProjectTree,
  keysToThread,
  nestThreads,
  projectRows,
} from "./tree";

function thread(
  id: string,
  projectId: string,
  overrides: Partial<PluginSidebarThread> = {},
): PluginSidebarThread {
  return {
    id,
    projectId,
    title: id,
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "claude-code",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 1,
    updatedAt: 1,
    lastReadAt: null,
    latestAttentionAt: 1,
    ...overrides,
  };
}

const PROJECTS = [
  { id: "p_bb", name: "bb", path: "/home/user/Code/bb" },
  { id: "p_widgets", name: "widgets", path: "/home/user/Code/widgets" },
  { id: "p_juniper", name: "Juniper", path: "/home/user/Projects/Juniper" },
  { id: "p_atlas", name: "Atlas", path: "/home/user/Projects/Atlas" },
  { id: "p_support", name: "Support", path: "/home/user/Support" },
  {
    id: "p_acme",
    name: "Acme",
    path: "/home/user/Support/Acme",
  },
  {
    id: "p_july",
    name: "2026-07",
    path: "/home/user/Support/Acme/2026-07",
  },
];

describe("buildProjectTree", () => {
  it("drops the prefix every project shares and roots at the real folders", () => {
    const tree = buildProjectTree({ projects: PROJECTS, threads: [] });
    expect(tree.roots.map((node) => node.label)).toEqual([
      "Code",
      "Projects",
      "Support",
    ]);
  });

  it("nests a project that lives inside another project's directory", () => {
    const tree = buildProjectTree({ projects: PROJECTS, threads: [] });
    const support = tree.roots.find((node) => node.label === "Support");
    // ~/Support is itself a project AND the parent of Acme.
    expect(support?.project?.id).toBe("p_support");
    const acme = support?.children.find(
      (node) => node.label === "Acme",
    );
    expect(acme?.project?.id).toBe("p_acme");
    expect(acme?.children.map((node) => node.project?.id)).toEqual([
      "p_july",
    ]);
  });

  it("merges a directory that only leads somewhere else into one row", () => {
    const tree = buildProjectTree({
      projects: [
        { id: "p_a", name: "a", path: "/home/user/Code/vendor/deep/a" },
        { id: "p_b", name: "b", path: "/home/user/Projects/b" },
      ],
      threads: [],
    });
    const code = tree.roots.find((node) => node.label.startsWith("Code"));
    expect(code?.label).toBe("Code/vendor/deep/a");
    expect(code?.project?.id).toBe("p_a");
  });

  it("counts threads at every level above them", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [
        thread("t1", "p_july"),
        thread("t2", "p_acme"),
        thread("t3", "p_bb"),
      ],
    });
    const support = tree.roots.find((node) => node.label === "Support");
    expect(support?.threadCount).toBe(2);
    expect(support?.threads).toHaveLength(0);
  });

  it("leaves archived threads out", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [thread("t1", "p_bb", { isArchived: true })],
    });
    const code = tree.roots.find((node) => node.label === "Code");
    expect(code?.threadCount).toBe(0);
  });

  it("puts a project with no path in its own group", () => {
    const tree = buildProjectTree({
      projects: [
        ...PROJECTS,
        { id: "p_personal", name: "Personal", path: null },
      ],
      threads: [thread("t1", "p_personal")],
    });
    expect(tree.unrooted.map((node) => node.project?.id)).toEqual([
      "p_personal",
    ]);
    expect(tree.roots.some((node) => node.label === "Personal")).toBe(false);
  });

  it("lifts pinned threads out of the tree into their own section", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [
        thread("t1", "p_bb", { isPinned: true, latestAttentionAt: 1 }),
        thread("t2", "p_juniper", { isPinned: true, latestAttentionAt: 9 }),
        thread("t3", "p_bb"),
      ],
    });
    // Most recent attention first, whichever project it came from.
    expect(tree.pinned.map((node) => node.thread.id)).toEqual(["t2", "t1"]);
    const bb = tree.roots
      .find((node) => node.label === "Code")
      ?.children.find((node) => node.project?.id === "p_bb");
    expect(bb?.threads.map((node) => node.thread.id)).toEqual(["t3"]);
    expect(bb?.threadCount).toBe(1);
  });

  it("nests a pinned fork under its pinned parent", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [
        thread("parent", "p_bb", { isPinned: true }),
        thread("fork", "p_bb", { isPinned: true, parentThreadId: "parent" }),
      ],
    });
    expect(tree.pinned.map((node) => node.thread.id)).toEqual(["parent"]);
    expect(tree.pinned[0]?.children.map((node) => node.thread.id)).toEqual([
      "fork",
    ]);
  });

  it("keeps a pinned fork whose parent stayed in the tree", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [
        thread("parent", "p_bb"),
        thread("fork", "p_bb", { isPinned: true, parentThreadId: "parent" }),
      ],
    });
    expect(tree.pinned.map((node) => node.thread.id)).toEqual(["fork"]);
  });

  it("filters the pinned section too, and keeps the tree branch out of it", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [
        thread("t1", "p_bb", { title: "flaky test", isPinned: true }),
        thread("t2", "p_bb", { title: "write docs", isPinned: true }),
      ],
      query: "flaky",
    });
    expect(tree.pinned.map((node) => node.thread.id)).toEqual(["t1"]);
    // Every match was pinned, so the tree itself has nothing left to show.
    expect(tree.roots).toEqual([]);
  });

  it("keeps only matching threads while searching, and prunes empty branches", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [
        thread("t1", "p_bb", { title: "fix the flaky test" }),
        thread("t2", "p_bb", { title: "write docs" }),
        thread("t3", "p_juniper", { title: "unrelated" }),
      ],
      query: "flaky",
    });
    // Narrowed to one project, the folders above it no longer distinguish
    // anything, so they collapse away with the rest of the prefix.
    expect(tree.roots.map((node) => node.label)).toEqual(["bb"]);
    expect(tree.roots[0]?.threads.map((node) => node.thread.id)).toEqual(["t1"]);
  });

  it("keeps a thread the server matched on its messages, not its title", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [
        thread("t1", "p_bb", { title: "write docs" }),
        thread("t2", "p_bb", { title: "unrelated" }),
      ],
      query: "tear out",
      matchedThreadIds: new Set(["t1"]),
    });
    expect(tree.roots[0]?.threads.map((node) => node.thread.id)).toEqual(["t1"]);
  });

  it("keeps title matches while the server search has not answered", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [thread("t1", "p_bb", { title: "tear out the sidebar" })],
      query: "tear out",
      matchedThreadIds: null,
    });
    expect(tree.roots[0]?.threads.map((node) => node.thread.id)).toEqual(["t1"]);
  });

  it("keeps every project when not asked to hide the empty ones", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [thread("t1", "p_bb")],
    });
    // An empty project is somewhere to start a thread, so it earns its row:
    // every branch survives even though only p_bb holds anything.
    expect(tree.roots.map((node) => node.label)).toEqual([
      "Code",
      "Projects",
      "Support",
    ]);
  });

  it("hides a project with no threads when asked", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [thread("t1", "p_bb")],
      hideEmptyProjects: true,
    });
    expect(tree.roots.map((node) => node.label)).toEqual(["bb"]);
  });

  it("keeps a project whose only thread is pinned", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [thread("t1", "p_bb", { isPinned: true })],
      hideEmptyProjects: true,
    });
    // The thread renders in the pinned section, so the project's own row holds
    // nothing — but the project is not empty, and dropping it would leave that
    // thread's project unreachable in the tree.
    expect(tree.pinned.map((node) => node.thread.id)).toEqual(["t1"]);
    expect(tree.roots.map((node) => node.label)).toEqual(["bb"]);
    expect(tree.roots[0]?.threads).toEqual([]);
  });

  it("hides an empty unrooted project too", () => {
    const tree = buildProjectTree({
      projects: [
        ...PROJECTS,
        { id: "p_personal", name: "Personal", path: null },
      ],
      threads: [thread("t1", "p_bb")],
      hideEmptyProjects: true,
    });
    expect(tree.unrooted).toEqual([]);
  });

  it("puts archived matches in their own tree, shaped like the live one", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [thread("live", "p_bb", { title: "tear out the sidebar" })],
      query: "tear out",
      matchedThreadIds: new Set(["live"]),
      archivedThreads: [
        thread("old", "p_bb", { isArchived: true }),
        thread("older", "p_juniper", { isArchived: true }),
      ],
    });
    expect(tree.roots[0]?.threads.map((node) => node.thread.id)).toEqual([
      "live",
    ]);
    // Prefix drop and chain collapse run over the archived tree on their own,
    // so it is shaped by what is in it rather than by the live tree.
    expect(tree.archived.roots.map((node) => node.label)).toEqual([
      "Code/bb",
      "Projects/Juniper",
    ]);
    expect(tree.archived.roots[0]?.threads.map((node) => node.thread.id)).toEqual(
      ["old"],
    );
  });

  it("nests an archived fork under its archived parent", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [],
      query: "tear out",
      archivedThreads: [
        thread("parent", "p_bb", { isArchived: true }),
        thread("fork", "p_bb", { isArchived: true, parentThreadId: "parent" }),
      ],
    });
    const node = tree.archived.roots[0]?.threads[0];
    expect(node?.thread.id).toBe("parent");
    expect(node?.children.map((child) => child.thread.id)).toEqual(["fork"]);
  });

  it("keys the archived tree apart from the live one", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [thread("live", "p_bb")],
      query: "bb",
      archivedThreads: [thread("old", "p_bb", { isArchived: true })],
    });
    // Same directory, same project, two trees: shared keys would make folding
    // one branch fold the other.
    expect(tree.archived.roots[0]?.key).not.toBe(tree.roots[0]?.key);
  });

  it("has no archived tree when nothing is archived", () => {
    const tree = buildProjectTree({ projects: PROJECTS, threads: [] });
    expect(tree.archived).toEqual({ roots: [], unrooted: [] });
  });

  it("shows every thread of a project whose name matches the search", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [
        thread("t1", "p_juniper", { title: "one" }),
        thread("t2", "p_juniper", { title: "two" }),
      ],
      query: "juniper",
    });
    const juniper = tree.roots[0];
    expect(juniper?.threads).toHaveLength(2);
  });
});

/** Project ids in row order, which is what the order assertions care about. */
function projectIds(tree: ProjectTree): string[] {
  return projectRows(tree).map((row) => row.id);
}

describe("projectRows", () => {
  it("reads the projects off in the order their rows appear", () => {
    const order = projectIds(
      buildProjectTree({ projects: PROJECTS, threads: [] }),
    );
    // Directory order, and a project directory before the projects inside it:
    // ~/Support holds Acme, which holds 2026-07.
    expect(order).toEqual([
      "p_bb",
      "p_widgets",
      "p_atlas",
      "p_juniper",
      "p_support",
      "p_acme",
      "p_july",
    ]);
  });

  it("puts pathless projects last, where their group renders", () => {
    const order = projectIds(
      buildProjectTree({
        projects: [
          { id: "p_personal", name: "Personal", path: null },
          { id: "p_bb", name: "bb", path: "/home/user/Code/bb" },
        ],
        threads: [],
      }),
    );
    expect(order).toEqual(["p_bb", "p_personal"]);
  });

  it("reports the depth each project's row renders at", () => {
    const rows = projectRows(
      buildProjectTree({ projects: PROJECTS, threads: [] }),
    );
    const depths = Object.fromEntries(rows.map((row) => [row.id, row.depth]));
    // ~/Support is a root; Acme is inside it; 2026-07 inside that.
    expect(depths.p_support).toBe(0);
    expect(depths.p_acme).toBe(1);
    expect(depths.p_july).toBe(2);
    // Code/bb is one collapsed row, so bb sits at the root's own depth.
    expect(depths.p_bb).toBe(1);
  });

  it("counts a collapsed chain as the one row it renders as", () => {
    const rows = projectRows(
      buildProjectTree({
        projects: [
          { id: "p_a", name: "a", path: "/home/user/Code/vendor/deep/a" },
          { id: "p_b", name: "b", path: "/home/user/Projects/b" },
        ],
        threads: [],
      }),
    );
    // "Code/vendor/deep/a" is four directories drawn as one row, so its project
    // is indented once, not four times.
    expect(rows).toEqual([
      { id: "p_a", depth: 0 },
      { id: "p_b", depth: 0 },
    ]);
  });

  it("is unaffected by which threads exist", () => {
    const withThreads = projectIds(
      buildProjectTree({
        projects: PROJECTS,
        threads: [thread("t1", "p_july")],
      }),
    );
    const without = projectIds(
      buildProjectTree({ projects: PROJECTS, threads: [] }),
    );
    expect(withThreads).toEqual(without);
  });
});

describe("nestThreads", () => {
  it("nests children under their parent and sorts pinned first", () => {
    const nodes = nestThreads([
      thread("parent", "p", { latestAttentionAt: 5 }),
      thread("child", "p", { parentThreadId: "parent", latestAttentionAt: 9 }),
      thread("pinned", "p", { isPinned: true, latestAttentionAt: 1 }),
    ]);
    expect(nodes.map((node) => node.thread.id)).toEqual(["pinned", "parent"]);
    expect(nodes[1]?.children.map((node) => node.thread.id)).toEqual(["child"]);
  });

  it("keeps an orphan visible when its parent is not in the list", () => {
    const nodes = nestThreads([
      thread("child", "p", { parentThreadId: "missing" }),
    ]);
    expect(nodes.map((node) => node.thread.id)).toEqual(["child"]);
  });

  it("still shows every thread of a parent cycle", () => {
    const nodes = nestThreads([
      thread("a", "p", { parentThreadId: "b" }),
      thread("b", "p", { parentThreadId: "a" }),
    ]);
    // Neither is a root by the normal rule, so both are promoted rather than
    // vanishing — and the walk terminates.
    const ids = new Set<string>();
    const collect = (list: typeof nodes): void => {
      for (const node of list) {
        ids.add(node.thread.id);
        collect(node.children);
      }
    };
    collect(nodes);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});

describe("keysToThread", () => {
  it("returns the whole trail so a folded branch can be opened", () => {
    const tree = buildProjectTree({
      projects: PROJECTS,
      threads: [thread("t1", "p_july")],
    });
    const trail = keysToThread(tree.roots, "t1");
    expect(trail).toEqual([
      "/home/user/Support",
      "/home/user/Support/Acme",
      "/home/user/Support/Acme/2026-07",
    ]);
  });

  it("is empty for a thread that is not on the tree", () => {
    const tree = buildProjectTree({ projects: PROJECTS, threads: [] });
    expect(keysToThread(tree.roots, "nope")).toEqual([]);
  });
});
