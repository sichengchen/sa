import type { ReactElement } from "react";
import {
  ariaMobileActionSections,
  ariaMobileTabs,
  type AriaMobileShell,
  type CreateAriaMobileShellOptions,
} from "@aria/mobile";
import type { AccessClientTarget } from "@aria/access-client";
import {
  ariaMobileApplication,
  ariaMobileNavigation,
  createAriaMobileApplicationBootstrap,
  createAriaMobileAppShell,
  type AriaMobileApplicationBootstrap,
  type AriaMobileAppShell,
  type AriaMobileNavigation,
} from "./app.js";

export interface AriaMobileApplicationShellProps {
  shell: AriaMobileAppShell;
  navigation?: AriaMobileNavigation;
}

function renderServerSwitcher(shell: AriaMobileAppShell): ReactElement {
  return (
    <section data-slot="server-switcher" data-placement={shell.app.serverSwitcher.placement}>
      <h2>{shell.app.serverSwitcher.label}</h2>
      <p>Active: {shell.activeServerLabel}</p>
      <select aria-label="Server switcher" defaultValue={shell.activeServerId}>
        {shell.serverSwitcher.availableServers.map((server) => (
          <option key={server.id} value={server.id}>
            {server.label}
          </option>
        ))}
      </select>
    </section>
  );
}

function renderThreadSignals(shell: AriaMobileShell): ReactElement {
  const activeThread = shell.activeThreadContext;

  return (
    <section>
      <h2>Active Thread</h2>
      <p>{activeThread?.threadTypeLabel ?? "No active thread"}</p>
      <dl>
        <div>
          <dt>Remote status</dt>
          <dd>{activeThread?.remoteStatusLabel ?? "Disconnected"}</dd>
        </div>
        <div>
          <dt>Connection</dt>
          <dd>{activeThread?.connectionLabel ?? "Server-connected"}</dd>
        </div>
        <div>
          <dt>Approvals</dt>
          <dd>{activeThread?.approvalLabel ?? "None"}</dd>
        </div>
        <div>
          <dt>Automation</dt>
          <dd>{activeThread?.automationLabel ?? "Idle"}</dd>
        </div>
        <div>
          <dt>Remote review</dt>
          <dd>{activeThread?.remoteReviewLabel ?? "Ready"}</dd>
        </div>
        <div>
          <dt>Reconnect</dt>
          <dd>{activeThread?.reconnectLabel ?? "Available"}</dd>
        </div>
      </dl>
    </section>
  );
}

export function AriaMobileApplicationShell(props: AriaMobileApplicationShellProps): ReactElement {
  const navigation = props.navigation ?? ariaMobileNavigation;
  const activeThread = props.shell.activeThreadContext;

  return (
    <div
      data-app-id={ariaMobileApplication.id}
      data-surface={ariaMobileApplication.surface}
      data-shell-package={ariaMobileApplication.shellPackage}
      data-layout="stacked-mobile-shell"
      data-remote-first="true"
      data-active-tab-id={activeThread ? "projects" : "aria"}
    >
      <header>
        <h1>{ariaMobileApplication.displayName}</h1>
        <p>{ariaMobileApplication.startup.landingDescription}</p>
        <small>Remote-first stacked shell with approvals, reconnect, and project review.</small>
        {renderServerSwitcher(props.shell)}
      </header>

      <nav aria-label="Primary tabs" data-tabs={ariaMobileTabs.length}>
        {navigation.tabs.map((tab) => (
          <span key={tab.id} data-tab-id={tab.id}>
            {tab.label}
          </span>
        ))}
      </nav>

      <main>
        <section data-space-id="aria">
          <h2>Aria</h2>
          <p>Server chat, inbox, automations, and connectors stay in the remote control plane.</p>
          <p>
            Aria thread:{" "}
            {props.shell.ariaThread.state.connected
              ? props.shell.ariaThread.state.sessionId
              : "disconnected"}
            {" | "}
            Model: {props.shell.ariaThread.state.modelName}
          </p>
          <p>
            Transcript items: {props.shell.ariaThread.state.messages.length} | Streaming:{" "}
            {props.shell.ariaThread.state.isStreaming ? "yes" : "no"}
          </p>
          <p>
            Latest Aria message:{" "}
            {props.shell.ariaThread.state.messages.at(-1)?.content ?? "No transcript yet"}
          </p>
          {props.shell.ariaThread.state.streamingText ? (
            <p>Streaming text: {props.shell.ariaThread.state.streamingText}</p>
          ) : null}
          {props.shell.ariaThread.state.lastError ? (
            <p>Error: {props.shell.ariaThread.state.lastError}</p>
          ) : null}
          <ul>
            {navigation.spaces
              .find((space) => space.id === "aria")
              ?.screens.map((screen) => (
                <li key={screen.id} data-screen-id={screen.id}>
                  {screen.label}
                </li>
              ))}
          </ul>
        </section>

        <section data-space-id="projects">
          <h2>Projects</h2>
          <p>{props.shell.projectThreads.length} project groups in the stacked thread queue.</p>
          <div
            data-thread-list-mode={props.shell.projectThreads.length ? "project-first" : "empty"}
          >
            {props.shell.projectThreads.map((project) => (
              <article key={project.projectLabel} data-project-label={project.projectLabel}>
                <h3>{project.projectLabel}</h3>
                <ul>
                  {project.threads.map((thread) => (
                    <li key={thread.id} data-thread-id={thread.id}>
                      {thread.title} - {thread.status} - {thread.threadTypeLabel}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          {renderThreadSignals(props.shell)}
        </section>
      </main>

      <footer data-action-count={ariaMobileActionSections.length}>
        {ariaMobileActionSections.map((section) => (
          <span key={section.id} data-action-id={section.id}>
            {section.label}
          </span>
        ))}
      </footer>
    </div>
  );
}

export interface CreateAriaMobileApplicationShellOptions extends CreateAriaMobileShellOptions {
  navigation?: AriaMobileNavigation;
}

export function createAriaMobileApplicationShell(
  options: CreateAriaMobileApplicationShellOptions,
): ReactElement {
  return (
    <AriaMobileApplicationShell
      shell={createAriaMobileAppShell(options)}
      navigation={options.navigation}
    />
  );
}

export interface AriaMobileApplicationShellBootstrap {
  application: typeof ariaMobileApplication;
  shell: typeof ariaMobileApplication;
  bootstrap: AriaMobileApplicationBootstrap;
}

interface AriaMobileApplicationShellBootstrapOptions {
  target: AccessClientTarget;
  initialThread?: CreateAriaMobileShellOptions["initialThread"];
  servers?: CreateAriaMobileShellOptions["servers"];
  activeServerId?: CreateAriaMobileShellOptions["activeServerId"];
}

export function createAriaMobileApplicationShellBootstrap(
  options: AriaMobileApplicationShellBootstrapOptions,
): AriaMobileApplicationShellBootstrap {
  const bootstrap = createAriaMobileApplicationBootstrap(options);

  return {
    application: ariaMobileApplication,
    shell: ariaMobileApplication,
    bootstrap,
  };
}
