import type { ThreadStatus, ThreadType } from "../../../../packages/projects/src/client.js";

export const ariaDesktopChannels = {
  ping: "aria-desktop:ping",
  getRuntimeInfo: "aria-desktop:get-runtime-info",
  getProjectShellState: "aria-desktop:get-project-shell-state",
  getAriaShellState: "aria-desktop:get-aria-shell-state",
  importLocalProjectFromDialog: "aria-desktop:import-local-project-from-dialog",
  createThread: "aria-desktop:create-thread",
  createAriaChatSession: "aria-desktop:create-aria-chat-session",
  selectProject: "aria-desktop:select-project",
  selectThread: "aria-desktop:select-thread",
  selectAriaChatSession: "aria-desktop:select-aria-chat-session",
  selectAriaScreen: "aria-desktop:select-aria-screen",
  setProjectCollapsed: "aria-desktop:set-project-collapsed",
  searchAriaChatSessions: "aria-desktop:search-aria-chat-sessions",
  sendAriaChatMessage: "aria-desktop:send-aria-chat-message",
  stopAriaChatSession: "aria-desktop:stop-aria-chat-session",
  approveAriaChatToolCall: "aria-desktop:approve-aria-chat-tool-call",
  acceptAriaChatToolCallForSession: "aria-desktop:accept-aria-chat-tool-call-for-session",
  answerAriaChatQuestion: "aria-desktop:answer-aria-chat-question",
  refreshAutomations: "aria-desktop:refresh-automations",
  selectAutomationTask: "aria-desktop:select-automation-task",
  searchConnectorSessions: "aria-desktop:search-connector-sessions",
  selectConnectorSession: "aria-desktop:select-connector-session",
  sendConnectorMessage: "aria-desktop:send-connector-message",
  stopConnectorSession: "aria-desktop:stop-connector-session",
  approveConnectorToolCall: "aria-desktop:approve-connector-tool-call",
  acceptConnectorToolCallForSession: "aria-desktop:accept-connector-tool-call-for-session",
  answerConnectorQuestion: "aria-desktop:answer-connector-question",
} as const;

export interface AriaDesktopRuntimeInfo {
  productName: string;
  platform: NodeJS.Platform;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
}

export type AriaDesktopThreadStatus = ThreadStatus;

export type AriaDesktopThreadType = ThreadType;

export interface AriaDesktopProjectThreadItem {
  threadId: string;
  title: string;
  status: AriaDesktopThreadStatus;
  statusLabel: string;
  threadType: AriaDesktopThreadType;
  threadTypeLabel: string;
  updatedAt: number;
  environmentId?: string | null;
  agentId?: string | null;
}

export interface AriaDesktopProjectGroup {
  projectId: string;
  name: string;
  repoName?: string | null;
  rootPath?: string | null;
  threads: AriaDesktopProjectThreadItem[];
}

export interface AriaDesktopProjectShellState {
  projects: AriaDesktopProjectGroup[];
  selectedProjectId: string | null;
  selectedThreadId: string | null;
  collapsedProjectIds: string[];
}

export type AriaDesktopAriaScreen = "automations" | "connectors";

export interface AriaDesktopSessionSummary {
  sessionId: string;
  connectorId: string;
  connectorType: string;
  archived: boolean;
  lastActiveAt?: number | null;
  preview?: string | null;
  summary?: string | null;
  title: string;
}

export interface AriaDesktopPendingApproval {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface AriaDesktopPendingQuestion {
  questionId: string;
  question: string;
  options?: string[];
}

export interface AriaDesktopChatMessage {
  id: string;
  role: "assistant" | "error" | "tool" | "user";
  content: string;
  toolName?: string | null;
}

export interface AriaDesktopChatState {
  connected: boolean;
  sessionId: string | null;
  sessionStatus: "created" | "disconnected" | "resumed";
  approvalMode: "always" | "ask" | "never";
  securityMode: "default" | "trusted" | "unrestricted";
  securityModeRemainingTTL: number | null;
  modelName: string;
  agentName: string;
  messages: AriaDesktopChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  pendingApproval: AriaDesktopPendingApproval | null;
  pendingQuestion: AriaDesktopPendingQuestion | null;
  lastError: string | null;
}

export interface AriaDesktopAutomationTask {
  taskId: string;
  taskType: string;
  name: string;
  slug?: string | null;
  enabled: boolean;
  paused: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  lastStatus?: string | null;
  lastSummary?: string | null;
}

export interface AriaDesktopAutomationRun {
  taskRunId: string;
  taskId: string;
  taskName: string;
  status: string;
  trigger: string;
  attemptNumber: number;
  maxAttempts: number;
  startedAt: number;
  completedAt?: number | null;
  summary?: string | null;
  deliveryStatus: string;
  deliveryError?: string | null;
  errorMessage?: string | null;
}

export interface AriaDesktopAutomationState {
  tasks: AriaDesktopAutomationTask[];
  selectedTaskId: string | null;
  runs: AriaDesktopAutomationRun[];
  lastError: string | null;
}

export interface AriaDesktopAriaShellState {
  selectedAriaScreen: AriaDesktopAriaScreen | null;
  selectedAriaSessionId: string | null;
  serverLabel: string;
  chatSessions: AriaDesktopSessionSummary[];
  connectorSessions: AriaDesktopSessionSummary[];
  chat: AriaDesktopChatState;
  connectors: AriaDesktopChatState;
  automations: AriaDesktopAutomationState;
}

export interface AriaDesktopApi {
  acceptAriaChatToolCallForSession: (toolCallId: string) => Promise<AriaDesktopAriaShellState>;
  acceptConnectorToolCallForSession: (toolCallId: string) => Promise<AriaDesktopAriaShellState>;
  answerAriaChatQuestion: (
    questionId: string,
    answer: string,
  ) => Promise<AriaDesktopAriaShellState>;
  answerConnectorQuestion: (
    questionId: string,
    answer: string,
  ) => Promise<AriaDesktopAriaShellState>;
  approveAriaChatToolCall: (
    toolCallId: string,
    approved: boolean,
  ) => Promise<AriaDesktopAriaShellState>;
  approveConnectorToolCall: (
    toolCallId: string,
    approved: boolean,
  ) => Promise<AriaDesktopAriaShellState>;
  createAriaChatSession: () => Promise<AriaDesktopAriaShellState>;
  ping: () => Promise<string>;
  getRuntimeInfo: () => Promise<AriaDesktopRuntimeInfo>;
  getAriaShellState: () => Promise<AriaDesktopAriaShellState>;
  getProjectShellState: () => Promise<AriaDesktopProjectShellState>;
  importLocalProjectFromDialog: () => Promise<AriaDesktopProjectShellState>;
  createThread: (projectId: string) => Promise<AriaDesktopProjectShellState>;
  refreshAutomations: () => Promise<AriaDesktopAriaShellState>;
  searchAriaChatSessions: (query: string) => Promise<AriaDesktopAriaShellState>;
  searchConnectorSessions: (query: string) => Promise<AriaDesktopAriaShellState>;
  selectProject: (projectId: string) => Promise<AriaDesktopProjectShellState>;
  selectThread: (projectId: string, threadId: string) => Promise<AriaDesktopProjectShellState>;
  selectAriaChatSession: (sessionId: string) => Promise<AriaDesktopAriaShellState>;
  selectAriaScreen: (screen: AriaDesktopAriaScreen) => Promise<AriaDesktopAriaShellState>;
  selectAutomationTask: (taskId: string) => Promise<AriaDesktopAriaShellState>;
  selectConnectorSession: (sessionId: string) => Promise<AriaDesktopAriaShellState>;
  sendAriaChatMessage: (message: string) => Promise<AriaDesktopAriaShellState>;
  sendConnectorMessage: (message: string) => Promise<AriaDesktopAriaShellState>;
  setProjectCollapsed: (
    projectId: string,
    collapsed: boolean,
  ) => Promise<AriaDesktopProjectShellState>;
  stopAriaChatSession: () => Promise<AriaDesktopAriaShellState>;
  stopConnectorSession: () => Promise<AriaDesktopAriaShellState>;
}
