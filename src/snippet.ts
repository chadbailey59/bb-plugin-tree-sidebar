// Turning a matched message into one line of sidebar.
//
// The server hands back the whole matched text and the byte ranges the query
// hit inside it. A sidebar row has about a line to spend, and the hit can be
// anywhere in a long message, so this cuts a window around the first hit and
// moves the ranges with it. Pure, like `tree.ts`, and tested the same way.

export interface HighlightRange {
  start: number;
  end: number;
}

export interface Snippet {
  text: string;
  ranges: readonly HighlightRange[];
}

/** A run of snippet text, and whether the query matched it. */
export interface SnippetPart {
  text: string;
  isMatch: boolean;
}

/** Characters kept before the first hit, so it has a little context. */
const LEAD_CHARS = 24;
/** Characters kept in total. Two lines at sidebar width, give or take. */
const WINDOW_CHARS = 160;
const ELLIPSIS = "…";

/**
 * Cut a window around the first hit and drop the ranges outside it.
 *
 * Whitespace is flattened first: a matched message is often several lines, and
 * a row that is one line tall renders those as a run of gaps otherwise.
 */
export function excerpt(snippet: Snippet): Snippet {
  const text = snippet.text.replace(/\s+/gu, " ").trim();
  // Flattening moved every offset after the first collapsed run, so ranges
  // from the raw text no longer line up. Re-find the matched words instead of
  // trusting them, and keep the hit rather than mis-highlighting a neighbour.
  const ranges = remap(snippet, text);

  const first = ranges[0];
  if (first === undefined) {
    return { text: clip(text, WINDOW_CHARS), ranges: [] };
  }

  const start = Math.max(0, first.start - LEAD_CHARS);
  const end = Math.min(text.length, start + WINDOW_CHARS);
  const head = start > 0 ? ELLIPSIS : "";
  const tail = end < text.length ? ELLIPSIS : "";
  const shift = head.length - start;

  return {
    text: `${head}${text.slice(start, end)}${tail}`,
    ranges: ranges
      .filter((range) => range.start >= start && range.end <= end)
      .map((range) => ({
        start: range.start + shift,
        end: range.end + shift,
      })),
  };
}

/**
 * Split a snippet into plain and matched runs, in order.
 *
 * Ranges that overlap, run backwards, or point past the end are dropped rather
 * than trusted — they would otherwise scramble the row's text.
 */
export function splitHighlights(snippet: Snippet): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let cursor = 0;
  for (const range of [...snippet.ranges].sort(
    (left, right) => left.start - right.start,
  )) {
    const start = Math.max(range.start, cursor);
    const end = Math.min(range.end, snippet.text.length);
    if (end <= start) continue;
    if (start > cursor) {
      parts.push({ text: snippet.text.slice(cursor, start), isMatch: false });
    }
    parts.push({ text: snippet.text.slice(start, end), isMatch: true });
    cursor = end;
  }
  if (cursor < snippet.text.length) {
    parts.push({ text: snippet.text.slice(cursor), isMatch: false });
  }
  return parts;
}

/** Where each matched substring landed after whitespace was flattened. */
function remap(snippet: Snippet, text: string): HighlightRange[] {
  const found: HighlightRange[] = [];
  let cursor = 0;
  for (const range of [...snippet.ranges].sort(
    (left, right) => left.start - right.start,
  )) {
    const needle = snippet.text
      .slice(range.start, range.end)
      .replace(/\s+/gu, " ")
      .trim();
    if (needle.length === 0) continue;
    const at = text.indexOf(needle, cursor);
    if (at === -1) continue;
    found.push({ start: at, end: at + needle.length });
    cursor = at + needle.length;
  }
  return found;
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}${ELLIPSIS}` : text;
}
