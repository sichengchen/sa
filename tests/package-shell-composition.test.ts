import { describe, expect, test } from "bun:test";

import {
  ariaServerApp,
  createAriaServerBootstrap,
} from "@aria/server";
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
    expect(ariaServerApp.sharedPackages).toEqual([
      "@aria/runtime",
      "@aria/gateway",
    ]);
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
          hostLabel: "This Device",
          environmentLabel: "wt/main",
          mode: "local",
          target: { serverId: "desktop-local", baseUrl: "http://127.0.0.1:8123/" },
        },
      ],
      projects: [
        {
          project: { name: "Aria" },
          threads: [{ threadId: "thread-1", title: "Inbox", status: "running" }],
        },
      ],
      initialThread: {
        project: { name: "Aria" },
        thread: { threadId: "thread-1", title: "Inbox", status: "running" },
      },
    });

    expect(shell.spaces).toEqual([
      { id: "aria", label: "Aria" },
      { id: "projects", label: "Projects" },
    ]);
    expect(shell.environments).toMatchObject([
      {
        id: "desktop-local:wt/main",
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
          },
        ],
      },
    ]);
    expect(shell.initialThread).toMatchObject({
      id: "thread-1",
      projectLabel: "Aria",
      status: "Running",
    });
  });

  test("@aria/mobile composes remote review shell state at the package seam", () => {
    const shell = createAriaMobileShell({
      target: { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      projects: [
        {
          project: { name: "Aria" },
          threads: [{ threadId: "thread-2", title: "Review", status: "idle" }],
        },
      ],
      initialThread: {
        project: { name: "Aria" },
        thread: { threadId: "thread-2", title: "Review", status: "idle" },
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
    expect(shell.projectThreads).toEqual([
      {
        projectLabel: "Aria",
        threads: [
          {
            id: "thread-2",
            title: "Review",
            projectLabel: "Aria",
            status: "Idle",
          },
        ],
      },
    ]);
    expect(shell.initialThread).toMatchObject({
      id: "thread-2",
      projectLabel: "Aria",
      status: "Idle",
    });
  });
});
