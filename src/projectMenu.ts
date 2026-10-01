// Making bb's project picker read like the tree, without touching the names.
//
// Two problems, one script. bb's picker hard-codes its popover at `w-52`
// (208px), which leaves about 136px for a name at 12px text — roughly 22
// characters — before it is cut off. And the picker has no notion of depth at
// all: every project sits flush left.
//
// Indenting the row rather than padding the name moves the folder icon along
// with the name, which is what makes it read like the sidebar, and leaves every
// project named what the user named it.
//
// A plugin stylesheet cannot reach any of this: plugin CSS is scoped to
// plugin-rendered content and this popover is portaled host UI. So it is a
// content script — trusted page code, the documented escape hatch — and it is
// deliberately narrow. It only touches a popover whose trigger carries bb's own
// `data-promptbox-project-control` hook, and everything it changes is a rule in
// one stylesheet. If bb renames that hook or restructures the picker then
// nothing is stamped and those rules match nothing. It can stop working; it
// cannot break the app.
import { onProjectDepths, projectDepths } from "./projectDepths";

/** Set on the picker's popover once recognised; every rule hangs off it. */
const MARK = "data-tree-sidebar-project-menu";

/**
 * Set on <html> while the option is on, so this is part of that feature rather
 * than a standing change to bb's chrome.
 */
export const INDENT_FLAG = "data-tree-sidebar-indent";

/** bb's own hook on the picker's trigger button. */
const TRIGGER = "[data-promptbox-project-control]";

/**
 * 16rem, up from bb's 13rem — enough, and no more.
 *
 * The widest row sets this: a 22-character name one level in wants about 231px
 * once the indent, the folder icon, the check, their gaps, and both paddings are
 * counted. 256px covers that with about four characters spare, where bb's 208px
 * cut it off.
 */
const WIDTH = "16rem";

/** One level of indent. Close enough to the sidebar's own step to read as one. */
const STEP_REM = 0.875;

/** The item's own left padding (`px-2`), which the indent adds to. */
const BASE_REM = 0.5;

const STYLE_ID = "tree-sidebar-project-menu";

/**
 * The whole feature, as CSS.
 *
 * The picker is a cmdk list that unmounts and remounts its rows as the user
 * types into its search box, so anything set on a row node would be lost the
 * moment a filter cleared. Each row carries its project id in `data-value`, so
 * one rule per project styles whichever node is showing it. Every rule hangs off
 * the flag, so the option going off un-styles the picker without anything
 * having to walk it.
 */
function css(depths: ReadonlyMap<string, number>): string {
  const scope = `html[${INDENT_FLAG}] [${MARK}]`;
  const rules = [`${scope} { width: ${WIDTH}; }`];
  for (const [id, depth] of depths) {
    if (depth <= 0) continue;
    rules.push(
      `${scope} [cmdk-item][data-value="${CSS.escape(id)}"] { padding-left: ${BASE_REM + depth * STEP_REM}rem; }`,
    );
  }
  return rules.join("\n");
}

/**
 * Whether this popover is the project picker's, by way of its trigger. Radix
 * points the trigger's `aria-controls` at the content's id.
 */
function isProjectMenu(popover: Element): boolean {
  if (popover.id === "") return false;
  return (
    document.querySelector(
      `${TRIGGER}[aria-controls="${CSS.escape(popover.id)}"]`,
    ) !== null
  );
}

function markMenu(popover: Element): void {
  if (isProjectMenu(popover)) popover.setAttribute(MARK, "");
}

/**
 * The popover, from a node that was just added to the document.
 *
 * This runs for every node the app adds anywhere — a streaming reply is a lot of
 * them — so the common case has to be one cheap attribute check. Radix portals
 * the popover into `document.body`, so it arrives either as the node itself or
 * inside a container that body just took: nothing else needs searching.
 */
function markMenusIn(node: Element): void {
  if (node.matches('[role="dialog"]')) {
    markMenu(node);
    return;
  }
  if (node.parentElement !== document.body) return;
  for (const popover of Array.from(node.querySelectorAll('[role="dialog"]'))) {
    markMenu(popover);
  }
}

/**
 * Watch for the picker opening, and mark it.
 *
 * The popover is portaled into the body and built fresh on every open, so there
 * is nothing to mark until it exists.
 */
export function mountProjectMenu(signal: AbortSignal): () => void {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css(projectDepths());
  document.head.append(style);
  const unsubscribe = onProjectDepths(() => {
    style.textContent = css(projectDepths());
  });

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) markMenusIn(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // A picker already open when this mounts (a reload with it up).
  for (const popover of Array.from(
    document.querySelectorAll('[role="dialog"]'),
  )) {
    markMenu(popover);
  }

  const cleanup = (): void => {
    observer.disconnect();
    unsubscribe();
    style.remove();
    for (const popover of Array.from(document.querySelectorAll(`[${MARK}]`))) {
      popover.removeAttribute(MARK);
    }
  };
  signal.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}
