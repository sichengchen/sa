import {
  ariaDesktopContextPanels,
  ariaDesktopNavigation,
  ariaDesktopSpaces,
  createAriaDesktopShell,
  type CreateAriaDesktopShellOptions,
} from "@aria/desktop";
import type { AccessClientTarget } from "@aria/access-client";
import type { ReactElement, ReactNode } from "react";
import { createAriaDesktopApplicationBootstrap } from "./app.js";

export interface CreateAriaDesktopAppShellModelOptions {
  target: AccessClientTarget;
  initialThread?: Parameters<typeof createAriaDesktopApplicationBootstrap>[1];
  projects?: CreateAriaDesktopShellOptions["projects"];
  environments?: CreateAriaDesktopShellOptions["environments"];
  activeThreadContext?: CreateAriaDesktopShellOptions["activeThreadContext"];
  activeSpaceId?: (typeof ariaDesktopSpaces)[number]["id"];
  activeContextPanelId?: (typeof ariaDesktopContextPanels)[number]["id"];
}

export interface AriaDesktopAppShellModel {
  application: ReturnType<typeof createAriaDesktopApplicationBootstrap>["application"];
  bootstrap: ReturnType<typeof createAriaDesktopApplicationBootstrap>;
  shell: ReturnType<typeof createAriaDesktopShell>;
  activeSpaceId: (typeof ariaDesktopSpaces)[number]["id"];
  activeContextPanelId: (typeof ariaDesktopContextPanels)[number]["id"];
}

function deriveProjectsFromInitialThread(
  initialThread?: CreateAriaDesktopAppShellModelOptions["initialThread"],
): CreateAriaDesktopShellOptions["projects"] {
  if (!initialThread) {
    return undefined;
  }

  return [
    {
      project: initialThread.project,
      threads: [initialThread.thread],
    },
  ];
}

function deriveActiveThreadFromInitialThread(
  initialThread?: CreateAriaDesktopAppShellModelOptions["initialThread"],
): CreateAriaDesktopShellOptions["activeThreadContext"] {
  if (!initialThread) {
    return undefined;
  }

  return {
    projectLabel: initialThread.project.name,
    thread: initialThread.thread,
    environmentLabel: initialThread.thread.environmentId ?? undefined,
    agentLabel: initialThread.thread.agentId ?? undefined,
  };
}

export function createAriaDesktopAppShellModel(
  options: CreateAriaDesktopAppShellModelOptions,
): AriaDesktopAppShellModel {
  const bootstrap = createAriaDesktopApplicationBootstrap(options.target, options.initialThread);
  const shell = createAriaDesktopShell({
    target: options.target,
    initialThread: options.initialThread,
    projects: options.projects ?? deriveProjectsFromInitialThread(options.initialThread),
    environments: options.environments,
    activeThreadContext:
      options.activeThreadContext ?? deriveActiveThreadFromInitialThread(options.initialThread),
  });

  return {
    application: bootstrap.application,
    bootstrap,
    shell,
    activeSpaceId: options.activeSpaceId ?? bootstrap.application.startup.defaultSpaceId,
    activeContextPanelId:
      options.activeContextPanelId ?? bootstrap.application.startup.defaultContextPanelId,
  };
}

export interface AriaDesktopAppShellProps {
  model: AriaDesktopAppShellModel;
}

function section(slot: string, title: string, children: ReactNode): ReactElement {
  return (
    <section data-slot={slot}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function AriaDesktopAppShell(props: AriaDesktopAppShellProps): ReactElement {
  const { model } = props;
  const activeThreadScreen = model.shell.activeThreadScreen;
  const composerValue = activeThreadScreen
    ? `Reply in ${activeThreadScreen.composer.scope} (${activeThreadScreen.composer.threadId})`
    : "Select a thread to compose";

  return (
    <div data-app-shell={model.application.id} data-frame={model.application.frame.kind}>
      <header data-slot="top-chrome">
        <h1>{model.application.displayName}</h1>
        <p>{model.application.startup.landingDescription}</p>
        <small>
          Access: {model.bootstrap.bootstrap.access.serverId} ({model.bootstrap.bootstrap.access.httpUrl})
        </small>
        <p>
          Active space: {model.activeSpaceId} | Active panel: {model.activeContextPanelId}
        </p>
      </header>

      <main data-slot="workbench">
        <aside data-slot="sidebar">
          {section(
            "project-sidebar",
            model.shell.projectSidebar.label,
            <ul>
              {model.application.spaces.map((space) => (
                <li key={space.id}>
                  {space.label}
                  {space.id === model.activeSpaceId ? " (active)" : ""}
                </li>
              ))}
            </ul>,
          )}
          {section(
            "thread-list",
            model.shell.projectThreadListScreen.title,
            <div>
              <p>{model.shell.projectThreadListScreen.description}</p>
              <ul>
                {model.shell.projectSidebar.projects.map((project) => (
                  <li key={project.projectLabel}>
                    <strong>{project.projectLabel}</strong>
                    <ul>
                      {project.threads.map((thread) => (
                        <li key={thread.id}>
                          {thread.title} - {thread.status} - {thread.threadTypeLabel}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>,
          )}
        </aside>

        <section data-slot="center">
          {section(
            "active-thread-header",
            activeThreadScreen?.header.title ?? "No active thread",
            <div>
              <p>{activeThreadScreen?.header.projectLabel ?? "Select a project thread"}</p>
              {activeThreadScreen ? (
                <p>
                  {activeThreadScreen.header.threadTypeLabel} - {activeThreadScreen.header.statusLabel}
                </p>
              ) : null}
              <label>
                {activeThreadScreen?.environmentSwitcher.label ?? "Environment"}
                <select
                  aria-label="Environment switcher"
                  defaultValue={activeThreadScreen?.environmentSwitcher.activeEnvironmentLabel}
                >
                  {(activeThreadScreen?.environmentSwitcher.availableEnvironments ??
                    model.shell.environments).map((environment) => (
                    <option key={environment.id} value={environment.label}>
                      {environment.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>,
          )}
          {section(
            "stream",
            "Stream",
            <p>
              {activeThreadScreen ? activeThreadScreen.stream.tracks.join(" + ") : "messages + runs"} (live)
            </p>,
          )}
        </section>

        <aside data-slot="right-rail">
          {section(
            "context-panels",
            "Context Panels",
            <ul>
              {model.application.contextPanels.map((panel) => (
                <li key={panel.id}>
                  {panel.label}
                  {panel.id === model.activeContextPanelId ? " (active)" : ""}
                </li>
              ))}
            </ul>,
          )}
        </aside>
      </main>

      <footer data-slot="status-strip">
        <p>Placement: {model.application.frame.composer.placement}</p>
        <textarea readOnly value={composerValue} />
      </footer>
    </div>
  );
}

export interface CreateAriaDesktopAppShellOptions extends CreateAriaDesktopAppShellModelOptions {}

export function createAriaDesktopApplicationShell(
  options: CreateAriaDesktopAppShellModelOptions,
): AriaDesktopAppShellModel {
  return createAriaDesktopAppShellModel(options);
}

export function createAriaDesktopAppShell(
  options: CreateAriaDesktopAppShellOptions,
): { model: AriaDesktopAppShellModel; element: ReactElement } {
  const model = createAriaDesktopAppShellModel(options);
  return {
    model,
    element: <AriaDesktopAppShell model={model} />,
  };
}
