import {
  ariaDesktopContextPanels,
  ariaDesktopNavigation,
  ariaDesktopSpaces,
  createAriaDesktopShell,
  type CreateAriaDesktopShellOptions,
} from "@aria/desktop";
import type { AccessClientTarget, AriaChatController, AriaChatState } from "@aria/access-client";
import type { ReactElement, ReactNode } from "react";
import { createAriaDesktopApplicationBootstrap, createAriaDesktopAriaThread } from "./app.js";

export interface CreateAriaDesktopAppShellModelOptions {
  target: AccessClientTarget;
  initialThread?: Parameters<typeof createAriaDesktopApplicationBootstrap>[0]["initialThread"];
  servers?: CreateAriaDesktopShellOptions["servers"];
  activeServerId?: CreateAriaDesktopShellOptions["activeServerId"];
  projects?: CreateAriaDesktopShellOptions["projects"];
  environments?: CreateAriaDesktopShellOptions["environments"];
  activeThreadContext?: CreateAriaDesktopShellOptions["activeThreadContext"];
  activeSpaceId?: (typeof ariaDesktopSpaces)[number]["id"];
  activeContextPanelId?: (typeof ariaDesktopContextPanels)[number]["id"];
  ariaThreadController?: AriaChatController;
  ariaThreadState?: AriaChatState;
}

export interface AriaDesktopAppShellModel {
  application: ReturnType<typeof createAriaDesktopApplicationBootstrap>["application"];
  bootstrap: ReturnType<typeof createAriaDesktopApplicationBootstrap>;
  shell: ReturnType<typeof createAriaDesktopShell>;
  activeServerId: string;
  activeServerLabel: string;
  activeSpaceId: (typeof ariaDesktopSpaces)[number]["id"];
  activeContextPanelId: (typeof ariaDesktopContextPanels)[number]["id"];
  ariaThread: ReturnType<typeof createAriaDesktopAriaThread>;
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
  serverLabel?: string,
): CreateAriaDesktopShellOptions["activeThreadContext"] {
  if (!initialThread) {
    return undefined;
  }

  return {
    serverLabel,
    projectLabel: initialThread.project.name,
    thread: initialThread.thread,
    environmentLabel: initialThread.thread.environmentId ?? undefined,
    agentLabel: initialThread.thread.agentId ?? undefined,
  };
}

export function createAriaDesktopAppShellModel(
  options: CreateAriaDesktopAppShellModelOptions,
): AriaDesktopAppShellModel {
  const bootstrap = createAriaDesktopApplicationBootstrap({
    target: options.target,
    initialThread: options.initialThread,
    servers: options.servers,
    activeServerId: options.activeServerId,
  });
  const shell = createAriaDesktopShell({
    target: options.target,
    initialThread: options.initialThread,
    servers: options.servers,
    activeServerId: options.activeServerId,
    projects: options.projects ?? deriveProjectsFromInitialThread(options.initialThread),
    environments: options.environments,
    activeThreadContext:
      options.activeThreadContext ??
      deriveActiveThreadFromInitialThread(
        options.initialThread,
        bootstrap.bootstrap.activeServerLabel,
      ),
  });

  return {
    application: bootstrap.application,
    bootstrap,
    shell,
    activeServerId: shell.activeServerId,
    activeServerLabel: shell.activeServerLabel,
    activeSpaceId: options.activeSpaceId ?? bootstrap.application.startup.defaultSpaceId,
    activeContextPanelId:
      options.activeContextPanelId ?? bootstrap.application.startup.defaultContextPanelId,
    ariaThread: createAriaDesktopAriaThread(options.target, {
      controller: options.ariaThreadController,
      state: options.ariaThreadState,
    }),
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
          Access: {model.activeServerLabel} ({model.bootstrap.bootstrap.access.httpUrl})
        </small>
        <small data-slot="aria-thread-status">
          Aria thread:{" "}
          {model.ariaThread.state.connected ? model.ariaThread.state.sessionId : "disconnected"}
          {" | "}
          Model: {model.ariaThread.state.modelName}
        </small>
        <label
          data-slot="server-switcher"
          data-placement={model.application.frame.serverSwitcher.placement}
        >
          {model.application.frame.serverSwitcher.label}
          <select aria-label="Server switcher" defaultValue={model.activeServerId}>
            {model.shell.serverSwitcher.availableServers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.label}
              </option>
            ))}
          </select>
        </label>
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
                  {activeThreadScreen.header.threadTypeLabel} -{" "}
                  {activeThreadScreen.header.statusLabel}
                </p>
              ) : null}
              <label>
                {activeThreadScreen?.environmentSwitcher.label ?? "Environment"}
                <select
                  aria-label="Environment switcher"
                  defaultValue={activeThreadScreen?.environmentSwitcher.activeEnvironmentLabel}
                >
                  {(
                    activeThreadScreen?.environmentSwitcher.availableEnvironments ??
                    model.shell.environments
                  ).map((environment) => (
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
            <div>
              <p>
                {activeThreadScreen
                  ? activeThreadScreen.stream.tracks.join(" + ")
                  : "messages + runs"}{" "}
                (live)
              </p>
              <p>
                Aria chat messages: {model.ariaThread.state.messages.length} | Streaming:{" "}
                {model.ariaThread.state.isStreaming ? "yes" : "no"}
              </p>
            </div>,
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

export async function connectAriaDesktopAppShellModel(
  model: AriaDesktopAppShellModel,
): Promise<AriaDesktopAppShellModel> {
  await model.ariaThread.controller.connect();

  return {
    ...model,
    ariaThread: {
      ...model.ariaThread,
      state: model.ariaThread.controller.getState(),
    },
  };
}

export async function createConnectedAriaDesktopAppShellModel(
  options: CreateAriaDesktopAppShellModelOptions,
): Promise<AriaDesktopAppShellModel> {
  return connectAriaDesktopAppShellModel(createAriaDesktopAppShellModel(options));
}

export function createAriaDesktopApplicationShell(
  options: CreateAriaDesktopAppShellModelOptions,
): AriaDesktopAppShellModel {
  return createAriaDesktopAppShellModel(options);
}

export function createAriaDesktopAppShell(options: CreateAriaDesktopAppShellOptions): {
  model: AriaDesktopAppShellModel;
  element: ReactElement;
} {
  const model = createAriaDesktopAppShellModel(options);
  return {
    model,
    element: <AriaDesktopAppShell model={model} />,
  };
}

export async function createConnectedAriaDesktopAppShell(
  options: CreateAriaDesktopAppShellOptions,
): Promise<{ model: AriaDesktopAppShellModel; element: ReactElement }> {
  const model = await createConnectedAriaDesktopAppShellModel(options);

  return {
    model,
    element: <AriaDesktopAppShell model={model} />,
  };
}
