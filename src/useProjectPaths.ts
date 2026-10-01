import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useRealtime,
  useRpc,
  type PluginSidebarProject,
} from "@bb/plugin-sdk/app";
// Type-only, so the backend and @bb/plugin-sdk never reach the app bundle.
import type { treeSidebarRpcContract } from "./server";
import { PROJECTS_CHANNEL } from "./channels";
import type { ProjectLocation } from "./tree";

/**
 * Each sidebar project, paired with the workspace path the backend knows.
 *
 * The sidebar hook stays the source of truth for WHICH projects exist, so a
 * project that appears before the path fetch lands still renders — it just
 * sits in the unrooted group for the one render it takes to arrive.
 */
export function useProjectPaths(
  projects: readonly PluginSidebarProject[],
): ProjectLocation[] {
  const rpc = useRpc<typeof treeSidebarRpcContract>();
  const [pathById, setPathById] = useState<ReadonlyMap<string, string | null>>(
    () => new Map(),
  );

  const refresh = useCallback(async () => {
    const result = await rpc.call("listProjectPaths");
    setPathById(
      new Map(result.projects.map((project) => [project.id, project.path])),
    );
  }, [rpc]);

  // Re-read when the set of projects changes, not on every thread update: a
  // project's path is stable, its membership in the list is not.
  const projectIds = projects
    .map((project) => project.id)
    .sort()
    .join(",");
  useEffect(() => {
    void refresh();
  }, [refresh, projectIds]);

  useRealtime(PROJECTS_CHANNEL, () => {
    void refresh();
  });

  return useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        path: pathById.get(project.id) ?? null,
      })),
    [pathById, projects],
  );
}
