import { describe, expect, test } from "bun:test";

import {
  buildAccessClientConfig,
  createAriaChatController,
  buildAccessClientTargetRoster,
  buildClientProjectThreadSummary,
} from "@aria/access-client";
import { buildLocalAccessClientOptions } from "@aria/access-client/local";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createProjectServerRoster,
  createProjectThreadListItem,
  createStatusBadgeLabel,
  describeUiEngineEvent,
} from "@aria/ui";

import { ariaDesktopApplication, createAriaDesktopApplicationBootstrap } from "aria-desktop";
import { ariaMobileApplication, createAriaMobileApplicationBootstrap } from "aria-mobile";

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
          label: "Published Gateway",
          target: { serverId: "published", baseUrl: "https://gateway.example.test/" },
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
          label: "Published Gateway",
          target: { serverId: "published", baseUrl: "https://gateway.example.test/" },
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

  test("builds local access client options from discovery and token files", async () => {
    const runtimeHome = await mkdtemp(join(tmpdir(), "aria-access-client-"));

    try {
      await writeFile(join(runtimeHome, "engine.url"), "http://127.0.0.1:8123\n");
      await writeFile(join(runtimeHome, "engine.token"), "secret-token\n");

      expect(buildLocalAccessClientOptions(runtimeHome)).toEqual({
        httpUrl: "http://127.0.0.1:8123",
        wsUrl: "ws://127.0.0.1:8124",
        token: "secret-token",
      });
    } finally {
      await rm(runtimeHome, { recursive: true, force: true });
    }
  });

  test("drives a live aria chat controller from health, session, and stream events", async () => {
    const events = [
      { type: "text_delta", delta: "Hello" },
      { type: "text_delta", delta: " world" },
      { type: "done", stopReason: "end_turn" },
    ];

    const controller = createAriaChatController(
      {
        health: {
          ping: {
            query: async () => ({ model: "sonnet", agentName: "Esperta Aria" }),
          },
        },
        session: {
          getLatest: {
            query: async () => null,
          },
          create: {
            mutate: async () => ({ session: { id: "tui:session-1" } }),
          },
        },
        chat: {
          history: {
            query: async () => ({ messages: [], archived: false }),
          },
          stream: {
            subscribe(_input, handlers) {
              for (const event of events) {
                handlers.onData(event);
              }
              handlers.onComplete();
            },
          },
        },
        tool: {
          config: {
            query: async () => ({ mode: "ask" as const }),
          },
        },
        securityMode: {
          get: {
            query: async () => ({
              mode: "default" as const,
              remainingTTL: null,
            }),
          },
        },
      },
      { connectorType: "tui", prefix: "tui" },
    );

    await controller.connect();
    const finalState = await controller.sendMessage("hi");

    expect(finalState.connected).toBe(true);
    expect(finalState.sessionId).toBe("tui:session-1");
    expect(finalState.sessionStatus).toBe("created");
    expect(finalState.approvalMode).toBe("ask");
    expect(finalState.securityMode).toBe("default");
    expect(finalState.modelName).toBe("sonnet");
    expect(finalState.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello world" },
    ]);
    expect(finalState.streamingText).toBe("");
    expect(finalState.isStreaming).toBe(false);
  });

  test("resumes an existing aria chat session before creating a new one", async () => {
    const controller = createAriaChatController(
      {
        health: {
          ping: {
            query: async () => ({ model: "sonnet", agentName: "Esperta Aria" }),
          },
        },
        session: {
          getLatest: {
            query: async () => ({ id: "tui:session-existing" }),
          },
          create: {
            mutate: async () => {
              throw new Error("create should not be called when latest session exists");
            },
          },
        },
        chat: {
          stream: {
            subscribe() {
              return;
            },
          },
        },
      },
      { connectorType: "tui", prefix: "tui" },
    );

    const connected = await controller.connect();
    expect(connected.sessionId).toBe("tui:session-existing");
    expect(connected.sessionStatus).toBe("resumed");
  });

  test("hydrates transcript history when resuming an aria chat session", async () => {
    const controller = createAriaChatController(
      {
        health: {
          ping: {
            query: async () => ({ model: "sonnet", agentName: "Esperta Aria" }),
          },
        },
        session: {
          getLatest: {
            query: async () => ({ id: "tui:session-existing" }),
          },
          create: {
            mutate: async () => {
              throw new Error("create should not be called when latest session exists");
            },
          },
        },
        chat: {
          history: {
            query: async () => ({
              archived: true,
              messages: [
                { role: "user", content: "Previous question" },
                { role: "assistant", content: "Previous answer" },
              ],
            }),
          },
          stream: {
            subscribe() {
              return;
            },
          },
        },
        tool: {
          config: {
            query: async () => ({ mode: "never" as const }),
          },
        },
        securityMode: {
          get: {
            query: async () => ({
              mode: "trusted" as const,
              remainingTTL: 900,
            }),
          },
        },
      },
      { connectorType: "tui", prefix: "tui" },
    );

    const connected = await controller.connect();
    expect(connected.sessionStatus).toBe("resumed");
    expect(connected.messages).toEqual([
      { role: "user", content: "Previous question", toolName: undefined },
      { role: "assistant", content: "Previous answer", toolName: undefined },
    ]);
    expect(connected.approvalMode).toBe("never");
    expect(connected.securityMode).toBe("trusted");
    expect(connected.securityModeRemainingTTL).toBe(900);
  });

  test("tracks pending approvals and questions from stream events and resolves them through controller actions", async () => {
    const approvals: Array<{ toolCallId: string; approved: boolean }> = [];
    const accepts: string[] = [];
    const answers: Array<{ id: string; answer: string }> = [];
    const controller = createAriaChatController(
      {
        health: {
          ping: {
            query: async () => ({ model: "sonnet", agentName: "Esperta Aria" }),
          },
        },
        session: {
          getLatest: {
            query: async () => ({ id: "tui:session-existing" }),
          },
          create: {
            mutate: async () => ({ session: { id: "unused" } }),
          },
        },
        chat: {
          history: {
            query: async () => ({ messages: [], archived: false }),
          },
          stream: {
            subscribe(_input, handlers) {
              handlers.onData({
                type: "tool_approval_request",
                id: "tool-1",
                name: "exec",
                args: { command: "rm -rf tmp" },
              });
              handlers.onData({
                type: "user_question",
                id: "question-1",
                question: "Ship it?",
                options: ["Yes", "No"],
              });
              handlers.onComplete();
            },
          },
        },
        tool: {
          approve: {
            mutate: async (input) => {
              approvals.push(input);
            },
          },
          acceptForSession: {
            mutate: async ({ toolCallId }) => {
              accepts.push(toolCallId);
            },
          },
        },
        question: {
          answer: {
            mutate: async (input) => {
              answers.push(input);
            },
          },
        },
      },
      { connectorType: "tui", prefix: "tui" },
    );

    await controller.connect();
    const streamed = await controller.sendMessage("run it");
    expect(streamed.pendingApproval).toEqual({
      toolCallId: "tool-1",
      toolName: "exec",
      args: { command: "rm -rf tmp" },
    });
    expect(streamed.pendingQuestion).toEqual({
      questionId: "question-1",
      question: "Ship it?",
      options: ["Yes", "No"],
    });

    const afterApprove = await controller.approveToolCall("tool-1", true);
    expect(approvals).toEqual([{ toolCallId: "tool-1", approved: true }]);
    expect(afterApprove.pendingApproval).toBeNull();

    const afterAccept = await controller.acceptToolCallForSession("tool-1");
    expect(accepts).toEqual(["tool-1"]);
    expect(afterAccept.pendingApproval).toBeNull();

    const afterAnswer = await controller.answerQuestion("question-1", "Yes");
    expect(answers).toEqual([{ id: "question-1", answer: "Yes" }]);
    expect(afterAnswer.pendingQuestion).toBeNull();
    expect(afterAnswer.messages.at(-1)).toEqual({
      role: "tool",
      content: "Answer: Yes",
      toolName: "ask_user",
    });
  });

  test("stops a running aria chat session and clears pending interaction state", async () => {
    const stoppedSessions: string[] = [];
    const controller = createAriaChatController(
      {
        health: {
          ping: {
            query: async () => ({ model: "sonnet", agentName: "Esperta Aria" }),
          },
        },
        session: {
          getLatest: {
            query: async () => ({ id: "tui:session-existing" }),
          },
          create: {
            mutate: async () => ({ session: { id: "unused" } }),
          },
        },
        chat: {
          history: {
            query: async () => ({ messages: [], archived: false }),
          },
          stop: {
            mutate: async ({ sessionId }) => {
              stoppedSessions.push(sessionId);
              return { cancelled: true };
            },
          },
          stream: {
            subscribe(_input, handlers) {
              handlers.onData({
                type: "tool_approval_request",
                id: "tool-1",
                name: "exec",
                args: { command: "rm -rf tmp" },
              });
              handlers.onData({
                type: "user_question",
                id: "question-1",
                question: "Ship it?",
                options: ["Yes", "No"],
              });
              handlers.onData({ type: "text_delta", delta: "Working" });
              handlers.onComplete();
            },
          },
        },
      },
      { connectorType: "tui", prefix: "tui" },
    );

    await controller.connect();
    await controller.sendMessage("run it");
    const stopped = await controller.stop();

    expect(stoppedSessions).toEqual(["tui:session-existing"]);
    expect(stopped.isStreaming).toBe(false);
    expect(stopped.streamingText).toBe("");
    expect(stopped.pendingApproval).toBeNull();
    expect(stopped.pendingQuestion).toBeNull();
    expect(stopped.messages.at(-1)).toEqual({
      role: "tool",
      content: "Stopped by user",
      toolName: "system",
    });
  });

  test("lists and opens recent aria chat sessions", async () => {
    const controller = createAriaChatController(
      {
        health: {
          ping: {
            query: async () => ({ model: "sonnet", agentName: "Esperta Aria" }),
          },
        },
        session: {
          create: {
            mutate: async () => ({ session: { id: "unused" } }),
          },
          list: {
            query: async () => [
              {
                id: "tui:session-live",
                connectorType: "tui",
                connectorId: "tui",
                lastActiveAt: 100,
              },
            ],
          },
          listArchived: {
            query: async () => [
              {
                sessionId: "tui:session-archived",
                connectorType: "tui",
                connectorId: "tui",
                lastActiveAt: 99,
                preview: "Preview",
                summary: "Summary",
              },
            ],
          },
          search: {
            query: async () => [
              {
                sessionId: "tui:session-search",
                connectorType: "tui",
                connectorId: "tui",
                lastActiveAt: 98,
                preview: "Search preview",
                summary: "Search summary",
                score: 0.5,
              },
            ],
          },
        },
        chat: {
          history: {
            query: async () => ({
              archived: false,
              messages: [
                { role: "user", content: "Earlier question" },
                { role: "assistant", content: "Earlier answer" },
              ],
            }),
          },
          stream: {
            subscribe() {
              return;
            },
          },
        },
      },
      { connectorType: "tui", prefix: "tui" },
    );

    expect(await controller.listSessions()).toEqual([
      {
        sessionId: "tui:session-live",
        connectorType: "tui",
        connectorId: "tui",
        archived: false,
        lastActiveAt: 100,
      },
    ]);

    expect(await controller.listArchivedSessions()).toEqual([
      {
        sessionId: "tui:session-archived",
        connectorType: "tui",
        connectorId: "tui",
        archived: true,
        lastActiveAt: 99,
        preview: "Preview",
        summary: "Summary",
        score: undefined,
      },
    ]);

    expect(await controller.searchSessions("question")).toEqual([
      {
        sessionId: "tui:session-search",
        connectorType: "tui",
        connectorId: "tui",
        archived: true,
        lastActiveAt: 98,
        preview: "Search preview",
        summary: "Search summary",
        score: 0.5,
      },
    ]);

    const opened = await controller.openSession("tui:session-archived");
    expect(opened.sessionId).toBe("tui:session-archived");
    expect(opened.sessionStatus).toBe("resumed");
    expect(opened.messages).toEqual([
      { role: "user", content: "Earlier question", toolName: undefined },
      { role: "assistant", content: "Earlier answer", toolName: undefined },
    ]);
  });
});
