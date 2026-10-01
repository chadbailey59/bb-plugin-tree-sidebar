# bb-plugin-tree-sidebar: the sidebar, shaped like the filesystem.

set shell := ["bash", "-uco", "pipefail"]

# The installed plugin's id, which is not the package name.
plugin_id := "tree-sidebar"

_default:
    @just --list

# Build and reload: the loop for a change you want to look at in bb
rebuild:
    # The install is a path source pointing at this directory, so there is
    # nothing to reinstall — bb reads the dist/ this writes, and reload swaps
    # the plugin's code in place. A changed RPC contract can still want a server
    # restart, because the backend registers its handlers at load.
    npm run build
    bb plugin reload {{plugin_id}}

# The same loop on a file watcher: rebuild and reload on every save
dev:
    bb plugin dev .

# Everything a change has to pass (no linter configured; tsc is the gate)
check: typecheck test

test *args:
    npx vitest run {{args}}

# Watch mode, for working through one module's rules
test-watch *args:
    npx vitest {{args}}

typecheck:
    npm run typecheck

build:
    npm run build

# bb.log output from src/server.ts
logs *args:
    bb plugin logs {{plugin_id}} {{args}}

# What bb thinks is installed, and where it is reading it from
@status:
    # Anchored: the source path contains the id too, and an unanchored match
    # would pull the next plugin's row in behind it.
    bb plugin list | grep -A2 '^{{plugin_id}}@'
