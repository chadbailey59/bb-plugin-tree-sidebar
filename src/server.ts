// bb-plugin-tree-sidebar backend.
//
// Two jobs, both of them things the frontend cannot answer on its own. The
// sidebar hook gives a plugin each project's id and name but not where it
// lives, and full-text thread search exists only on the server SDK.
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";
import { PROJECTS_CHANNEL } from "./channels";
import { reorderMoves } from "./reorder";
import { baseName, isIndented } from "./names";

/** Enough matches to fill a sidebar; bb's own search asks for a similar order. */
const SEARCH_LIMIT = 50;

/**
 * The matched message and where in it the hits are, or null when the query only
 * matched the thread's title — the row already shows that.
 */
const snippetSchema = z
  .object({
    text: z.string(),
    ranges: z.array(z.object({ start: z.number(), end: z.number() })),
  })
  .nullable();

/**
 * An archived thread, cut down to what a row needs.
 *
 * The sidebar hook only carries live threads, so an archived hit has to bring
 * its own row data. Everything the tree reads is here; the frontend fills the
 * rest of the shape in with the resting values.
 */
const archivedThreadSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().nullable(),
  titleFallback: z.string().nullable(),
  parentThreadId: z.string().nullable(),
  providerId: z.string(),
  latestAttentionAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const treeSidebarRpcContract = defineRpcContract({
  listProjectPaths: {
    input: z.null(),
    output: z.object({
      projects: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          /** Absolute path of the default source, or null when it has none. */
          path: z.string().nullable(),
        }),
      ),
    }),
  },
  applyProjectOrder: {
    input: z.object({ projectIds: z.array(z.string()) }),
    output: z.object({ moved: z.number() }),
  },
  unpadProjectNames: {
    input: z.null(),
    output: z.object({ renamed: z.number() }),
  },
  searchThreads: {
    input: z.object({ query: z.string() }),
    output: z.object({
      /** Ids only: the frontend already holds every live thread. */
      active: z.array(
        z.object({ threadId: z.string(), snippet: snippetSchema }),
      ),
      archived: z.array(
        z.object({ thread: archivedThreadSchema, snippet: snippetSchema }),
      ),
    }),
  },
});

/** One hit inside a search result, narrowed to the fields a snippet needs. */
interface SearchMatch {
  /** `title`, `title_fallback`, or one of the message kinds. */
  sourceKind: string;
  text: string;
  highlightRanges: readonly { start: number; end: number }[];
}

/**
 * The first hit that is not the title.
 *
 * A title hit tells the row nothing it does not already show, so the useful
 * snippet is the message the query was actually found in.
 */
function bodySnippet(matches: readonly SearchMatch[]) {
  const body = matches.find(
    (match) =>
      match.sourceKind !== "title" && match.sourceKind !== "title_fallback",
  );
  if (body === undefined) return null;
  return {
    text: body.text,
    ranges: body.highlightRanges.map((range) => ({
      start: range.start,
      end: range.end,
    })),
  };
}

export default function plugin(bb: BbPluginApi) {
  // Read in the app bundle through `useSettings`, not here: the tree is the
  // thing that acts on it, and the value is not secret.
  const settings = bb.settings.define({
    hideEmptyProjects: {
      type: "boolean",
      label: "Hide empty projects",
      description:
        "Keep projects with no threads out of the tree. Their + button goes " +
        "with them, so start the first thread from bb's new-thread screen.",
      default: true,
    },
    syncProjectOrder: {
      type: "boolean",
      label: "Sort bb's projects to match the tree",
      description:
        "Rewrite bb's own project order — the order the new-thread project " +
        "picker uses — so it matches this sidebar. Off by default: that " +
        "order is yours to set by dragging, and this replaces it.",
      default: false,
    },
    indentProjectNames: {
      type: "boolean",
      label: "Indent the project picker to match the tree",
      description:
        "Indent each project in the new-thread picker by its depth in the " +
        "tree, folder icon and all, and widen that menu to fit. Restyles one " +
        "piece of bb's own interface; your project names are left alone.",
      default: false,
    },
  });

  const readProjectPaths = async () => {
    const projects = await bb.sdk.projects.list({ includePersonal: true });
    return projects.map((project) => {
      const sources = project.sources.filter(
        (source) => source.type === "local_path",
      );
      const source =
        sources.find((candidate) => candidate.isDefault) ?? sources[0] ?? null;
      return {
        id: project.id,
        name: project.name,
        path: source?.path ?? null,
      };
    });
  };

  bb.rpc.register(treeSidebarRpcContract, {
    async listProjectPaths() {
      return { projects: await readProjectPaths() };
    },

    // bb's project order is a manual, drag-set fractional key, and the
    // new-thread picker renders it as-is. This writes the order the tree shows
    // into it, so the picker and the sidebar agree.
    //
    // The frontend sends the order because the tree's shape is its to compute;
    // the setting is checked HERE as well so the one thing that rewrites the
    // user's own ordering cannot run while the option is off.
    async applyProjectOrder({ projectIds }) {
      const { syncProjectOrder } = await settings.get();
      if (!syncProjectOrder) return { moved: 0 };

      // Public projects only, in the server's own order. The personal project
      // has no place in this ordering, and the frontend leaves it out too.
      const projects = await bb.sdk.projects.list();
      const moves = reorderMoves(
        projects.map((project) => project.id),
        projectIds,
      );

      // Planned all at once, then applied in order — each move writes a key
      // between two neighbours that `reorderMoves` guarantees are adjacent by
      // the time it runs.
      for (const move of moves) {
        await bb.sdk.projects.reorder(move);
      }

      if (moves.length > 0) {
        bb.log.info(`Moved ${moves.length} project(s) to match the tree's order`);
      }
      return { moved: moves.length };
    },

    // An earlier version of this plugin indented the picker by padding project
    // names. `projectMenu.ts` indents the rows themselves now, so this only
    // undoes that: it is a migration, not a setting, and runs whichever way the
    // options are set. Names that never carried the padding are untouched.
    async unpadProjectNames() {
      const projects = await bb.sdk.projects.list();
      let renamed = 0;
      for (const project of projects) {
        if (!isIndented(project.name)) continue;
        await bb.sdk.projects.update({
          projectId: project.id,
          name: baseName(project.name),
        });
        renamed += 1;
      }

      if (renamed > 0) {
        bb.log.info(`Removed name padding from ${renamed} project(s)`);
      }
      return { renamed };
    },

    // The host's search box searches message bodies, not just titles, so a
    // sidebar that filters the thread list it already has finds a fraction of
    // what bb's own does.
    async searchThreads({ query }) {
      const trimmed = query.trim();
      if (trimmed.length === 0) return { active: [], archived: [] };
      const found = await bb.sdk.threads.search({
        query: trimmed,
        limitPerGroup: String(SEARCH_LIMIT),
      });
      return {
        active: found.active.results.map((result) => ({
          threadId: result.thread.id,
          snippet: bodySnippet(result.matches),
        })),
        archived: found.archived.results.map((result) => ({
          thread: {
            id: result.thread.id,
            projectId: result.thread.projectId,
            title: result.thread.title,
            titleFallback: result.thread.titleFallback,
            parentThreadId: result.thread.parentThreadId,
            providerId: result.thread.providerId,
            latestAttentionAt: result.thread.latestAttentionAt,
            createdAt: result.thread.createdAt,
            updatedAt: result.thread.updatedAt,
          },
          snippet: bodySnippet(result.matches),
        })),
      };
    },
  });

  // A new thread is the moment a new project first shows up in the sidebar, so
  // it is also the moment the frontend's cached paths can be one project short.
  bb.events.on("thread.created", () => {
    bb.realtime.publish(PROJECTS_CHANNEL, { reason: "thread.created" });
  });
}
