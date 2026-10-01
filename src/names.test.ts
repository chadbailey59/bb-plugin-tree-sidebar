import { describe, expect, it } from "vitest";
import { baseName, isIndented } from "./names";

const NBSP = "\u00a0";

describe("baseName", () => {
  it("strips only the pad", () => {
    // A name that never carried padding must come back untouched, and a plain
    // leading space is the user's, not ours.
    expect(baseName(`${NBSP}${NBSP}bb`)).toBe("bb");
    expect(baseName("bb")).toBe("bb");
    expect(baseName(` ${NBSP}bb`)).toBe(` ${NBSP}bb`);
  });
});

describe("isIndented", () => {
  it("reports whether a name carries a pad", () => {
    expect(isIndented(`${NBSP}bb`)).toBe(true);
    expect(isIndented("bb")).toBe(false);
    expect(isIndented(" bb")).toBe(false);
  });
});
