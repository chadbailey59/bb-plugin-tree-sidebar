import { createContext, useContext, useEffect, useState } from "react";
import { useRpc, type PluginSidebarThread } from "@bb/plugin-sdk/app";
// Type-only, so the backend and @bb/plugin-sdk never reach the app bundle.
import type { treeSidebarRpcContract } from "./server";
import type { Snippet } from "./snippet";

export interface ThreadSearchState {
  /**
   * Thread ids the server's full-text search matched, or null when nothing is
   * being searched and the tree should filter on titles alone.
   */
  matchedIds: ReadonlySet<string> | null;
  /**
   * Archived threads the search matched. These are not in the sidebar's live
   * list at all, so unlike the active ones they arrive as whole rows.
   */
  archivedThreads: readonly PluginSidebarThread[];
  /** The matched message for each thread the query hit in a message body. */
  snippets: ReadonlyMap<string, Snippet>;
}

const IDLE: ThreadSearchState = {
  matchedIds: null,
  archivedThreads: [],
  snippets: new Map(),
};

/** Long enough that a typed word is one request, short enough to feel live. */
const DEBOUNCE_MS = 150;

/**
 * The host's search box, answered the way bb answers it.
 *
 * bb searches message bodies, not just titles, which is why a thread you
 * remember by something you said in it is findable there. That search lives on
 * the server SDK, so this is an RPC round trip rather than a filter.
 *
 * Results from the previous query stay up while the next one is in flight. The
 * tree unions these ids with its own title filter, so a stale id can only show
 * a row for an instant longer — it can never hide one.
 */
export function useThreadSearch(query: string): ThreadSearchState {
  const rpc = useRpc<typeof treeSidebarRpcContract>();
  const trimmed = query.trim();
  const [state, setState] = useState<ThreadSearchState>(IDLE);

  useEffect(() => {
    if (trimmed.length === 0) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      rpc.call("searchThreads", { query: trimmed }).then(
        (response) => {
          if (cancelled) return;
          const snippets = new Map<string, Snippet>();
          for (const match of response.active) {
            if (match.snippet !== null) {
              snippets.set(match.threadId, match.snippet);
            }
          }
          for (const match of response.archived) {
            if (match.snippet !== null) {
              snippets.set(match.thread.id, match.snippet);
            }
          }
          setState({
            matchedIds: new Set(
              response.active.map((match) => match.threadId),
            ),
            archivedThreads: response.archived.map((match) =>
              asSidebarThread(match.thread),
            ),
            snippets,
          });
        },
        () => {
          // A search that fails must not empty the sidebar: fall back to the
          // title filter the tree does on its own.
          if (!cancelled) setState(IDLE);
        },
      );
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rpc, trimmed]);

  return state;
}

/** The archived-thread row the server sends, before it is filled out. */
type ArchivedRow = Pick<
  PluginSidebarThread,
  | "id"
  | "projectId"
  | "title"
  | "titleFallback"
  | "parentThreadId"
  | "providerId"
  | "latestAttentionAt"
  | "createdAt"
  | "updatedAt"
>;

/**
 * Fill an archived row out into the shape the tree and the rows read.
 *
 * An archived thread is finished: nothing is running in it, nobody is waiting
 * on it, and it cannot be pinned while it is archived. So every field the
 * server does not send has one honest resting value, and none of them is a
 * guess about live state.
 */
function asSidebarThread(row: ArchivedRow): PluginSidebarThread {
  return {
    ...row,
    sectionId: null,
    originKind: null,
    originPluginId: null,
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
    isArchived: true,
    environment: null,
    host: null,
    lastReadAt: null,
  };
}

/**
 * Snippets, out of band.
 *
 * A thread row sits three components below the search, under two different
 * parents, and needs one optional string. Threading it through every level of
 * `Branch` and `ThreadBranch` would put search in the signature of rows that
 * have nothing to do with it.
 */
const SnippetContext = createContext<ReadonlyMap<string, Snippet>>(new Map());

export const SnippetProvider = SnippetContext.Provider;

export function useSnippet(threadId: string): Snippet | null {
  return useContext(SnippetContext).get(threadId) ?? null;
}
