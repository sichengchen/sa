import { describe, expect, test } from "bun:test";

import { ariaServerApp, createAriaServerBootstrap } from "@aria/server";
import { createAriaDesktopShell } from "@aria/desktop";
import { createAriaMobileShell } from "@aria/mobile";

describe("package shell composition", () => {
  test("@aria/server exposes package-owned server shell metadata and bootstrap discovery", () => {
    const bootstrap = createAriaServerBootstrap({
      runtimeHome: "/tmp/aria-shell-test",
      hostname: "127.0.0.1",
      port: 7420,
    });

    expect(ariaServerApp).toMatchObject({
      id: "aria-server",
      displayName: "Esperta Aria",
      runtimeName: "Aria Runtime",
      cliName: "aria",
      surface: "server",
    });
    expect(ariaServerApp.capabilities).toContain("aria-agent-host");
    expect(ariaServerApp.ownership).toMatchObject({
      ariaAgent: "server-only",
      memory: "server-only",
      automation: "server-only",
      connectors: "server-only",
      projectLocalExecution: "desktop-only",
    });
    expect(ariaServerApp.sharedPackages).toEqual(["@aria/runtime", "@aria/gateway"]);
    expect(bootstrap).toMatchObject({
      app: ariaServerApp,
      runtimeHome: "/tmp/aria-shell-test",
      hostname: "127.0.0.1",
      port: 7420,
    });
    expect(bootstrap.discovery).toMatchObject({
      pidFile: "/tmp/aria-shell-test/engine.pid",
      urlFile: "/tmp/aria-shell-test/engine.url",
      logFile: "/tmp/aria-shell-test/engine.log",
      restartMarkerFile: "/tmp/aria-shell-test/engine.restart",
    });
  });

  test("@aria/desktop composes navigation, environments, and project threads at the package seam", () => {
    const shell = createAriaDesktopShell({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      environments: [
        {
          environmentId: "env-1",
          hostLabel: "This Device",
          environmentLabel: "wt/main",
          mode: "local",
          target: {
            serverId: "desktop-local",
            baseUrl: "http://127.0.0.1:8123/",
          },
        },
      ],
      projects: [
        {
          project: { name: "Aria" },
          threads: [
            {
              threadId: "thread-1",
              title: "Inbox",
              status: "running",
              threadType: "aria",
              agentId: "aria-agent",
            },
          ],
        },
      ],
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Inbox",
          status: "running",
          threadType: "aria",
          agentId: "aria-agent",
        },
      },
      activeThreadContext: {
        projectLabel: "Aria",
        thread: {
          threadId: "thread-1",
          threadType: "aria",
          title: "Inbox",
          status: "running",
          environmentId: "env-1",
          agentId: "aria-agent",
        },
        environmentLabel: "This Device / wt/main",
        agentLabel: "Aria Agent",
      },
    });

    expect(shell.navigation).toEqual([
      {
        spaceId: "aria",
        label: "Aria",
        defaultScreenId: "chat",
        screens: [
          { id: "chat", label: "Chat" },
          { id: "inbox", label: "Inbox" },
          { id: "automations", label: "Automations" },
          { id: "connectors", label: "Connectors" },
        ],
      },
      {
        spaceId: "projects",
        label: "Projects",
        defaultScreenId: "thread-list",
        screens: [
          { id: "thread-list", label: "Thread List" },
          { id: "thread", label: "Active Thread" },
        ],
      },
    ]);
    expect(shell.spaces).toEqual([
      { id: "aria", label: "Aria" },
      { id: "projects", label: "Projects" },
    ]);
    expect(shell.contextPanels.map((panel) => panel.id)).toEqual([
      "review",
      "changes",
      "environment",
      "job",
      "approvals",
      "artifacts",
    ]);
    expect(shell.projectSidebar).toEqual({
      label: "Projects",
      mode: "unified-project-thread-tree",
      projects: [
        {
          projectLabel: "Aria",
          threads: [
            {
              id: "thread-1",
              title: "Inbox",
              projectLabel: "Aria",
              status: "Running",
              threadType: "aria",
              threadTypeLabel: "Aria",
              environmentId: null,
              agentId: "aria-agent",
            },
          ],
        },
      ],
    });
    expect(shell.projectThreadListScreen).toEqual({
      title: "Unified project threads",
      description:
        "Project threads stay grouped by project while environment switching happens in the active thread view.",
      mode: "unified-project-thread-list",
      projectSidebar: shell.projectSidebar,
    });
    expect(shell.composerPlacement).toBe("bottom-docked");
    expect(shell.environments).toMatchObject([
      {
        id: "env-1",
        label: "This Device / wt/main",
        mode: "local",
        access: {
          serverId: "desktop-local",
          httpUrl: "http://127.0.0.1:8123",
          wsUrl: "ws://127.0.0.1:8123",
        },
      },
    ]);
    expect(shell.sidebarProjects).toEqual([
      {
        projectLabel: "Aria",
        threads: [
          {
            id: "thread-1",
            title: "Inbox",
            projectLabel: "Aria",
            status: "Running",
            threadType: "aria",
            threadTypeLabel: "Aria",
            environmentId: null,
            agentId: "aria-agent",
          },
        ],
      },
    ]);
    expect(shell.initialThread).toMatchObject({
      id: "thread-1",
      projectLabel: "Aria",
      status: "Running",
      threadType: "aria",
    });
    expect(shell.activeThreadContext).toMatchObject({
      threadId: "thread-1",
      threadType: "aria",
      threadTypeLabel: "Aria",
      projectLabel: "Aria",
      threadTitle: "Inbox",
      threadStatusLabel: "Running",
      environmentId: "env-1",
      environmentLabel: "This Device / wt/main",
      agentLabel: "Aria Agent",
    });
    expect(shell.activeThreadScreen).toMatchObject({
      header: {
        threadId: "thread-1",
        title: "Inbox",
        projectLabel: "Aria",
        threadType: "aria",
        threadTypeLabel: "Aria",
        statusLabel: "Running",
        environmentId: "env-1",
        environmentLabel: "This Device / wt/main",
        agentLabel: "Aria Agent",
      },
      environmentSwitcher: {
        label: "Environment",
        placement: "thread-header",
        activeEnvironmentId: "env-1",
      },
      stream: {
        placement: "center-column",
        tracks: ["messages", "runs"],
        live: true,
      },
      composer: {
        placement: "bottom-docked",
        scope: "active-thread",
        threadId: "thread-1",
      },
      contextPanels: [
        { id: "review", label: "Review" },
        { id: "changes", label: "Changes" },
        { id: "environment", label: "Environment" },
        { id: "job", label: "Job State" },
        { id: "approvals", label: "Approvals" },
        { id: "artifacts", label: "Artifacts" },
      ],
      defaultContextPanelId: "review",
    });
  });

  test("@aria/mobile composes remote review shell state at the package seam", () => {
    const shell = createAriaMobileShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      projects: [
        {
          project: { name: "Aria" },
          threads: [
            {
              threadId: "thread-2",
              title: "Review",
              status: "idle",
              threadType: "remote_project",
              agentId: "codex",
              approvalLabel: "2 approvals pending",
              automationLabel: "Automation queued",
              notificationLabel: "Push ready via gateway",
              attachmentLabel: "2 attachments ready",
              remoteReviewLabel: "Ready for remote review",
              connectionLabel: "Connected to Home Server",
              reconnectLabel: "Reconnect after sleep",
            },
          ],
        },
      ],
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-2",
          title: "Review",
          status: "idle",
          threadType: "remote_project",
          agentId: "codex",
          approvalLabel: "2 approvals pending",
          automationLabel: "Automation queued",
          notificationLabel: "Push ready via gateway",
          attachmentLabel: "2 attachments ready",
          remoteReviewLabel: "Ready for remote review",
          connectionLabel: "Connected to Home Server",
          reconnectLabel: "Reconnect after sleep",
        },
      },
      activeThreadContext: {
        thread: {
          threadId: "thread-2",
          threadType: "remote_project",
          approvalLabel: "2 approvals pending",
          automationLabel: "Automation queued",
          notificationLabel: "Push ready via gateway",
          attachmentLabel: "2 attachments ready",
          remoteReviewLabel: "Ready for remote review",
          connectionLabel: "Connected to Home Server",
          reconnectLabel: "Reconnect after sleep",
        },
        remoteStatusLabel: "Connected to Home Server",
      },
    });

    expect(shell.tabs).toEqual([
      { id: "aria", label: "Aria" },
      { id: "projects", label: "Projects" },
    ]);
    expect(shell.detailPresentations).toEqual([
      "bottom-sheet",
      "push-screen",
      "segmented-detail-view",
    ]);
    expect(shell.actionSections.map((section) => section.id)).toEqual([
      "approvals",
      "automation",
      "notifications",
      "attachments",
      "remote-review",
      "reconnect",
      "job-status",
    ]);
    expect(shell.projectThreads).toEqual([
      {
        projectLabel: "Aria",
        threads: [
          {
            id: "thread-2",
            title: "Review",
            projectLabel: "Aria",
            status: "Idle",
            threadType: "remote_project",
            threadTypeLabel: "Remote Project",
            environmentId: null,
            agentId: "codex",
            approvalLabel: "2 approvals pending",
            automationLabel: "Automation queued",
            notificationLabel: "Push ready via gateway",
            attachmentLabel: "2 attachments ready",
            remoteReviewLabel: "Ready for remote review",
            connectionLabel: "Connected to Home Server",
            reconnectLabel: "Reconnect after sleep",
          },
        ],
      },
    ]);
    expect(shell.initialThread).toMatchObject({
      id: "thread-2",
      projectLabel: "Aria",
      status: "Idle",
      threadType: "remote_project",
    });
    expect(shell.activeThreadContext).toMatchObject({
      threadId: "thread-2",
      threadType: "remote_project",
      threadTypeLabel: "Remote Project",
      remoteStatusLabel: "Connected to Home Server",
      connectionLabel: "Connected to Home Server",
      approvalLabel: "2 approvals pending",
      automationLabel: "Automation queued",
      notificationLabel: "Push ready via gateway",
      attachmentLabel: "2 attachments ready",
      remoteReviewLabel: "Ready for remote review",
      reconnectLabel: "Reconnect after sleep",
    });
  });
});
