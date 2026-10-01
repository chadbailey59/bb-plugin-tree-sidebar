// A "Copy link" row in bb's own thread menu.
//
// The sidebar's row menu is this plugin's, so adding an item there is a line of
// JSX (see `RowContextMenu.tsx`). The menu behind the dots in the thread header
// is bb's, and the plugin API has no slot for it: a plugin can add a button to
// the header's action row, but not a row to that menu. So this is a content
// script — trusted page code, the documented escape hatch — and, like
// `projectMenu.ts`, it is written to stop working rather than to break.
//
// Every step is a check that can fail into doing nothing: the menu has to name
// a trigger, the trigger has to carry bb's own "Thread actions" label, the
// address bar has to be on a thread, and the menu has to hold an item to copy
// styling from. Miss any of them and no row is added.
//
// The thread comes from the address bar rather than from the DOM, because the
// pane header carries no thread id anywhere. It does not need to: focusing a
// pane navigates to that pane's thread — bb replaces the URL as focus moves —
// and opening the menu focuses the pane first. So by the time the menu exists,
// the address bar is on the thread the menu belongs to. A menu opened from a
// row that carries its own thread id is left alone for that reason: that id and
// the URL can disagree, and this plugin's own sidebar menu covers it anyway.
import { Link01Icon } from "@hugeicons/core-free-icons";
import { copyPermalink } from "./copyPermalink";
import { permalinkFromUrl } from "./permalink";

/** Set on the row this script adds, so a menu is only ever given one. */
const MARK = "data-tree-sidebar-copy-link";

/** bb's accessible name for the dots button, and for the row context menu. */
const THREAD_ACTIONS_LABEL = "Thread actions";

/** bb's hook on a sidebar row, whose thread need not be the one in the URL. */
const SIDEBAR_ROW = "[data-sidebar-thread-id]";

/**
 * Set on this plugin's own row menu, which shares bb's label and already has
 * a Copy link of its own.
 */
const OWN_MENU = "[data-tree-sidebar-row-menu]";

/** The row to sit under. bb's menu is English-only, as is the rest of it. */
const ANCHOR_LABEL = "rename";

const LABEL = "Copy link";

/** Whether this menu is a thread's, by its own label or its trigger's. */
function isThreadMenu(menu: Element): boolean {
  if (menu.matches(OWN_MENU)) return false;
  if (menu.getAttribute("aria-label") === THREAD_ACTIONS_LABEL) return true;
  const trigger = triggerFor(menu);
  return (
    trigger !== null &&
    trigger.getAttribute("aria-label") === THREAD_ACTIONS_LABEL
  );
}

/** The control that opened a menu. Radix wires content to trigger by id. */
function triggerFor(menu: Element): HTMLElement | null {
  const id = menu.getAttribute("aria-labelledby");
  return id === null ? null : document.getElementById(id);
}

function menuItems(menu: Element): HTMLElement[] {
  return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(
    (item): item is HTMLElement => item instanceof HTMLElement,
  );
}

/**
 * The item to copy styling from, and to sit under.
 *
 * Rename, because it is the last of the menu's plain rows: sitting under it
 * puts the link beside the other things you do to a thread rather than beside
 * archive and delete. Its classes come along, which is what makes the added row
 * indistinguishable from bb's own — including in the drawer bb renders this
 * menu as on a narrow window, where the items are buttons rather than divs.
 */
function anchorItem(menu: Element): HTMLElement | null {
  const items = menuItems(menu);
  const rename = items.find(
    (item) => (item.textContent ?? "").trim().toLowerCase() === ANCHOR_LABEL,
  );
  return rename ?? items[0] ?? null;
}

/**
 * A link glyph sized like the menu's own icons.
 *
 * bb sizes its menu icons through selectors on the item, like
 * `[&_[data-icon-root]]:size-4`, and those have changed before. So the glyph
 * takes the class and `data-icon-root` marker of the model row's own icon,
 * which keeps it matching whatever selector bb uses this release.
 */
function linkIcon(model: HTMLElement): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const modelIcon = model.querySelector("svg");
  const modelClass = modelIcon?.getAttribute("class");
  if (modelClass) svg.setAttribute("class", modelClass);
  if (modelIcon?.hasAttribute("data-icon-root")) {
    svg.setAttribute("data-icon-root", "");
  }
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attributes] of Link01Icon) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name === "key" || typeof value !== "string") continue;
      node.setAttribute(kebab(name), value);
    }
    svg.append(node);
  }
  return svg;
}

/** `strokeLinecap` is a React attribute name; SVG wants `stroke-linecap`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}

function buildItem(model: HTMLElement, url: string): HTMLElement {
  const item = document.createElement(model.tagName.toLowerCase());
  item.setAttribute("role", "menuitem");
  item.setAttribute(MARK, "");
  item.className = model.className;
  // Out of the tab order and out of Radix's item collection: the roving focus
  // it manages only knows the items React rendered, so this row is reachable by
  // pointer, and the keyboard walks past it to bb's own rows.
  item.tabIndex = -1;
  if (item instanceof HTMLButtonElement) item.type = "button";
  item.append(linkIcon(model), document.createTextNode(LABEL));

  // bb highlights the last-hovered row through a `data-last-hovered` attribute
  // its own items set. The classes came from one of those items, so setting the
  // same attribute gets the same highlight rather than an approximation of it.
  item.addEventListener("pointerenter", () => {
    item.setAttribute("data-last-hovered", "");
  });
  item.addEventListener("pointerleave", () => {
    item.removeAttribute("data-last-hovered");
  });

  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void copyPermalink(url);
    closeMenu(item);
  });
  return item;
}

/**
 * Close the menu the way any other row would.
 *
 * Radix dismisses on Escape from a document listener, so an Escape from the row
 * closes the menu and restores focus to the dots button — the same as selecting
 * one of bb's own rows.
 */
function closeMenu(item: HTMLElement): void {
  item.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  );
}

/**
 * Whether bb's menu already offers a link. Newer bb ships "Copy thread link"
 * in this menu itself, and a second row that does the same thing is clutter.
 */
function hasOwnLink(menu: Element): boolean {
  return menuItems(menu).some((item) =>
    /\blink\b/iu.test(item.textContent ?? ""),
  );
}

function addCopyLink(menu: Element): void {
  if (!isThreadMenu(menu)) return;
  if (menu.querySelector(`[${MARK}]`) !== null) return;
  if (hasOwnLink(menu)) return;

  const trigger = triggerFor(menu);
  // A row's own menu: its thread and the URL's can differ, so leave it be.
  if (trigger !== null && trigger.closest(SIDEBAR_ROW) !== null) return;

  const url = permalinkFromUrl(window.location.href);
  if (url === null) return;

  const model = anchorItem(menu);
  if (model === null) return;

  const item = buildItem(model, url);
  if ((model.textContent ?? "").trim().toLowerCase() === ANCHOR_LABEL) {
    model.after(item);
    return;
  }
  model.before(item);
}

/**
 * The menu, from a node the app just added.
 *
 * This runs for every node added anywhere — a streaming reply is a great many
 * of them — so the common case has to be one cheap attribute check. Radix
 * portals the menu into `document.body`, so it arrives either as the node
 * itself or inside a container the body just took.
 */
function addCopyLinkIn(node: Element): void {
  if (node.matches('[role="menu"]')) {
    addCopyLink(node);
    return;
  }
  if (node.parentElement !== document.body) return;
  for (const menu of Array.from(node.querySelectorAll('[role="menu"]'))) {
    addCopyLink(menu);
  }
}

/** Watch for a thread menu opening, and give it a Copy link row. */
export function mountThreadMenu(signal: AbortSignal): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) addCopyLinkIn(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // A menu already open when this mounts (a reload with the dots menu up).
  for (const menu of Array.from(document.querySelectorAll('[role="menu"]'))) {
    addCopyLink(menu);
  }

  const cleanup = (): void => {
    observer.disconnect();
    for (const item of Array.from(document.querySelectorAll(`[${MARK}]`))) {
      item.remove();
    }
  };
  signal.addEventListener("abort", cleanup, { once: true });
  return cleanup;
}
