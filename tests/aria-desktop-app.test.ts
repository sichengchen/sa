import { Children, isValidElement, type ReactNode } from "react";
import { describe, expect, test } from "bun:test";

import {
  AriaDesktopAppShell,
  ariaDesktopApplication,
  ariaDesktopHost,
  createAriaDesktopAppShell,
  createAriaDesktopAppShellModel,
  createAriaDesktopApplicationBootstrap,
} from "../apps/aria-desktop/src/index.js";

function collectTextContent(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) {
    return node.flatMap((entry) => collectTextContent(entry));
  }
  if (isValidElement(node)) {
    return collectTextContent((node.props as { children?: ReactNode }).children as ReactNode);
  }
  return [];
}

function childElements(element: { props: { children?: ReactNode } }) {
  return Children.toArray(element.props.children).filter(isValidElement) as Array<{
    props: { children?: ReactNode; [key: string]: unknown };
  }>;
}

function asElementWithProps(
  element: unknown,
): { props: { children?: ReactNode; [key: string]: unknown } } {
  return element as unknown as { props: { children?: ReactNode; [key: string]: unknown } };
}

describe("aria-desktop app assembly", () => {
  test("assembles the desktop app as a product-shaped surface", () => {
    expect(ariaDesktopApplication).toMatchObject({
      id: "aria-desktop",
      packageName: "aria-desktop",
      displayName: "Aria Desktop",
      surface: "desktop",
      shellPackage: "@aria/desktop",
      startup: {
        defaultSpaceId: "projects",
        defaultScreenId: "thread-list",
        defaultContextPanelId: "review",
      },
    });
    expect(ariaDesktopApplication.host).toBe(ariaDesktopHost);
    expect(ariaDesktopApplication.frame).toMatchObject({
      kind: "three-pane-workbench",
      sidebar: {
        label: "Projects",
        mode: "unified-project-thread-tree",
      },
      center: {
        defaultSpaceId: "projects",
        defaultScreenId: "thread-list",
        activeScreenId: "thread",
        threadListMode: "unified-project-thread-list",
      },
      rightRail: {
        defaultContextPanelId: "review",
      },
      composer: {
        placement: "bottom-docked",
        scope: "active-thread",
      },
    });
    expect(ariaDesktopApplication.launchModes.map((mode) => mode.id)).toEqual([
      "server-connected",
      "local-project",
    ]);
    expect(ariaDesktopApplication.sharedPackages).toContain("@aria/desktop-bridge");
    expect(ariaDesktopApplication.capabilities).toContain("local-bridge");
  });

  test("creates app bootstraps with the same host and shell assembly", () => {
    const bootstrap = createAriaDesktopApplicationBootstrap(
      { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
    );

    expect(bootstrap.application).toBe(ariaDesktopApplication);
    expect(bootstrap.host).toBe(ariaDesktopHost);
    expect(bootstrap.shell.sharedPackages).toContain("@aria/ui");
    expect(bootstrap.bootstrap.access).toMatchObject({
      serverId: "desktop",
      httpUrl: "http://127.0.0.1:7420",
      wsUrl: "ws://127.0.0.1:7420",
    });
    expect(bootstrap.bootstrap.initialThread).toMatchObject({
      id: "thread-1",
      projectLabel: "Aria",
      threadType: "local_project",
    });
  });

  test("builds a React shell view-model from application/bootstrap assembly", () => {
    const model = createAriaDesktopAppShellModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
      environments: [
        {
          hostLabel: "This Device",
          environmentLabel: "wt/main",
          mode: "local",
          target: { serverId: "desktop-local", baseUrl: "http://127.0.0.1:8123/" },
        },
      ],
      activeSpaceId: "projects",
      activeContextPanelId: "environment",
    });

    expect(model.application).toBe(ariaDesktopApplication);
    expect(model.bootstrap.application).toBe(ariaDesktopApplication);
    expect(model.bootstrap.host).toBe(ariaDesktopHost);
    expect(model.activeSpaceId).toBe("projects");
    expect(model.activeContextPanelId).toBe("environment");
    expect(model.shell.projectSidebar.projects[0]).toMatchObject({
      projectLabel: "Aria",
      threads: [
        {
          id: "thread-1",
          threadType: "local_project",
        },
      ],
    });
    expect(model.shell.activeThreadScreen?.environmentSwitcher.availableEnvironments).toEqual([
      expect.objectContaining({
        label: "This Device / wt/main",
        mode: "local",
      }),
    ]);
  });

  test("exposes React app-shell component and factory element", () => {
    const built = createAriaDesktopAppShell({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
      environments: [
        {
          hostLabel: "Home Server",
          environmentLabel: "main",
          mode: "remote",
          target: { serverId: "home", baseUrl: "https://aria.example.test/" },
        },
      ],
    });

    expect(isValidElement(built.element)).toBeTrue();
    expect(built.element.type).toBe(AriaDesktopAppShell);
    const builtElement = asElementWithProps(built.element);
    expect(builtElement.props.model).toBe(built.model);

    const rendered = AriaDesktopAppShell({ model: built.model });
    const [topChrome, workbench, statusStrip] = childElements(asElementWithProps(rendered));
    expect(topChrome.props["data-slot"]).toBe("top-chrome");
    expect(workbench.props["data-slot"]).toBe("workbench");
    expect(statusStrip.props["data-slot"]).toBe("status-strip");

    const [sidebar, center, rail] = childElements(workbench);
    expect(sidebar.props["data-slot"]).toBe("sidebar");
    expect(center.props["data-slot"]).toBe("center");
    expect(rail.props["data-slot"]).toBe("right-rail");

    const text = collectTextContent(rendered).join(" ");

    expect(text).toContain("Aria Desktop");
    expect(text).toContain("Projects");
    expect(text).toContain("Desktop thread");
    expect(text).toContain("Environment");
    expect(text).toContain("messages + runs");
    expect(text).toContain("Context Panels");
    expect(text).toContain("Home Server / main");
    expect(text.replace(/\s+/g, " ")).toContain("Placement: bottom-docked");
  });
});
