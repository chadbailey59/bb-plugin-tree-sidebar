// bb-plugin-tree-sidebar — a sidebar thread list shaped like the filesystem.
//
// bb already knows where every project lives on disk. Projects under ~/Code,
// ~/Projects, and ~/Support therefore already form a tree, and this list draws
// it: directories nest, projects sit in them, threads sit in projects, and
// forks sit under the thread they came from.
import { definePluginApp } from "@bb/plugin-sdk/app";
import { ProjectTree } from "./src/ProjectTree";
import { mountProjectMenu } from "./src/projectMenu";
import { mountThreadMenu } from "./src/threadMenu";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "tree",
    title: "Tree sidebar",
    description: "Threads nested under their projects, laid out as on disk.",
    component: ProjectTree,
  });

  // Host chrome, not plugin UI: bb's project picker has no notion of depth and
  // hard-codes its width, and only page-level CSS can reach either.
  app.contentScripts.register({
    id: "project-menu",
    mount: ({ signal }) => mountProjectMenu(signal),
  });

  // Same reason: the thread header's dots menu is bb's, and the plugin API has
  // no slot for a row in it. The sidebar's own menu offers the same link
  // through `RowContextMenu`.
  app.contentScripts.register({
    id: "thread-menu",
    mount: ({ signal }) => mountThreadMenu(signal),
  });
});
