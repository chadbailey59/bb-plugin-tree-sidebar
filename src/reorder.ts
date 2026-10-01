// Turning "this is the order I want" into bb's one-project-at-a-time moves.
//
// bb stores a manual fractional sort key per project, and its reorder operation
// moves ONE project between two named neighbours. Realizing a whole order is
// therefore a sequence of those moves. Pure, so the sequence can be tested
// without reordering anybody's real projects.

export interface ProjectMove {
  projectId: string;
  /** The project it should follow; null to put it first. */
  previousProjectId: string | null;
  /** The project it should precede; null to put it last. */
  nextProjectId: string | null;
}

/**
 * The moves that take `current` to `target`, in order.
 *
 * Walk the target order and place each project after the one before it. Once
 * position `index` is settled, everything before it is already right, which
 * makes the project sitting at `index` the first one still out of place — and
 * the neighbour the moved project belongs in front of.
 *
 * A project in `current` but not in `target` keeps its relative order and
 * drifts to the end, which is the honest answer for a project the caller did
 * not rank. Ids in `target` that are not in `current` are ignored.
 */
export function reorderMoves(
  current: readonly string[],
  target: readonly string[],
): ProjectMove[] {
  const present = new Set(current);
  const wanted = target.filter((id) => present.has(id));
  const ordered = [...current];
  const moves: ProjectMove[] = [];

  for (const [index, projectId] of wanted.entries()) {
    if (ordered[index] === projectId) continue;
    moves.push({
      projectId,
      previousProjectId: index === 0 ? null : wanted[index - 1] ?? null,
      nextProjectId: ordered[index] ?? null,
    });
    // A key written between those two neighbours lands the project exactly
    // there, so the next step plans against where the list now stands.
    ordered.splice(ordered.indexOf(projectId), 1);
    ordered.splice(index, 0, projectId);
  }

  return moves;
}
