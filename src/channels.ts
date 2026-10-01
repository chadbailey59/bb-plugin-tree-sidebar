/**
 * Realtime channel names, shared by the backend and the sidebar.
 *
 * Its own module on purpose: the frontend must not import a runtime value from
 * `server.ts`, or the bundler pulls the whole backend — and `@bb/plugin-sdk`,
 * which exists only inside the BB server — into the app bundle.
 */

/** Published when the set of projects or their paths may have changed. */
export const PROJECTS_CHANNEL = "projects";
