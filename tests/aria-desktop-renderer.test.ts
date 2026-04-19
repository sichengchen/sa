import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AriaDesktopAriaShellState } from "../apps/aria-desktop/src/shared/api.js";
import {
  AriaChatView,
  AriaSidebar,
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
  },
  selectedAriaScreen: null,
  selectedAriaSessionId: "chat-1",
  serverLabel: "Local Server",
};

describe("desktop aria renderer", () => {
  test("renders the aria sidebar in the required order", () => {
    const html = renderToStaticMarkup(
      React.createElement(AriaSidebar, {
        ariaState: SAMPLE_ARIA_STATE,
        onCreateChat: () => {},
        onOpenSettings: () => {},
        onSearchChatSessions: () => {},
        onSearchConnectorSessions: () => {},
        onSelectChatSession: () => {},
        onSelectConnectorScreen: () => {},
        onSelectConnectorSession: () => {},
        onSelectScreen: () => {},
        settingsActive: false,
      }),
    );

    expect(html.indexOf("Automations")).toBeLessThan(html.indexOf("Connectors"));
    expect(html.indexOf("Connectors")).toBeLessThan(html.indexOf("Chat"));
    expect(html.indexOf("Chat")).toBeLessThan(html.indexOf("Settings"));
    expect(html).toContain("Draft release notes");
  });

  test("renders the empty chat state as a centered composer with send button", () => {
    const html = renderToStaticMarkup(
      React.createElement(AriaChatView, {
        chat: SAMPLE_ARIA_STATE.chat,
        emptyPlaceholder: "Message Aria",
        onAcceptForSession: () => {},
        onAnswerQuestion: () => {},
        onApproveToolCall: () => {},
        onSearchSessions: () => {},
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
    expect(userHtml).toContain("aria-message-user-bubble");
    expect(userHtml).toContain("A user message");
  });
});
