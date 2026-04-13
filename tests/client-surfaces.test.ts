import { describe, expect, test } from "bun:test";

import {
  buildAccessClientConfig,
  buildAccessClientTargetRoster,
  buildClientProjectThreadSummary,
} from "@aria/access-client";
import {
  createProjectServerRoster,
  createProjectThreadListItem,
  createStatusBadgeLabel,
  describeUiEngineEvent,
} from "@aria/ui";

import {
  ariaDesktopApplication,
  createAriaDesktopApplicationBootstrap,
} from "../apps/aria-desktop/src/index.js";
import {
  ariaMobileApplication,
  createAriaMobileApplicationBootstrap,
} from "../apps/aria-mobile/src/index.js";

describe("client surfaces", () => {
  test("normalizes multi-server access and project thread summaries", () => {
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

    expect(
      buildAccessClientConfig({
        serverId: "home",
        baseUrl: "https://aria.example.test/root/",
        token: "secret",
      }),
    ).toEqual({
      serverId: "home",
      httpUrl: "https://aria.example.test/root",
      wsUrl: "wss://aria.example.test/root",
      token: "secret",
    });
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
    expect(createProjectThreadListItem(project, thread)).toMatchObject({
      id: "thread-1",
      title: "Inbox review",
      projectLabel: "Aria",
      status: "Queued",
      threadType: "aria",
      threadTypeLabel: "Aria",
    });
    expect(createStatusBadgeLabel("in_progress")).toBe("In Progress");
    expect(describeUiEngineEvent({ type: "tool_approval_request" })).toBe("Approval requested");

    const roster = buildAccessClientTargetRoster(
      [
        { serverId: "home", baseUrl: "https://aria.home.example/" },
        { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ],
      "desktop",
    );
    expect(createProjectServerRoster(roster.targets)).toMatchObject({
      selectedServerId: "desktop",
      selectedItem: {
        id: "desktop",
        label: "desktop",
        isSelected: true,
      },
    });
  });

  test("keeps desktop and mobile as thin product shells over shared client seams", () => {
    const desktop = createAriaDesktopApplicationBootstrap({
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
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "wt/main",
          agentId: "codex",
        },
      },
    });
    const mobile = createAriaMobileApplicationBootstrap({
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
        thread: {
          threadId: "thread-2",
          title: "Remote review",
          status: "idle",
          threadType: "remote_project",
          agentId: "codex",
        },
      },
    });

    expect(ariaDesktopApplication.shellPackage).toBe("@aria/desktop");
    expect(desktop.bootstrap.access).toMatchObject({
      serverId: "desktop",
      httpUrl: "http://127.0.0.1:7420",
      wsUrl: "ws://127.0.0.1:7420",
    });
    expect(desktop.bootstrap.activeServerLabel).toBe("Home Server");

    expect(ariaMobileApplication.shellPackage).toBe("@aria/mobile");
    expect(mobile.bootstrap.access).toMatchObject({
      serverId: "mobile",
      httpUrl: "https://aria.example.test",
      wsUrl: "wss://aria.example.test",
    });
    expect(mobile.bootstrap.activeServerLabel).toBe("Home Server");
    expect(mobile.bootstrap.initialThread?.threadType).toBe("remote_project");
  });
});
