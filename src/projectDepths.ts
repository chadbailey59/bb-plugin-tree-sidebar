// How deep each project sits, for the content script that indents bb's picker.
//
// The sidebar knows every project's depth and the picker's content script needs
// it, and both run in the same bundle, so the sidebar publishes the mapping here
// for the script to read. The picker tags each row with its project id, so the
// mapping is keyed by id and two projects sharing a name cannot be confused.

export interface DepthRow {
  id: string;
  depth: number;
}

/** Depth per project id. */
export function depthsById(rows: readonly DepthRow[]): Map<string, number> {
  return new Map(rows.map((row) => [row.id, row.depth] as const));
}

/**
 * The published mapping. Module state rather than a hook because its reader is
 * a content script, not a component — the same bundle, no React in between.
 */
let published: ReadonlyMap<string, number> = new Map();
const listeners = new Set<() => void>();

export function publishProjectDepths(next: ReadonlyMap<string, number>): void {
  published = next;
  for (const listener of listeners) listener();
}

export function projectDepths(): ReadonlyMap<string, number> {
  return published;
}

/** Call `listener` whenever the mapping changes; returns the unsubscribe. */
export function onProjectDepths(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
