/**
 * A thread's permalink: the URL that opens it in bb.
 *
 * bb routes a thread at `/projects/:projectId/threads/:threadId`, except in the
 * personal project, which has no `/projects/:id` surface and routes at
 * `/threads/:threadId`. Both rules live here, alongside the reverse — reading a
 * thread's id back out of a path — because the two surfaces that copy a link
 * start from opposite ends. The sidebar has the thread and builds a path; the
 * content script has the address bar and reads one.
 *
 * Everything is relative to an origin the caller supplies, which is always
 * `window.location.origin`: whatever address bb is being viewed at. In the
 * desktop app that is `http://127.0.0.1:<port>`, over `bb connect` it is the
 * tunnel's hostname, and on a LAN it is the machine's address. Copying the
 * origin the user is already on is what makes a pasted link work for whoever
 * they paste it to.
 */

/** bb's singleton personal project, whose threads route without a project. */
const PERSONAL_PROJECT_ID = "proj_personal";

/** Thread ids are prefixed, which is what makes a path recognisable as one. */
const THREAD_ID_PATTERN = /^thr_[A-Za-z0-9]+$/u;

export interface ThreadRef {
  threadId: string;
  projectId: string;
}

/** The app path that opens a thread, no origin. */
export function threadRoutePath({ threadId, projectId }: ThreadRef): string {
  return projectId === PERSONAL_PROJECT_ID
    ? `/threads/${threadId}`
    : `/projects/${projectId}/threads/${threadId}`;
}

/** The full link to a thread, from an origin and the thread. */
export function threadPermalink(origin: string, thread: ThreadRef): string {
  return `${stripTrailingSlash(origin)}${threadRoutePath(thread)}`;
}

/**
 * The thread a bb URL points at, or null when it points at anything else.
 *
 * Takes a whole URL or a bare path, and ignores a query and hash: bb hangs
 * panel selection off the query (`?panel=files`), and a permalink should open
 * the thread rather than reproduce the sender's open panel.
 */
export function threadIdFromUrl(url: string): string | null {
  const path = stripSuffix(stripOrigin(url));
  const segments = path.split("/").filter((segment) => segment.length > 0);

  // /threads/:threadId
  if (segments.length === 2 && segments[0] === "threads") {
    return asThreadId(segments[1]);
  }
  // /projects/:projectId/threads/:threadId
  if (
    segments.length === 4 &&
    segments[0] === "projects" &&
    segments[2] === "threads"
  ) {
    return asThreadId(segments[3]);
  }
  return null;
}

/**
 * The permalink for a bb URL that is already on a thread.
 *
 * The route in the address bar is the canonical one, so the link is that URL
 * with its query and hash dropped. Null when the URL is not a thread's.
 */
export function permalinkFromUrl(url: string): string | null {
  if (threadIdFromUrl(url) === null) return null;
  return stripSuffix(url);
}

function asThreadId(segment: string | undefined): string | null {
  if (segment === undefined) return null;
  const decoded = safeDecode(segment);
  return THREAD_ID_PATTERN.test(decoded) ? decoded : null;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function stripOrigin(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/iu.exec(url);
  return match === null ? url : url.slice(match[0].length);
}

function stripSuffix(url: string): string {
  const cut = url.search(/[?#]/u);
  return cut === -1 ? url : url.slice(0, cut);
}

function stripTrailingSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}
