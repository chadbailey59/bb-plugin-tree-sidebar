import { useEffect, useMemo, useRef } from "react";
import { useRpc, type PluginSidebarProject } from "@bb/plugin-sdk/app";
// Type-only, so the backend and @bb/plugin-sdk never reach the app bundle.
import type { treeSidebarRpcContract } from "./server";
import { isIndented } from "./names";
import type { ProjectRow } from "./tree";

/** Long enough that a burst of project updates is one write, not five. */
const SETTLE_MS = 500;

/**
 * Push the tree's shape into the two things about a project that bb owns.
 *
 * bb's new-thread picker renders projects in bb's own manual order, and nothing
 * about that order follows a sidebar. `order` writes the sort key so the two
 * match; it is off by default, because that order is the user's to set by
 * dragging. Indentation is no longer done here at all — `projectMenu.ts` styles
 * the picker's rows instead of renaming anything — so what remains is one
 * cleanup pass for names an earlier version padded.
 *
 * `rows` comes from a tree built with no query and no threads, never the one on
 * screen: searching or hiding empty projects changes which rows render, and
 * neither should reorder anything. Because the tree sorts by path and name
 * rather than by sort key, the write cannot feed back into the order it came
 * from.
 */
export function useProjectSync({
  order,
  rows,
  projects,
}: {
  order: boolean;
  /** Every project and its depth, in the order the tree's rows appear. */
  rows: readonly ProjectRow[];
  projects: readonly PluginSidebarProject[];
}): void {
  const rpc = useRpc<typeof treeSidebarRpcContract>();

  // The personal project has no sort key to set, and the backend will not
  // rename it, so it stays out of both.
  const ordinary = useMemo(
    () =>
      new Map(
        projects
          .filter((project) => !project.isPersonal)
          .map((project) => [project.id, project.name] as const),
      ),
    [projects],
  );

  const wantedOrder = useMemo(
    () =>
      rows
        .filter((row) => ordinary.has(row.id))
        .map((row) => row.id)
        .join(","),
    [ordinary, rows],
  );
  const actualOrder = useMemo(() => [...ordinary.keys()].join(","), [ordinary]);

  // Left over from the version that indented the picker by padding names. True
  // for anyone who never turned that on, so the cleanup call never happens.
  const hasPadding = useMemo(
    () => [...ordinary.values()].some(isIndented),
    [ordinary],
  );

  // What we last asked for. A write that fails must not become a loop that
  // retries every render, so the same target is attempted once.
  const attemptedOrder = useRef<string | null>(null);
  const attemptedUnpad = useRef(false);

  useEffect(() => {
    if (!order) {
      attemptedOrder.current = null;
      return;
    }
    if (wantedOrder === "" || wantedOrder === actualOrder) return;
    if (attemptedOrder.current === wantedOrder) return;

    const timer = setTimeout(() => {
      attemptedOrder.current = wantedOrder;
      void rpc.call("applyProjectOrder", {
        projectIds: wantedOrder.split(","),
      });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [actualOrder, order, rpc, wantedOrder]);

  // Runs whichever way the options are set, because padded names are a state to
  // clean up rather than a preference to honour. Once.
  useEffect(() => {
    if (!hasPadding || attemptedUnpad.current) return;

    const timer = setTimeout(() => {
      attemptedUnpad.current = true;
      void rpc.call("unpadProjectNames");
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [hasPadding, rpc]);
}
