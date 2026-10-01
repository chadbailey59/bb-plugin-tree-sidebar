# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A bb plugin that replaces bb's built-in sidebar thread list with one shaped like
the filesystem: directories nest, projects sit in them, threads sit in projects,
and a fork or side chat sits under the thread it came from. Users turn it on at
Settings → Appearance → Sidebar → Tree sidebar.

`README.md` documents the user-facing layout and behavior rules. Read it before
changing anything in `src/tree.ts`.

## Commands

`justfile` wraps the lot; `just` with no recipe lists them.

```bash
just rebuild                  # npm run build + bb plugin reload — see a change in bb
just dev                      # the same on a file watcher (bb plugin dev .)
just check                    # typecheck + test, everything a change has to pass
just test src/tree.test.ts -t "collapses"   # one file / one test
just test-watch               # vitest watch mode
just logs                     # bb.log output from src/server.ts
just status                   # what bb has installed, and where it reads it from
```

The plugin's installed id is `tree-sidebar`, not the package name, and its source
is a path pointing at this checkout — bb reads the `dist/` a build writes, so
there is never anything to reinstall. `just rebuild` is enough for a frontend
change; a changed RPC contract can still want a server restart, because the
backend registers its handlers at load.

`bb plugin build` rewrites the vendored `types/bb-plugin-sdk*.d.ts` from the
running bb on every build, so expect that diff to reappear.

There is no linter configured. `tsc` is the only static gate.

## Architecture

Two bundles, built from one package, that must not touch each other's code.

**Backend** (`src/server.ts`, declared as `bb.server`) runs inside the bb server.
It exists for the two things the app bundle cannot answer on its own.
`listProjectPaths` covers the first: the sidebar hook hands the frontend each
project's id and name but not its workspace path, and a path lookup is a server
call. `searchThreads` covers the second: `bb.sdk.threads.search` is full-text
over message bodies and has no app-side equivalent, so the host's search box
would otherwise only ever filter titles. The backend also republishes
`thread.created` on a realtime channel so the frontend re-reads paths when a new
project first appears.

**Frontend** (`app.tsx` → `src/ProjectTree.tsx`, declared as `bb.app`) registers
the component in the `experimental_threadList` slot.

The bundle boundary is load-bearing. `src/channels.ts` exists only so the
frontend can share the channel name without importing a runtime value from
`server.ts` — doing that would pull `@bb/plugin-sdk` (server-only) into the app
bundle. `useProjectPaths.ts` imports the RPC contract from `server.ts` as
`import type` for the same reason. Keep any new shared value in its own
runtime-free module.

**Layout logic** lives in `src/tree.ts` and is pure: no React, no SDK. Everything
about the tree's shape — path trie, dropping the prefix all projects share,
collapsing single-child directory chains into one row, nesting threads under
their parent, lifting pinned threads out into their own section, pruning
branches during search — is there and is covered by
`src/tree.test.ts`. Change the rules there and test them there; `ProjectTree.tsx`
only renders what `buildProjectTree` returns. `src/snippet.ts` is pure the same
way and holds the search-snippet rules — whitespace flattening, the window cut
around the first hit, splitting text into marked and plain runs — with
`src/snippet.test.ts` beside it.

Search runs in two halves that union: `buildProjectTree` filters on titles, and
`useThreadSearch.ts` debounces an RPC to the server's full-text search and hands
back the ids it matched. Results from the previous query stay up while the next
is in flight, which is safe only because the two halves union — a stale id can
show a row an instant longer, never hide one. A failed search falls back to
title-only rather than emptying the sidebar.

Archived matches are the exception to that union. The sidebar hook carries live
threads only (`bb thread list` excludes archived without `--archived`), so the
backend sends whole rows for them and `asSidebarThread` in `useThreadSearch.ts`
fills the rest of `PluginSidebarThread` in with resting values. They build a
second tree through the same `buildSection` as the live one, under a
`keyPrefix` — both trees are built from the same paths, so shared node keys
would make folding a directory in one fold it in the other.

`hideEmptyProjects` (declared with `bb.settings.define` in `server.ts`, default
true, read in the app bundle through `useSettings`) drops projects that hold no
threads. It is a separate rule from the one search uses: search drops a project
that contributes nothing to *this* tree, which is why a pinned-only project
disappears while filtering, and `hideEmptyProjects` asks whether the project has
any threads at all, which is why a pinned-only project keeps its row otherwise.
The frontend defaults to true while `values` is undefined so the first paint
matches the descriptor rather than flashing rows it is about to remove.

`syncProjectOrder` (default false) writes bb's own project order to match the
tree, because bb stores a manual fractional sort key per project and the
new-thread picker renders that order as-is. Three things keep it honest.
`projectOrder` reads the order off a tree built with no query and no threads, so
searching or hiding empty projects cannot reorder anything. The tree sorts by
path and name rather than by sort key, so a write cannot feed back into the
order it came from. And `applyProjectOrder` re-checks the setting server-side,
since it is the one thing here that rewrites state the user owns.

`bb.sdk.projects.reorder` moves ONE project between two named neighbours, so
`src/reorder.ts` plans the whole sequence — pure, and tested in
`src/reorder.test.ts`, because the alternative is verifying it against real
projects. Each planned move's two neighbours are adjacent at the moment it runs;
that invariant is what makes the plan correct, and it has a test of its own.

`indentProjectNames` (default false) indents bb's own project picker to match the
tree. `src/projectMenu.ts` is one of the plugin's two content scripts, and host
DOM is touched nowhere else.

bb's picker hard-codes its popover at `w-52` (208px), which leaves about 136px
— roughly 22 characters at 12px — before a name is cut off.
`bb-plugin-tree-sidebar` is exactly 22 characters. So the script does two
things: widens the popover to 16rem, and sets `padding-left` per row. Indenting
the row rather than the name moves the folder icon with it, which is what makes
it read like the sidebar.

A plugin stylesheet cannot reach any of this — plugin CSS is scoped to
plugin-rendered content and the popover is portaled host UI. The picker is a
Radix Popover (`role="dialog"`) holding a cmdk list. The script watches for it
opening, confirms it is the picker's by finding a trigger carrying bb's own
`data-promptbox-project-control` hook whose `aria-controls` names the popover's
id, and marks only that. Every step degrades to doing nothing if bb's markup
changes. `ProjectTree.tsx` sets a `data-tree-sidebar-indent` flag on `<html>`,
and every rule hangs off it, so nothing applies while the option is off.

bb used to render this picker as a Radix `DropdownMenu` whose rows carried only
the name. It moved to the cmdk popover, and the script, still looking for
`role="menu"`, silently stopped matching. If the indent disappears again,
inspect the live markup before debugging anything else.

Each cmdk row carries its project id in `data-value`, so the indent is one CSS
rule per project id rather than a style on the row node. That is load-bearing:
cmdk unmounts and remounts rows as the user types in the picker's search box, so
a style set on a node would be lost as soon as the filter cleared.
`src/projectDepths.ts` is how the script gets depths: the sidebar publishes an
id-to-depth map through module state and notifies subscribers, which works
because the content script and the component are the same bundle.

An earlier version indented by padding the names themselves with NO-BREAK SPACE.
`src/names.ts` is what remains of it: `unpadProjectNames` strips that padding
whichever way the options are set, because padded names are leftover state rather
than a preference. It only touches names carrying the pad, so a user who never
enabled it is untouched. Names do round-trip through `projects.update` verbatim
(verified against a throwaway project; the request schema's `name` is a plain
string, while the sibling `path` field carries the normalizing transform) — the
approach worked, it just renamed things it did not need to.

Node keys returned by `buildProjectTree` follow the *deepest* segment of a
collapsed chain, so expansion state survives a chain splitting or merging.
`useCollapsed.ts` persists collapsed (not expanded) keys in `localStorage`, so a
node that did not exist last session shows up open.

## Working with the SDK

`types/bb-plugin-sdk.d.ts` and `types/bb-plugin-sdk-app.d.ts` are vendored,
flattened declarations mapped by `tsconfig.json` paths. The real package is not
installed. For a symbol that is not in them, read the bb source at
https://github.com/get-bb/bb rather than guessing.

**Copy link** is one feature on two surfaces. `src/permalink.ts` holds the rules
and is pure: a thread routes at `/projects/:projectId/threads/:threadId`, except
in the personal project, which has no `/projects/:id` surface and routes at
`/threads/:threadId`. Both surfaces build on `window.location.origin` rather than
a fixed one, so a link copied over `bb connect` carries the tunnel's hostname and
opens for whoever it is pasted to.

The sidebar's item is a row in `RowContextMenu.tsx`. The thread header's dots
menu is bb's own and has no plugin slot, so `src/threadMenu.ts` adds a row to it
as a content script, in the same shape as `projectMenu.ts`: watch for the menu
being portaled into the body, confirm it by resolving `aria-labelledby` to a
trigger carrying bb's `aria-label="Thread actions"`, and give up quietly at every
step. It copies its classes off the menu's own Rename row, which is what makes it
match in both the dropdown and the drawer bb renders the menu as on a narrow
window, and it sets `data-last-hovered` on hover because that is the attribute
those classes highlight on.

Newer bb ships its own "Copy thread link" in that menu, so the script adds
nothing to a menu that already has a row with "link" in it. The sidebar's own
row menu shares bb's `aria-label="Thread actions"`, so it carries
`data-tree-sidebar-row-menu` and the script skips it; without that marker it
gets a second Copy link row. The added row's icon copies the class and
`data-icon-root` marker off the model row's icon, because bb sizes menu icons
through selectors on the item and an unmarked `<svg>` renders at full width.

The added row is click-only. Radix's roving focus only knows the items React
rendered, so the keyboard walks past it — deliberate, rather than registering a
foreign node in Radix's item collection.

The thread comes from the address bar, not the DOM: no pane header carries a
thread id. It does not need to, because focusing a pane navigates to that pane's
thread and opening the menu focuses the pane first, so the URL is already right
when the menu appears. A menu whose trigger sits inside a `[data-sidebar-thread-id]`
row is skipped for the same reason in reverse — that row's thread and the URL's
can disagree.

Everything the sidebar can do to a thread comes from
`experimental_useSidebarThreadActions`; the plugin API ships no menu component,
so `RowContextMenu.tsx` builds one on Radix. Deletion goes through
`requestDelete`, which opens bb's own confirmation (it counts child threads
first) instead of deleting a subtree silently.

Thread rows must carry `data-sidebar-thread-shortcut-target` and
`data-sidebar-thread-id`. bb's `thread.next` / `thread.previous` / numbered
shortcuts find rows by query selector, so dropping either attribute silently
breaks them.

## UI components

`components/ui/`, `lib/`, and `hooks/` come from the bb shadcn registry pinned in
`components.json` (`@bb` → the get-bb/bb plugin-registry at desktop-v0.35.1).
Treat them as vendored: pull updates with `npx shadcn add @bb/<name>` rather than
editing by hand. `lib/portal-scope.ts` is the one deliberate registry override —
it stamps plugin scope attributes on portaled overlays so the plugin's scoped
stylesheet reaches content rendered into `document.body`.
