import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ariaDesktopApp,
  ariaDesktopSpaces,
  createAriaDesktopEnvironmentOption,
  createAriaDesktopBootstrap,
  createAriaDesktopSidebarProjects,
} from "@aria/desktop";
import {
  ariaMobileApp,
  ariaMobileDetailPresentations,
  ariaMobileTabs,
  createAriaMobileBootstrap,
  createAriaMobileProjectThreads,
} from "@aria/mobile";
import * as desktopAppModule from "../apps/aria-desktop/src/index.js";
import * as mobileAppModule from "../apps/aria-mobile/src/index.js";

function readRepoFile(relativePath: string): string {
  return readFileSync(join(import.meta.dir, "..", relativePath), "utf-8");
}

const PHASE9_LEDGER_PATH = "docs/development/phase-9-architecture-truth-table.md";

describe("Phase 8 client shell packages", () => {
  test("@aria/desktop stays the target desktop shell over shared client, UI, and project seams", () => {
    const bootstrap = createAriaDesktopBootstrap(
      { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      {
        project: { name: "Aria" },
        thread: { threadId: "thread-1", title: "Desktop shell", status: "running" },
      },
    );

    expect(ariaDesktopApp.sharedPackages).toEqual([
      "@aria/access-client",
      "@aria/desktop-bridge",
      "@aria/ui",
      "@aria/projects",
      "@aria/agents-coding",
      "@aria/protocol",
    ]);
    expect(bootstrap.access).toMatchObject({
      serverId: "desktop",
      httpUrl: "http://127.0.0.1:7420",
      wsUrl: "ws://127.0.0.1:7420",
    });
    expect(bootstrap.initialThread?.status).toBe("Running");

    expect(ariaDesktopSpaces).toEqual([
      { id: "aria", label: "Aria" },
      { id: "projects", label: "Projects" },
    ]);

    expect(
      createAriaDesktopSidebarProjects([
        {
          project: { name: "Aria" },
          threads: [
            { threadId: "thread-1", title: "Desktop shell", status: "running" },
            { threadId: "thread-3", title: "Approvals", status: "idle" },
          ],
        },
      ]),
    ).toEqual([
      {
        projectLabel: "Aria",
        threads: [
          {
            id: "thread-1",
            title: "Desktop shell",
            projectLabel: "Aria",
            status: "Running",
          },
          {
            id: "thread-3",
            title: "Approvals",
            projectLabel: "Aria",
            status: "Idle",
          },
        ],
      },
    ]);

    expect(
      createAriaDesktopEnvironmentOption({
        hostLabel: "This Device",
        environmentLabel: "wt/feature-x",
        mode: "local",
        target: { serverId: "desktop-local", baseUrl: "http://127.0.0.1:8123/" },
      }),
    ).toMatchObject({
      id: "desktop-local:wt/feature-x",
      label: "This Device / wt/feature-x",
      mode: "local",
      access: {
        serverId: "desktop-local",
        httpUrl: "http://127.0.0.1:8123",
        wsUrl: "ws://127.0.0.1:8123",
      },
    });
  });

  test("@aria/mobile stays the remote-first target shell over shared client, UI, and project seams", () => {
    const bootstrap = createAriaMobileBootstrap(
      { serverId: "mobile", baseUrl: "https://aria.example.test/" },
      {
        project: { name: "Aria" },
        thread: { threadId: "thread-2", title: "Mobile shell", status: "idle" },
      },
    );

    expect(ariaMobileApp.sharedPackages).toEqual([
      "@aria/access-client",
      "@aria/ui",
      "@aria/projects",
      "@aria/protocol",
    ]);
    expect(ariaMobileApp.capabilities).not.toContain("local-bridge");
    expect(bootstrap.access).toMatchObject({
      serverId: "mobile",
      httpUrl: "https://aria.example.test",
      wsUrl: "wss://aria.example.test",
    });
    expect(bootstrap.initialThread?.projectLabel).toBe("Aria");

    expect(ariaMobileTabs).toEqual([
      { id: "aria", label: "Aria" },
      { id: "projects", label: "Projects" },
    ]);
    expect(ariaMobileDetailPresentations).toEqual([
      "bottom-sheet",
      "push-screen",
      "segmented-detail-view",
    ]);
    expect(
      createAriaMobileProjectThreads([
        {
          project: { name: "Aria" },
          threads: [{ threadId: "thread-2", title: "Mobile shell", status: "idle" }],
        },
      ]),
    ).toEqual([
      {
        projectLabel: "Aria",
        threads: [
          {
            id: "thread-2",
            title: "Mobile shell",
            projectLabel: "Aria",
            status: "Idle",
          },
        ],
      },
    ]);
  });

  test("desktop and mobile app entrypoints stay aligned with the current target shell contracts", () => {
    expect(desktopAppModule).toMatchObject({
      ariaDesktopApp,
      createAriaDesktopBootstrap,
      createAriaDesktopEnvironmentOption,
      createAriaDesktopSidebarProjects,
    });
    expect(mobileAppModule).toMatchObject({
      ariaMobileApp,
      createAriaMobileBootstrap,
      createAriaMobileProjectThreads,
    });

    const desktopMobileDoc = readRepoFile("docs/new-architecture/desktop-and-mobile.md");
    const truthTableDoc = readRepoFile(PHASE9_LEDGER_PATH);

    expect(desktopMobileDoc).toContain("hybrid target shells");
    expect(desktopMobileDoc).not.toContain("real thin shells");
    expect(truthTableDoc).toContain(
      "| `apps/aria-desktop` | `hybrid target shell` | `apps/aria-desktop/*` |",
    );
    expect(truthTableDoc).toContain(
      "| `apps/aria-mobile` | `hybrid target shell` | `apps/aria-mobile/*` |",
    );
  });
});
