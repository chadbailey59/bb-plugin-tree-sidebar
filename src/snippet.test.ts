import { describe, expect, it } from "vitest";
import { excerpt, splitHighlights, type Snippet } from "./snippet";

/** The rendered snippet, with the hits wrapped, for readable assertions. */
function render(snippet: Snippet) {
  return splitHighlights(snippet)
    .map((part) => (part.isMatch ? `[${part.text}]` : part.text))
    .join("");
}

describe("excerpt", () => {
  it("flattens the newlines a message is full of", () => {
    const result = excerpt({
      text: "first line\n\n  second line",
      ranges: [{ start: 14, end: 20 }],
    });
    expect(result.text).toBe("first line second line");
    expect(render(result)).toBe("first line [second] line");
  });

  it("cuts a window around the first hit and moves the ranges with it", () => {
    const lead = "x".repeat(400);
    const result = excerpt({
      text: `${lead} tear out the old sidebar ${lead}`,
      ranges: [{ start: 401, end: 409 }],
    });
    expect(result.text.startsWith("…")).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(render(result)).toContain("[tear out]");
  });

  it("keeps a short message whole", () => {
    const result = excerpt({
      text: "tear out the sidebar",
      ranges: [{ start: 0, end: 8 }],
    });
    expect(result.text).toBe("tear out the sidebar");
    expect(render(result)).toBe("[tear out] the sidebar");
  });

  it("still shows the text when no range survives", () => {
    const result = excerpt({ text: "nothing highlighted", ranges: [] });
    expect(result.text).toBe("nothing highlighted");
    expect(result.ranges).toEqual([]);
  });

  it("drops a range whose text is not in the message", () => {
    const result = excerpt({
      text: "a short message",
      ranges: [{ start: 900, end: 950 }],
    });
    expect(result.ranges).toEqual([]);
  });
});

describe("splitHighlights", () => {
  it("marks every hit in order", () => {
    expect(
      render({
        text: "tear out and tear down",
        ranges: [
          { start: 13, end: 17 },
          { start: 0, end: 4 },
        ],
      }),
    ).toBe("[tear] out and [tear] down");
  });

  it("ignores ranges that overlap, invert, or run past the end", () => {
    expect(
      render({
        text: "sidebar",
        ranges: [
          { start: 0, end: 4 },
          { start: 2, end: 3 },
          { start: 5, end: 4 },
          { start: 4, end: 99 },
        ],
      }),
    ).toBe("[side][bar]");
  });
});
