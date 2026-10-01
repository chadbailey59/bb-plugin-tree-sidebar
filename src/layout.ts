/**
 * Indentation, in one place, because directory rows and thread rows have to
 * agree on it for the tree to read as a tree.
 */
export const ROW_BASE_PADDING_PX = 6;
export const INDENT_STEP_PX = 12;

/**
 * A branch row spends width on its folder icon before the label: 14px icon +
 * 6px gap. A thread row has none, so without this it starts one indent step in
 * from its project row and reads as outdented from the name it belongs to.
 * Adding the difference lines a thread title up with its project's title.
 */
export const THREAD_LABEL_OFFSET_PX = 14 + 6 - INDENT_STEP_PX;

/**
 * The trailing control column: status glyph, archive button, project `+`.
 *
 * A 14px icon centered in an 18px box. An icon button needs padding to be
 * comfortably clickable, and that padding is what pushed its icon out of line
 * with a bare glyph that has none — the button's edge lined up, its icon did
 * not. Sizing the box instead of padding it keeps every trailing control the
 * same width, so they all end the same distance from the row's right edge.
 */
export const TRAILING_SLOT_CLASS =
  "flex size-[18px] shrink-0 items-center justify-center";
