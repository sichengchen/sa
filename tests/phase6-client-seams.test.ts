import { describe, expect, test } from "bun:test";

import {
  buildAccessClientConfig,
  buildAccessClientTargetRoster,
  buildClientProjectThreadSummary,
  createEngineClient,
} from "@aria/access-client";
import {
  createProjectThreadListItem,
  createProjectServerRoster,
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
    const thread = {
      threadId: "thread-1",
      title: "Inbox review",
      status: "queued" as const,
      threadType: "aria" as const,
      workspaceId: "workspace-1",
      environmentId: "env-1",
      agentId: "aria-agent",
    };

    expect(buildClientProjectThreadSummary(project, thread)).toEqual({
      projectId: "project-1",
      projectName: "Aria",
      threadId: "thread-1",
      threadTitle: "Inbox review",
      threadStatus: "queued",
      threadType: "aria",
      threadTypeLabel: "Aria",
      workspaceId: "workspace-1",
      environmentId: "env-1",
      agentId: "aria-agent",
    });

    expect(createProjectThreadListItem(project, thread)).toEqual({
      id: "thread-1",
      title: "Inbox review",
      projectLabel: "Aria",
      status: "Queued",
      threadType: "aria",
      threadTypeLabel: "Aria",
      environmentId: "env-1",
      agentId: "aria-agent",
    });
    expect(createStatusBadgeLabel("in_progress")).toBe("In Progress");
    expect(describeUiEngineEvent({ type: "tool_approval_request" })).toBe("Approval requested");
  });

  test("@aria/access-client resolves active server selection for multi-server clients", () => {
    const roster = buildAccessClientTargetRoster(
      [
        { serverId: "home", baseUrl: "https://aria.home.example/" },
        { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ],
      "desktop",
    );

    expect(roster).toEqual({
      selectedServerId: "desktop",
      targets: [
        {
          serverId: "home",
          label: "home",
          httpUrl: "https://aria.home.example",
          wsUrl: "wss://aria.home.example",
          isSelected: false,
          selectionLabel: "Available",
        },
        {
          serverId: "desktop",
          label: "desktop",
          httpUrl: "http://127.0.0.1:7420",
          wsUrl: "ws://127.0.0.1:7420",
          isSelected: true,
          selectionLabel: "Selected",
        },
      ],
      selectedTarget: {
        serverId: "desktop",
        label: "desktop",
        httpUrl: "http://127.0.0.1:7420",
        wsUrl: "ws://127.0.0.1:7420",
        isSelected: true,
        selectionLabel: "Selected",
      },
    });

    expect(
      createProjectServerRoster(roster.targets),
    ).toEqual({
      selectedServerId: "desktop",
      items: [
        {
          id: "home",
          label: "home",
          connectionLabel: "https://aria.home.example",
          selectionLabel: "Available",
          isSelected: false,
        },
        {
          id: "desktop",
          label: "desktop",
          connectionLabel: "http://127.0.0.1:7420",
          selectionLabel: "Selected",
          isSelected: true,
        },
      ],
      selectedItem: {
        id: "desktop",
        label: "desktop",
        connectionLabel: "http://127.0.0.1:7420",
        selectionLabel: "Selected",
        isSelected: true,
      },
    });
  });

  test("apps/aria-desktop composes the shared client seams without owning new runtime behavior", () => {
    const bootstrap = createAriaDesktopBootstrap({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      servers: [
        {
          label: "Home Server",
          target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "desktop",
      initialThread: {
        project: { name: "Aria" },
        thread: { threadId: "thread-1", title: "Desktop thread", status: "running", threadType: "local_project", environmentId: "desktop-main", agentId: "codex" },
      },
    });

    expect(ariaDesktopApp.sharedPackages).toContain("@aria/access-client");
    expect(ariaDesktopApp.capabilities).toContain("local-bridge");
    expect(ariaDesktopApp.serverSwitcher).toEqual(
      expect.objectContaining({
        placement: "top-chrome",
        mode: "multi-server",
      }),
    );
    expect(bootstrap.access).toMatchObject({
      serverId: "desktop",
      httpUrl: "http://127.0.0.1:7420",
      wsUrl: "ws://127.0.0.1:7420",
    });
    expect(bootstrap.activeServerLabel).toBe("Home Server");
    expect(bootstrap.initialThread?.status).toBe("Running");
    expect(bootstrap.initialThread?.threadType).toBe("local_project");
  });

  test("apps/aria-mobile stays a thin remote client seam", () => {
    const bootstrap = createAriaMobileBootstrap({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      servers: [
        {
          label: "Home Server",
          target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
        },
        {
          label: "Relay Mirror",
          target: { serverId: "relay", baseUrl: "https://relay.example.test/" },
        },
      ],
      activeServerId: "mobile",
      initialThread: {
        project: { name: "Aria" },
        thread: { threadId: "thread-2", title: "Mobile review", status: "idle", threadType: "remote_project", agentId: "codex" },
      },
    });

    expect(ariaMobileApp.sharedPackages).toContain("@aria/ui");
    expect(ariaMobileApp.capabilities).toEqual([
      "server-access",
      "project-threads",
      "remote-review",
      "approvals",
      "automation",
      "reconnect",
    ]);
    expect(ariaMobileApp.serverSwitcher).toEqual(
      expect.objectContaining({
        placement: "header",
        mode: "multi-server",
      }),
    );
    expect(bootstrap.access).toMatchObject({
      serverId: "mobile",
      httpUrl: "https://aria.example.test",
      wsUrl: "wss://aria.example.test",
    });
    expect(bootstrap.activeServerLabel).toBe("Home Server");
    expect(bootstrap.initialThread?.projectLabel).toBe("Aria");
    expect(bootstrap.initialThread?.threadType).toBe("remote_project");
  });
});
