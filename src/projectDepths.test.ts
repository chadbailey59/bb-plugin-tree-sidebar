import { describe, expect, it } from "vitest";
import {
  depthsById,
  onProjectDepths,
  projectDepths,
  publishProjectDepths,
} from "./projectDepths";

describe("depthsById", () => {
  it("maps each project's id to its depth", () => {
    const depths = depthsById([
      { id: "p_support", depth: 0 },
      { id: "p_acme", depth: 1 },
    ]);
    expect(Object.fromEntries(depths)).toEqual({ p_support: 0, p_acme: 1 });
  });
});

describe("publishProjectDepths", () => {
  it("replaces the mapping and tells every listener", () => {
    let calls = 0;
    const off = onProjectDepths(() => calls++);
    publishProjectDepths(new Map([["p_bb", 1]]));
    expect(projectDepths().get("p_bb")).toBe(1);
    expect(calls).toBe(1);

    off();
    publishProjectDepths(new Map());
    expect(calls).toBe(1);
  });
});
