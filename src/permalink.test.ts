import { describe, expect, it } from "vitest";
import {
  permalinkFromUrl,
  threadIdFromUrl,
  threadPermalink,
  threadRoutePath,
} from "./permalink";

describe("threadRoutePath", () => {
  it("routes a project's thread under the project", () => {
    expect(
      threadRoutePath({ threadId: "thr_abc", projectId: "proj_xyz" }),
    ).toBe("/projects/proj_xyz/threads/thr_abc");
  });

  it("routes a personal thread without one, which has no project surface", () => {
    expect(
      threadRoutePath({ threadId: "thr_abc", projectId: "proj_personal" }),
    ).toBe("/threads/thr_abc");
  });
});

describe("threadPermalink", () => {
  it("hangs the route off the origin the user is viewing bb at", () => {
    expect(
      threadPermalink("https://sawyer.getbb.app", {
        threadId: "thr_abc",
        projectId: "proj_xyz",
      }),
    ).toBe("https://sawyer.getbb.app/projects/proj_xyz/threads/thr_abc");
  });

  it("does not double the slash on an origin that carries one", () => {
    expect(
      threadPermalink("http://127.0.0.1:38886/", {
        threadId: "thr_abc",
        projectId: "proj_personal",
      }),
    ).toBe("http://127.0.0.1:38886/threads/thr_abc");
  });
});

describe("threadIdFromUrl", () => {
  it("reads the id out of both thread routes", () => {
    expect(threadIdFromUrl("/threads/thr_abc")).toBe("thr_abc");
    expect(threadIdFromUrl("/projects/proj_xyz/threads/thr_abc")).toBe(
      "thr_abc",
    );
  });

  it("reads it out of a whole URL", () => {
    expect(
      threadIdFromUrl("http://127.0.0.1:38886/projects/proj_xyz/threads/thr_abc"),
    ).toBe("thr_abc");
  });

  it("ignores the panel query and the hash", () => {
    expect(threadIdFromUrl("/threads/thr_abc?panel=files#row-1")).toBe(
      "thr_abc",
    );
  });

  it("is null anywhere that is not a thread", () => {
    expect(threadIdFromUrl("/")).toBeNull();
    expect(threadIdFromUrl("/projects/proj_xyz")).toBeNull();
    expect(threadIdFromUrl("/settings/appearance")).toBeNull();
    expect(threadIdFromUrl("/plugins/tree-sidebar/board")).toBeNull();
    expect(threadIdFromUrl("/threads/thr_abc/extra")).toBeNull();
  });

  it("is null for a segment that is not a thread id", () => {
    expect(threadIdFromUrl("/threads/proj_xyz")).toBeNull();
    expect(threadIdFromUrl("/threads/..%2Fsettings")).toBeNull();
  });
});

describe("permalinkFromUrl", () => {
  it("is the address bar's URL, less the query and hash", () => {
    expect(
      permalinkFromUrl(
        "http://127.0.0.1:38886/projects/proj_xyz/threads/thr_abc?panel=files",
      ),
    ).toBe("http://127.0.0.1:38886/projects/proj_xyz/threads/thr_abc");
  });

  it("is null off a thread, so nothing is copied from the wrong page", () => {
    expect(permalinkFromUrl("http://127.0.0.1:38886/settings")).toBeNull();
  });
});
