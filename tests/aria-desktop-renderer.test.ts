import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AriaDesktopAriaShellState } from "../apps/aria-desktop/src/shared/api.js";
import {
  AriaChatView,
  AriaSidebar,
  ProjectSidebar,
  ThreadView,
} from "../apps/aria-desktop/src/renderer/src/components/DesktopWorkbenchApp.js";
import { AriaMessageItem } from "../apps/aria-desktop/src/renderer/src/components/AriaMessageItem.js";

const SAMPLE_ARIA_STATE: AriaDesktopAriaShellState = {
  automations: {
    lastError: null,
    runs: [],
    selectedTaskId: null,
    tasks: [],
  },
  chat: {
    agentName: "Esperta Aria",
    approvalMode: "ask",
    connected: true,
    isStreaming: false,
    lastError: null,
    messages: [],
    modelName: "sonnet",
    pendingApproval: null,
    pendingQuestion: null,
    securityMode: "default",
    securityModeRemainingTTL: null,
    sessionId: "chat-1",
    sessionStatus: "resumed",
    streamingText: "",
    streamingPhase: null,
  },
  chatSessions: [
    {
      archived: false,
      connectorId: "desktop",
      connectorType: "tui",
      lastActiveAt: 100,
      preview: "Draft release notes",
      sessionId: "chat-1",
      summary: null,
      title: "Draft release notes",
    },
    {
      archived: true,
      connectorId: "desktop",
      connectorType: "tui",
      lastActiveAt: 99,
      preview: "Older archived chat",
      sessionId: "chat-archived",
      summary: "Older archived chat",
      title: "Archived chat",
    },
  ],
  connectorSessions: [],
  connectors: {
    agentName: "Esperta Aria",
    approvalMode: "ask",
    connected: false,
    isStreaming: false,
    lastError: null,
    messages: [],
    modelName: "unknown",
    pendingApproval: null,
    pendingQuestion: null,
    securityMode: "default",
    securityModeRemainingTTL: null,
    sessionId: null,
    sessionStatus: "disconnected",
    streamingText: "",
    streamingPhase: null,
  },
  selectedAriaScreen: null,
  selectedAriaSessionId: "chat-1",
  serverLabel: "Local Server",
};

const SAMPLE_PROJECT = {
  name: "desktop-shell",
  projectId: "project-1",
  repoName: "desktop-shell",
  rootPath: "/tmp/desktop-shell",
  threads: [
    {
      agentId: "opencode",
      environmentId: "env-1",
      status: "dirty" as const,
      statusLabel: "Dirty",
      threadId: "thread-1",
      threadType: "local_project" as const,
      threadTypeLabel: "Local Project",
      title: "Desktop Projects OpenCode",
      updatedAt: 100,
    },
  ],
};

const SAMPLE_PROJECT_THREAD_STATE = {
  agentId: "opencode",
  agentLabel: "OpenCode",
  backendSessionId: "ses_1",
  changedFiles: ["src/desktop.tsx"],
  chat: {
    agentName: "OpenCode",
    approvalMode: "never" as const,
    connected: true,
    isStreaming: false,
    lastError: null,
    messages: [
      {
        content: "Plan the Projects chat surface",
        id: "project-user-1",
        role: "user" as const,
        toolName: null,
      },
      {
        content: "Implemented the local agent view.",
        id: "project-assistant-1",
        role: "assistant" as const,
        toolName: null,
      },
    ],
    modelName: "OpenAI / GPT-5",
    pendingApproval: null,
    pendingQuestion: null,
    securityMode: "default" as const,
    securityModeRemainingTTL: null,
    sessionId: "thread-1",
    sessionStatus: "resumed" as const,
    streamingText: "",
    streamingPhase: null,
  },
  environmentId: "env-1",
  environmentLabel: "This Device / main",
  environmentLocator: "/tmp/desktop-shell",
  availableBranches: [
    {
      description: undefined,
      environmentId: "env-1",
      label: "This Device / main",
      locator: "/tmp/desktop-shell",
      selected: true,
      value: "main",
    },
  ],
  availableModels: [
    {
      label: "Default",
      modelId: null,
      modelLabel: "Default",
      providerLabel: null,
      selected: false,
    },
    {
      label: "OpenAI / GPT-5",
      modelId: "openai/gpt-5",
      modelLabel: "GPT-5",
      providerLabel: "OpenAI",
      selected: true,
    },
  ],
  modelId: "openai/gpt-5",
  modelLabel: "GPT-5",
  projectId: "project-1",
  projectName: "desktop-shell",
  status: "dirty" as const,
  statusLabel: "Dirty",
  threadId: "thread-1",
  threadType: "local_project" as const,
  threadTypeLabel: "Local Project",
  title: "Desktop Projects OpenCode",
};

describe("desktop aria renderer", () => {
  test("renders the aria sidebar in the required order", () => {
    const html = renderToStaticMarkup(
      React.createElement(AriaSidebar, {
        ariaState: SAMPLE_ARIA_STATE,
        ariaServerConnected: true,
        pinnedSessionIds: [],
        onArchiveChatSession: () => {},
        onCreateChat: () => {},
        onOpenSettings: () => {},
        onSearchChatSessions: () => {},
        onSelectChatSession: () => {},
        onSelectConnectorScreen: () => {},
        onSelectScreen: () => {},
        onTogglePinnedChatSession: () => {},
        settingsActive: false,
      }),
    );

    expect(html.indexOf("Automations")).toBeLessThan(html.indexOf("Connectors"));
    expect(html.indexOf("Connectors")).toBeLessThan(html.indexOf("Chat"));
    expect(html.indexOf("Chat")).toBeLessThan(html.indexOf("Settings"));
    expect(html).toContain("Draft release notes");
    expect(html).not.toContain("Archived chat");
    expect(html).toContain("Pin Draft release notes");
    expect(html).toContain("Archive Draft release notes");
  });

  test("renders project thread row pin and archive actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectSidebar, {
        collapsedProjectIds: [],
        onArchiveThread: () => {},
        onCreateThread: () => {},
        onOpenSettings: () => {},
        onSelectProject: () => {},
        onSelectThread: () => {},
        onTogglePinnedThread: () => {},
        onToggleProject: () => {},
        projects: [
          {
            ...SAMPLE_PROJECT,
            threads: [
              {
                ...SAMPLE_PROJECT.threads[0],
                pinned: true,
              },
            ],
          },
        ],
        selectedProjectId: "project-1",
        selectedThreadId: "thread-1",
        settingsActive: false,
      }),
    );

    expect(html).toContain("Unpin Desktop Projects OpenCode");
    expect(html).toContain("Archive Desktop Projects OpenCode");
  });

  test("renders the empty chat state as a centered composer with send button", () => {
    const html = renderToStaticMarkup(
      React.createElement(AriaChatView, {
        chat: SAMPLE_ARIA_STATE.chat,
        emptyPlaceholder: "Message Aria",
        onAcceptForSession: () => {},
        onAnswerQuestion: () => {},
        onApproveToolCall: () => {},
        onSendMessage: () => {},
      }),
    );

    expect(html).toContain("aria-chat-composer is-centered");
    expect(html).toContain("Send");
  });

  test("renders assistant messages centered and user messages in bubbles", () => {
    const assistantHtml = renderToStaticMarkup(
      React.createElement(AriaMessageItem, {
        message: {
          content: "**Bold** reply",
          id: "assistant-1",
          role: "assistant",
          toolName: null,
        },
      }),
    );
    const userHtml = renderToStaticMarkup(
      React.createElement(AriaMessageItem, {
        message: {
          content: "A user message",
          id: "user-1",
          role: "user",
          toolName: null,
        },
      }),
    );

    expect(assistantHtml).toContain("aria-message-assistant-content");
    expect(assistantHtml).toContain("<strong>Bold</strong>");
    expect(userHtml).toContain("aria-message-user-content");
    expect(userHtml).toContain("aria-message-user-bubble");
    expect(userHtml).toContain("A user message");
  });

  test("renders tool messages as compact system rows", () => {
    const toolHtml = renderToStaticMarkup(
      React.createElement(AriaMessageItem, {
        message: {
          content: "Calling ask_user...",
          id: "tool-1",
          role: "tool",
          toolName: "ask_user",
        },
      }),
    );

    expect(toolHtml).toContain("aria-message-system-content");
    expect(toolHtml).toContain("Question");
    expect(toolHtml).toContain("Waiting for input");
    expect(toolHtml).not.toContain("ask_user");
  });

  test("renders a thinking state instead of the empty composer while the first response is streaming", () => {
    const html = renderToStaticMarkup(
      React.createElement(AriaChatView, {
        chat: {
          ...SAMPLE_ARIA_STATE.chat,
          isStreaming: true,
          streamingPhase: "thinking",
          streamingText: "",
        },
        emptyPlaceholder: "Message Aria",
        onAcceptForSession: () => {},
        onAnswerQuestion: () => {},
        onApproveToolCall: () => {},
        onSendMessage: () => {},
      }),
    );

    expect(html).toContain("aria-streaming-status");
    expect(html).toContain("Thinking");
    expect(html).not.toContain("aria-chat-composer is-centered");
  });

  test("renders archived sessions as read-only with a new chat action", () => {
    const html = renderToStaticMarkup(
      React.createElement(AriaChatView, {
        chat: {
          ...SAMPLE_ARIA_STATE.chat,
          messages: [
            {
              content: "Archived answer",
              id: "assistant-archived",
              role: "assistant",
              toolName: null,
            },
          ],
        },
        emptyPlaceholder: "Message Aria",
        isArchived: true,
        onAcceptForSession: () => {},
        onAnswerQuestion: () => {},
        onApproveToolCall: () => {},
        onSendMessage: () => {},
      }),
    );

    expect(html).toContain("archived session");
    expect(html).not.toContain("New chat");
    expect(html).not.toContain("aria-chat-composer-shell");
  });

  test("renders project threads with the reused chat interface and thread metadata", () => {
    const html = renderToStaticMarkup(
      React.createElement(ThreadView, {
        onCreateBranch: () => {},
        onImportProject: () => {},
        onSetModel: () => {},
        onSendMessage: () => {},
        onSwitchEnvironment: () => {},
        selectedProject: SAMPLE_PROJECT,
        selectedThreadState: SAMPLE_PROJECT_THREAD_STATE,
      }),
    );

    expect(html).not.toContain("project-thread-header");
    expect(html).toContain("project-thread-composer-trigger");
    expect(html).toContain("Branch: main");
    expect(html).toContain("main");
    expect(html).not.toContain("This Device / main");
    expect(html).not.toContain("Select coding agent:");
    expect(html).toContain("Model: GPT-5");
    expect(html).toContain("aria-chat-view");
    expect(html).toContain("aria-message-user-bubble");
    expect(html).toContain("Implemented the local agent view.");
  });

  test("renders pending ask-user prompts above the composer with composer-aligned chrome", () => {
    const html = renderToStaticMarkup(
      React.createElement(AriaChatView, {
        chat: {
          ...SAMPLE_ARIA_STATE.chat,
          messages: [
            {
              content: "Calling ask_user...",
              id: "tool-ask-user",
              role: "tool",
              toolName: "ask_user",
            },
          ],
          pendingQuestion: {
            question: "What would you like to call this session?",
            questionId: "question-1",
          },
        },
        emptyPlaceholder: "Message Aria",
        onAcceptForSession: () => {},
        onAnswerQuestion: () => {},
        onApproveToolCall: () => {},
        onSendMessage: () => {},
      }),
    );

    expect(html).toContain("aria-question-prompt");
    expect(html).toContain("What would you like to call this session?");
    expect(html).toContain("aria-question-prompt-shell");
    expect(html).toContain("Submit answer");
  });

  test("renders pending approvals above the composer with compact action buttons", () => {
    const html = renderToStaticMarkup(
      React.createElement(AriaChatView, {
        chat: {
          ...SAMPLE_ARIA_STATE.chat,
          messages: [
            {
              content: "Calling ask_user...",
              id: "tool-approval",
              role: "tool",
              toolName: "ask_user",
            },
          ],
          pendingApproval: {
            args: { title: "Functionality" },
            toolCallId: "tool-call-1",
            toolName: "ask_user",
          },
        },
        emptyPlaceholder: "Message Aria",
        onAcceptForSession: () => {},
        onAnswerQuestion: () => {},
        onApproveToolCall: () => {},
        onSendMessage: () => {},
      }),
    );

    expect(html).toContain("aria-action-prompt");
    expect(html).toContain("Allow session");
    expect(html).toContain("Approve");
    expect(html).not.toContain("aria-inline-card");
  });
});
