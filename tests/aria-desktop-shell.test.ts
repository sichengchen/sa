import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, test } from "bun:test";

import {
  AriaDesktopAppShell,
  AriaDesktopApplicationRoot,
  createAriaDesktopApplicationShell,
  createAriaDesktopApplicationRoot,
  type AriaDesktopAppShellModel,
} from "aria-desktop";

type ElementWithProps = {
  props: { children?: ReactNode; [key: string]: unknown };
};

function asElementWithProps(element: unknown): ElementWithProps {
  return element as ElementWithProps;
}

function childElements(element: ReactElement | ElementWithProps) {
  return Children.toArray(asElementWithProps(element).props.children)
    .filter(isValidElement)
    .map(asElementWithProps);
}

describe("aria-desktop React shell", () => {
  test("builds an app shell element tree from the desktop assembly model", () => {
    const model = createAriaDesktopApplicationShell({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      projects: [
        {
          project: { name: "Aria" },
          threads: [
            {
              threadId: "thread-1",
              title: "Desktop thread",
              status: "running",
              threadType: "local_project",
              environmentId: "desktop-main",
              agentId: "codex",
            },
          ],
        },
      ],
      environments: [
        {
          environmentId: "desktop-main",
          hostLabel: "This Device",
          environmentLabel: "desktop-main",
          mode: "local",
          target: {
            serverId: "desktop-local",
            baseUrl: "http://127.0.0.1:8123/",
          },
        },
      ],
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
      activeThreadContext: {
        projectLabel: "Aria",
        thread: {
          threadId: "thread-1",
          title: "Desktop thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
        environmentLabel: "This Device / desktop-main",
        agentLabel: "Codex",
      },
    });

    const rendered = AriaDesktopAppShell({ model });
    const renderedElement = asElementWithProps(rendered);
    const [topChrome, workbench, statusStrip] = childElements(rendered);

    expect(rendered.type).toBe("div");
    expect(renderedElement.props["data-app-shell"]).toBe("aria-desktop");
    expect(renderedElement.props["data-frame"]).toBe("three-pane-workbench");
    expect(topChrome.props["data-slot"]).toBe("top-chrome");
    expect(workbench.props["data-slot"]).toBe("workbench");
    expect(statusStrip.props["data-slot"]).toBe("status-strip");

    const [sidebar, center, rail] = childElements(workbench);
    expect(sidebar.props["data-slot"]).toBe("sidebar");
    expect(center.props["data-slot"]).toBe("center");
    expect(rail.props["data-slot"]).toBe("right-rail");

    const sidebarSections = childElements(sidebar);
    expect(sidebarSections.map((section) => section.props["data-slot"])).toEqual([
      "project-sidebar",
      "thread-list",
    ]);
    expect(sidebarSections[0].props.children).toBeTruthy();

    const centerSections = childElements(center);
    expect(centerSections.map((section) => section.props["data-slot"])).toEqual([
      "active-thread-header",
      "stream",
    ]);
    expect(centerSections[0].props.children).toBeTruthy();
    expect(centerSections[1].props.children).toBeTruthy();

    const railSections = childElements(rail);
    expect(railSections.map((section) => section.props["data-slot"])).toEqual(["context-panels"]);
    expect(railSections[0].props.children).toBeTruthy();
  });

  test("routes the application root through the desktop shell component", () => {
    const root = createAriaDesktopApplicationRoot({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-2",
          title: "Desktop root",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
    });

    expect(root.type).toBe(AriaDesktopAppShell);
    const rootProps = asElementWithProps(root);
    const model = rootProps.props.model as AriaDesktopAppShellModel;
    expect(model.shell.projectThreadListScreen.title).toBe("Unified project threads");

    const rendered = AriaDesktopApplicationRoot({
      model,
    });
    expect(rendered.type).toBe(AriaDesktopAppShell);
    const shellRendered = AriaDesktopAppShell({ model });
    expect(asElementWithProps(shellRendered).props["data-app-shell"]).toBe("aria-desktop");
  });
});
