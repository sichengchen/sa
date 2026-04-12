import { describe, expect, test } from "bun:test";

import {
  buildAccessClientConfig,
  buildClientProjectThreadSummary,
  createEngineClient,
} from "@aria/access-client";
import {
  createProjectThreadListItem,
  createStatusBadgeLabel,
  describeUiEngineEvent,
  markdownToHtml,
  parseInlineMarkdown,
} from "@aria/ui";
import { ariaDesktopApp, createAriaDesktopBootstrap } from "../apps/aria-desktop/src/index.js";
import { ariaMobileApp, createAriaMobileBootstrap } from "../apps/aria-mobile/src/index.js";

describe("Phase 6 client seams", () => {
  test("@aria/access-client owns the shared engine-client transport factory", () => {
    const client = createEngineClient({
      httpUrl: "http://127.0.0.1:7420",
      wsUrl: "ws://127.0.0.1:7421",
      token: "token",
    });
    expect(client).toBeTruthy();
  });

  test("@aria/access-client normalizes shared client transport config", () => {
    const config = buildAccessClientConfig({
      serverId: "home",
      baseUrl: "https://aria.example.test/root/",
      token: "secret",
    });

    expect(config).toEqual({
      serverId: "home",
      httpUrl: "https://aria.example.test/root",
      wsUrl: "wss://aria.example.test/root",
      token: "secret",
    });
  });

  test("@aria/ui owns markdown formatting helpers for client shells", () => {
    expect(parseInlineMarkdown("hello **world**")).toEqual([{ text: "hello " }, { text: "world", bold: true }]);
    expect(markdownToHtml("`code` and **bold**")).toContain("<code>code</code>");
  });

  test("@aria/access-client and @aria/ui shape project-thread data for client surfaces", () => {
    const project = { projectId: "project-1", name: "Aria" };
    const thread = { threadId: "thread-1", title: "Inbox review", status: "queued" as const };

    expect(buildClientProjectThreadSummary(project, thread)).toEqual({
      projectId: "project-1",
      projectName: "Aria",
      threadId: "thread-1",
      threadTitle: "Inbox review",
      threadStatus: "queued",
    });

    expect(createProjectThreadListItem(project, thread)).toEqual({
      id: "thread-1",
      title: "Inbox review",
      projectLabel: "Aria",
      status: "Queued",
    });
    expect(createStatusBadgeLabel("in_progress")).toBe("In Progress");
    expect(describeUiEngineEvent({ type: "tool_approval_request" })).toBe("Approval requested");
  });

  test("apps/aria-desktop composes the shared client seams without owning new runtime behavior", () => {
    const bootstrap = createAriaDesktopBootstrap(
      { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      {
        project: { name: "Aria" },
        thread: { threadId: "thread-1", title: "Desktop thread", status: "running" },
      },
    );

    expect(ariaDesktopApp.sharedPackages).toContain("@aria/access-client");
    expect(ariaDesktopApp.capabilities).toContain("local-bridge");
    expect(bootstrap.access).toMatchObject({
      serverId: "desktop",
      httpUrl: "http://127.0.0.1:7420",
      wsUrl: "ws://127.0.0.1:7420",
    });
    expect(bootstrap.initialThread?.status).toBe("Running");
  });

  test("apps/aria-mobile stays a thin remote client seam", () => {
    const bootstrap = createAriaMobileBootstrap(
      { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      {
        project: { name: "Aria" },
        thread: { threadId: "thread-2", title: "Mobile review", status: "idle" },
      },
    );

    expect(ariaMobileApp.sharedPackages).toContain("@aria/ui");
    expect(ariaMobileApp.capabilities).not.toContain("local-bridge");
    expect(bootstrap.access).toMatchObject({
      serverId: "mobile",
      httpUrl: "https://aria.example.test",
      wsUrl: "wss://aria.example.test",
    });
    expect(bootstrap.initialThread?.projectLabel).toBe("Aria");
  });
});
