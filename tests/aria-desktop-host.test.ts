import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveHostAccessClientTarget } from "@aria/access-client";
import { createDesktopBridge } from "@aria/desktop-bridge";
import { ProjectsEngineRepository, ProjectsEngineStore } from "@aria/projects";
import {
  createAriaDesktopElectronHostBootstrap,
  createAriaDesktopHostBootstrap,
  createAriaDesktopRendererController,
  resolveAriaDesktopRendererTarget,
  runAriaDesktopElectronHost,
  startAriaDesktopRendererModel,
  switchAriaDesktopRendererModel,
} from "aria-desktop";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

async function createRepository(prefix: string): Promise<ProjectsEngineRepository> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  const store = new ProjectsEngineStore(join(dir, "aria.db"));
  await store.init();
  return new ProjectsEngineRepository(store);
}

async function seedProjectThread(repository: ProjectsEngineRepository, now: number): Promise<void> {
  repository.upsertProject({
    projectId: "project-1",
    slug: "aria",
    name: "Aria",
    description: null,
    createdAt: now,
    updatedAt: now,
  });
  repository.upsertServer({
    serverId: "server-1",
    label: "Home Server",
    relayId: null,
    directBaseUrl: "https://aria.example.test",
    createdAt: now,
    updatedAt: now,
  });
  repository.upsertWorkspace({
    workspaceId: "workspace-local",
    host: "desktop_local",
    serverId: null,
    label: "This Device",
    createdAt: now,
    updatedAt: now,
  });
  repository.upsertWorkspace({
    workspaceId: "workspace-remote",
    host: "aria_server",
    serverId: "server-1",
    label: "Home Server",
    createdAt: now,
    updatedAt: now,
  });
  repository.upsertEnvironment({
    environmentId: "env-local",
    workspaceId: "workspace-local",
    projectId: "project-1",
    label: "This Device / wt/main",
    mode: "local",
    kind: "worktree",
    locator: "/tmp/aria-main",
    createdAt: now,
    updatedAt: now,
  });
  repository.upsertEnvironment({
    environmentId: "env-remote",
    workspaceId: "workspace-remote",
    projectId: "project-1",
    label: "Home Server / wt/review",
    mode: "remote",
    kind: "worktree",
    locator: "ssh://aria/review",
    createdAt: now,
    updatedAt: now,
  });
  repository.upsertThread({
    threadId: "thread-1",
    projectId: "project-1",
    taskId: null,
    repoId: null,
    title: "Tracked thread",
    status: "running",
    threadType: "local_project",
    workspaceId: "workspace-local",
    environmentId: "env-local",
    environmentBindingId: "binding-local",
    agentId: "codex",
    createdAt: now,
    updatedAt: now,
  });
  repository.upsertThreadEnvironmentBinding({
    bindingId: "binding-local",
    threadId: "thread-1",
    projectId: "project-1",
    workspaceId: "workspace-local",
    environmentId: "env-local",
    attachedAt: now,
    detachedAt: null,
    isActive: true,
    reason: "Initial local binding",
  });
}

describe("aria-desktop host scaffold", () => {
  test("resolves renderer targets with desktop defaults", () => {
    expect(resolveAriaDesktopRendererTarget(undefined)).toEqual({
      serverId: "desktop",
      baseUrl: "http://127.0.0.1:7420/",
    });

    expect(
      resolveAriaDesktopRendererTarget({
        serverId: "relay",
        baseUrl: "https://relay.example.test/",
      }),
    ).toEqual({
      serverId: "relay",
      baseUrl: "https://relay.example.test/",
    });

    expect(
      resolveHostAccessClientTarget(
        { serverId: "relay", baseUrl: "https://relay.example.test/" },
        { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ),
    ).toEqual({
      serverId: "relay",
      baseUrl: "https://relay.example.test/",
      token: undefined,
      directBaseUrl: undefined,
      relayBaseUrl: undefined,
      directReachable: undefined,
      preferredTransportMode: undefined,
    });
  });

  test("builds a deterministic electron host bootstrap", () => {
    expect(
      createAriaDesktopElectronHostBootstrap({
        distDir: "/tmp/aria-desktop",
        devServerUrl: "http://127.0.0.1:5173/",
      }),
    ).toEqual({
      preloadPath: "/tmp/aria-desktop/electron-preload.js",
      rendererEntry: { kind: "url", value: "http://127.0.0.1:5173/" },
      window: {
        width: 1440,
        height: 960,
        minWidth: 1100,
        minHeight: 720,
      },
    });
  });

  test("runs the pure electron host seam with a fake runtime", async () => {
    const urls: string[] = [];
    const files: string[] = [];
    let activateHandler: (() => void) | undefined;
    let closeHandler: (() => void) | undefined;
    let windowCount = 0;
    let quitCalled = false;

    const bootstrap = await runAriaDesktopElectronHost(
      {
        platform: "linux",
        whenReady: async () => {},
        onActivate(handler) {
          activateHandler = handler;
        },
        onWindowAllClosed(handler) {
          closeHandler = handler;
        },
        createWindow() {
          windowCount += 1;
          return {
            loadURL(url) {
              urls.push(url);
            },
            loadFile(filePath) {
              files.push(filePath);
            },
          };
        },
        getAllWindows() {
          return [];
        },
        quit() {
          quitCalled = true;
        },
      },
      {
        distDir: "/tmp/aria-desktop",
        devServerUrl: "http://127.0.0.1:5173/",
      },
    );

    expect(bootstrap.rendererEntry).toEqual({
      kind: "url",
      value: "http://127.0.0.1:5173/",
    });
    expect(windowCount).toBe(1);
    expect(urls).toEqual(["http://127.0.0.1:5173/"]);

    activateHandler?.();
    expect(windowCount).toBe(2);

    closeHandler?.();
    expect(quitCalled).toBe(true);
    expect(files).toEqual([]);
  });

  test("creates bridge-backed projects control in the desktop host bootstrap", async () => {
    const repository = await createRepository("aria-desktop-host-");
    const now = Date.now();
    await seedProjectThread(repository, now);

    const bridge = createDesktopBridge({ repository });
    const bootstrap = createAriaDesktopHostBootstrap({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      desktopBridge: bridge,
    });
    const switched = bootstrap.projectsControl?.switchThreadEnvironment("thread-1", "env-remote");

    expect(bootstrap.projectsControl?.bridge).toBe(bridge);
    expect(switched).toMatchObject({
      threadId: "thread-1",
      threadType: "remote_project",
      workspaceId: "workspace-remote",
      environmentId: "env-remote",
    });
    expect(repository.getActiveThreadEnvironmentBinding("thread-1")?.environmentId).toBe(
      "env-remote",
    );

    repository.close();
  });

  test("starts a desktop renderer model with recent sessions loaded", async () => {
    const connectedState = {
      connected: true,
      sessionId: "desktop:session-1",
      sessionStatus: "resumed" as const,
      approvalMode: "ask" as const,
      securityMode: "default" as const,
      securityModeRemainingTTL: null,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const controller = {
      getState: () => connectedState,
      connect: async () => connectedState,
      sendMessage: async () => connectedState,
      stop: async () => connectedState,
      openSession: async () => connectedState,
      approveToolCall: async () => connectedState,
      acceptToolCallForSession: async () => connectedState,
      answerQuestion: async () => connectedState,
      listSessions: async () => [
        {
          sessionId: "desktop:live-1",
          connectorType: "tui",
          connectorId: "desktop",
          archived: false,
        },
      ],
      listArchivedSessions: async () => [
        {
          sessionId: "desktop:archived-1",
          connectorType: "tui",
          connectorId: "desktop",
          archived: true,
          preview: "Archived",
          summary: "Archived summary",
        },
      ],
      searchSessions: async () => [],
    };

    const model = await startAriaDesktopRendererModel({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      ariaThreadController: controller as any,
    });

    expect(model.ariaThread.state.connected).toBe(true);
    expect(model.ariaRecentSessions.map((session) => session.sessionId)).toEqual([
      "desktop:live-1",
      "desktop:archived-1",
    ]);
  });

  test("switches a desktop renderer model to another server", async () => {
    const relayState = {
      connected: true,
      sessionId: "relay:session-1",
      sessionStatus: "resumed" as const,
      approvalMode: "ask" as const,
      securityMode: "default" as const,
      securityModeRemainingTTL: null,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const desktopState = {
      ...relayState,
      sessionId: "desktop:session-1",
    };
    const controllers = new Map([
      [
        "desktop",
        {
          state: desktopState,
          recent: [
            {
              sessionId: "desktop:live",
              connectorType: "tui",
              connectorId: "desktop",
              archived: false,
            },
          ],
        },
      ],
      [
        "relay",
        {
          state: relayState,
          recent: [
            {
              sessionId: "relay:live",
              connectorType: "tui",
              connectorId: "relay",
              archived: true,
              preview: "Relay",
              summary: "Relay",
            },
          ],
        },
      ],
    ]);
    const factory = (target: { serverId: string }) => {
      const entry = controllers.get(target.serverId)!;
      return {
        getState: () => entry.state,
        connect: async () => entry.state,
        sendMessage: async () => entry.state,
        stop: async () => entry.state,
        openSession: async () => entry.state,
        approveToolCall: async () => entry.state,
        acceptToolCallForSession: async () => entry.state,
        answerQuestion: async () => entry.state,
        listSessions: async () => entry.recent as any,
        listArchivedSessions: async () => [],
        searchSessions: async () => [],
      };
    };

    const model = await startAriaDesktopRendererModel({
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
      createAriaThreadController: factory as any,
    });

    const switched = await switchAriaDesktopRendererModel(model, "relay");
    expect(switched.activeServerId).toBe("relay");
    expect(switched.activeServerLabel).toBe("Relay Mirror");
    expect(switched.ariaThread.state.sessionId).toBe("relay:session-1");
    expect(switched.ariaRecentSessions.map((session) => session.sessionId)).toEqual(["relay:live"]);
  });

  test("exposes a pure desktop renderer controller", async () => {
    let state: any = {
      connected: true,
      sessionId: "desktop:session-1",
      sessionStatus: "resumed" as const,
      approvalMode: "ask" as const,
      securityMode: "default" as const,
      securityModeRemainingTTL: null,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [{ role: "assistant" as const, content: "hello" }],
      streamingText: "",
      isStreaming: false,
      pendingApproval: {
        toolCallId: "tool-1",
        toolName: "exec",
        args: { command: "rm -rf tmp" },
      },
      pendingQuestion: {
        questionId: "question-1",
        question: "Ship it?",
        options: ["Yes", "No"],
      },
      lastError: null,
    };
    const controller = createAriaDesktopRendererController({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      environments: [
        {
          environmentId: "desktop-main",
          hostLabel: "This Device",
          environmentLabel: "main",
          mode: "local",
          target: {
            serverId: "desktop-local",
            baseUrl: "http://127.0.0.1:8123/",
          },
        },
        {
          environmentId: "server-review",
          hostLabel: "Home Server",
          environmentLabel: "wt/review",
          mode: "remote",
          target: {
            serverId: "home",
            baseUrl: "https://aria.example.test/",
          },
        },
      ],
      projects: [
        {
          project: { name: "Aria" },
          threads: [
            {
              threadId: "thread-1",
              title: "Active thread",
              status: "running",
              threadType: "local_project",
              environmentId: "desktop-main",
              agentId: "codex",
            },
            {
              threadId: "thread-2",
              title: "Review thread",
              status: "idle",
              threadType: "local_project",
              environmentId: "desktop-review",
              agentId: "codex",
            },
          ],
        },
      ],
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Active thread",
          status: "running",
          threadType: "local_project",
          environmentId: "desktop-main",
          agentId: "codex",
        },
      },
      createAriaThreadController: (() => ({
        getState: () => state,
        connect: async () => state,
        sendMessage: async () => {
          state = {
            ...state,
            messages: [...state.messages, { role: "assistant" as const, content: "sent" }],
          };
          return state;
        },
        stop: async () => {
          state = {
            ...state,
            messages: [
              ...state.messages,
              {
                role: "tool" as const,
                content: "Stopped by user",
                toolName: "system",
              },
            ],
          };
          return state;
        },
        openSession: async () => state,
        approveToolCall: async () => {
          state = { ...state, pendingApproval: null };
          return state;
        },
        acceptToolCallForSession: async () => {
          state = { ...state, pendingApproval: null };
          return state;
        },
        answerQuestion: async () => {
          state = {
            ...state,
            pendingQuestion: null,
            messages: [
              ...state.messages,
              {
                role: "tool" as const,
                content: "Answer: Yes",
                toolName: "ask_user",
              },
            ],
          };
          return state;
        },
        listSessions: async () => [],
        listArchivedSessions: async () => [],
        searchSessions: async () => [],
      })) as any,
    });

    const started = await controller.start();
    expect(started.ariaThread.state.sessionId).toBe("desktop:session-1");
    expect(controller.getModel().ariaThread.state.messages.at(-1)?.content).toBe("hello");

    const selected = await controller.selectThread("thread-2");
    expect(selected.shell.activeThreadScreen?.header.title).toBe("Review thread");
    expect(selected.shell.activeThreadScreen?.header.projectLabel).toBe("Aria");
    expect(controller.getModel().ariaThread.state.sessionId).toBe("desktop:session-1");

    const switchedEnvironment = await controller.selectEnvironment("server-review");
    expect(
      switchedEnvironment.shell.activeThreadScreen?.environmentSwitcher.activeEnvironmentId,
    ).toBe("server-review");
    expect(switchedEnvironment.shell.activeThreadScreen?.header.environmentLabel).toBe(
      "Home Server / wt/review",
    );
    expect(switchedEnvironment.shell.activeThreadScreen?.header.threadType).toBe("remote_project");

    const sent = await controller.sendMessage("hi");
    expect(sent.ariaThread.state.messages.at(-1)?.content).toBe("sent");

    const searched = await controller.searchSessions("archived");
    expect(searched.ariaRecentSessions).toEqual([]);

    const stopped = await controller.stop();
    expect(stopped.ariaThread.state.messages.at(-1)?.content).toBe("Stopped by user");

    const approved = await controller.approveToolCall("tool-1", true);
    expect(approved.ariaThread.state.pendingApproval).toBeNull();

    const answered = await controller.answerQuestion("question-1", "Yes");
    expect(answered.ariaThread.state.pendingQuestion).toBeNull();
    expect(answered.ariaThread.state.messages.at(-1)?.content).toBe("Answer: Yes");
  });

  test("uses a desktop bridge to switch thread environments by default", async () => {
    const repository = await createRepository("aria-desktop-renderer-");
    const now = Date.now();
    await seedProjectThread(repository, now);

    const state = {
      connected: true,
      sessionId: "desktop:session-1",
      sessionStatus: "resumed" as const,
      approvalMode: "ask" as const,
      securityMode: "default" as const,
      securityModeRemainingTTL: null,
      modelName: "sonnet",
      agentName: "Esperta Aria",
      messages: [],
      streamingText: "",
      isStreaming: false,
      pendingApproval: null,
      pendingQuestion: null,
      lastError: null,
    };
    const bridge = createDesktopBridge({ repository });
    const ariaThreadController = {
      getState: () => state,
      connect: async () => state,
      sendMessage: async () => state,
      stop: async () => state,
      openSession: async () => state,
      approveToolCall: async () => state,
      acceptToolCallForSession: async () => state,
      answerQuestion: async () => state,
      listSessions: async () => [],
      listArchivedSessions: async () => [],
      searchSessions: async () => [],
    };
    const controller = createAriaDesktopRendererController({
      target: { serverId: "desktop", baseUrl: "http://127.0.0.1:7420/" },
      desktopBridge: bridge,
      environments: [
        {
          environmentId: "env-local",
          hostLabel: "This Device",
          environmentLabel: "wt/main",
          mode: "local",
          target: {
            serverId: "desktop-local",
            baseUrl: "http://127.0.0.1:8123/",
          },
        },
        {
          environmentId: "env-remote",
          hostLabel: "Home Server",
          environmentLabel: "wt/review",
          mode: "remote",
          target: {
            serverId: "home",
            baseUrl: "https://aria.example.test/",
          },
        },
      ],
      projects: [
        {
          project: { name: "Aria" },
          threads: [
            {
              threadId: "thread-1",
              title: "Tracked thread",
              status: "running",
              threadType: "local_project",
              environmentId: "env-local",
              agentId: "codex",
            },
          ],
        },
      ],
      initialThread: {
        project: { name: "Aria" },
        thread: {
          threadId: "thread-1",
          title: "Tracked thread",
          status: "running",
          threadType: "local_project",
          environmentId: "env-local",
          agentId: "codex",
        },
      },
      createAriaThreadController: (() => ariaThreadController) as any,
    });

    await controller.start();
    expect(typeof controller.getModel().sourceOptions.switchThreadEnvironment).toBe("function");

    const switched = await controller.selectEnvironment("env-remote");

    expect(switched.shell.activeThreadScreen?.environmentSwitcher.activeEnvironmentId).toBe(
      "env-remote",
    );
    expect(switched.shell.activeThreadScreen?.header.threadType).toBe("remote_project");
    expect(switched.sourceOptions.projects?.[0]?.threads[0]).toMatchObject({
      threadId: "thread-1",
      threadType: "remote_project",
      workspaceId: "workspace-remote",
      environmentId: "env-remote",
    });
    expect(repository.getThread("thread-1")).toMatchObject({
      threadId: "thread-1",
      threadType: "remote_project",
      workspaceId: "workspace-remote",
      environmentId: "env-remote",
    });

    repository.close();
  });
});
