import { describe, expect, it } from "vitest";
import { reorderMoves, type ProjectMove } from "./reorder";

/** Apply the moves to a list, the way the server's key writes would. */
function applyMoves(
  current: readonly string[],
  moves: readonly ProjectMove[],
): string[] {
  const ordered = [...current];
  for (const move of moves) {
    ordered.splice(ordered.indexOf(move.projectId), 1);
    const at =
      move.previousProjectId === null
        ? 0
        : ordered.indexOf(move.previousProjectId) + 1;
    ordered.splice(at, 0, move.projectId);
  }
  return ordered;
}

/** The order the planned moves actually produce. */
function settle(current: string[], target: string[]): string[] {
  return applyMoves(current, reorderMoves(current, target));
}

describe("reorderMoves", () => {
  it("asks for nothing when the order already matches", () => {
    expect(reorderMoves(["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
  });

  it("reaches the target order", () => {
    expect(settle(["c", "a", "b"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("reverses an order", () => {
    expect(settle(["a", "b", "c", "d"], ["d", "c", "b", "a"])).toEqual([
      "d",
      "c",
      "b",
      "a",
    ]);
  });

  it("moves only what is out of place", () => {
    // b and c are already settled once a is first, so a is the only move.
    const moves = reorderMoves(["b", "c", "a"], ["a", "b", "c"]);
    expect(moves).toEqual([
      { projectId: "a", previousProjectId: null, nextProjectId: "b" },
    ]);
  });

  it("names two neighbours that are adjacent when the move happens", () => {
    // Each move writes a key BETWEEN these two, so a pair that is not adjacent
    // at that moment would land the project somewhere else entirely.
    const current = ["d", "c", "b", "a"];
    const ordered = [...current];
    for (const move of reorderMoves(current, ["a", "b", "c", "d"])) {
      if (move.previousProjectId !== null && move.nextProjectId !== null) {
        const previous = ordered.indexOf(move.previousProjectId);
        const next = ordered.indexOf(move.nextProjectId);
        expect(next).toBe(previous + 1);
      }
      ordered.splice(ordered.indexOf(move.projectId), 1);
      const at =
        move.previousProjectId === null
          ? 0
          : ordered.indexOf(move.previousProjectId) + 1;
      ordered.splice(at, 0, move.projectId);
    }
  });

  it("drifts an unranked project to the end, keeping its relative order", () => {
    // x and y are not in the target: they are not reordered against each other,
    // they just end up after everything that was ranked.
    expect(settle(["x", "a", "y", "b"], ["a", "b"])).toEqual([
      "a",
      "b",
      "x",
      "y",
    ]);
  });

  it("ignores a target id that is not in the list", () => {
    expect(reorderMoves(["a", "b"], ["gone", "a", "b"])).toEqual([]);
  });

  it("handles an empty target and an empty list", () => {
    expect(reorderMoves(["a", "b"], [])).toEqual([]);
    expect(reorderMoves([], ["a"])).toEqual([]);
  });

  it("plans at most one move per project", () => {
    const current = ["e", "d", "c", "b", "a"];
    const target = ["a", "b", "c", "d", "e"];
    const moves = reorderMoves(current, target);
    expect(new Set(moves.map((move) => move.projectId)).size).toBe(
      moves.length,
    );
    expect(settle(current, target)).toEqual(target);
  });
});
