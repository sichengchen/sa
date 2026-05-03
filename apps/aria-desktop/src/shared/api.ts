import type { ThreadStatus, ThreadType } from "../../../../packages/work/src/client.js";

export const ariaDesktopChannels = {
  ping: "aria-desktop:ping",
  getRuntimeInfo: "aria-desktop:get-runtime-info",
  getProjectShellState: "aria-desktop:get-project-shell-state",
  getAriaShellState: "aria-desktop:get-aria-shell-state",
  getSettingsState: "aria-desktop:get-settings-state",
  ariaShellStateChanged: "aria-desktop:aria-shell-state-changed",
  projectShellStateChanged: "aria-desktop:project-shell-state-changed",
  settingsStateChanged: "aria-desktop:settings-state-changed",
  importLocalProjectFromDialog: "aria-desktop:import-local-project-from-dialog",
  createThread: "aria-desktop:create-thread",
  createAriaChatSession: "aria-desktop:create-aria-chat-session",
  archiveAriaChatSession: "aria-desktop:archive-aria-chat-session",
  selectProject: "aria-desktop:select-project",
  selectThread: "aria-desktop:select-thread",
  archiveProjectThread: "aria-desktop:archive-project-thread",
  setProjectThreadPinned: "aria-desktop:set-project-thread-pinned",
  sendProjectThreadMessage: "aria-desktop:send-project-thread-message",
  createProjectThreadBranch: "aria-desktop:create-project-thread-branch",
  switchProjectThreadEnvironment: "aria-desktop:switch-project-thread-environment",
  setProjectThreadModel: "aria-desktop:set-project-thread-model",
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
  updateSettings: "aria-desktop:update-settings",
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

export type AriaDesktopSettingsTheme = "system" | "light" | "dark";
export type AriaDesktopSettingsDefaultSpace = "projects" | "chat";
export type AriaDesktopSettingsApprovalMode = "ask" | "never" | "always";
export type AriaDesktopSettingsSecurityMode = "default" | "trusted" | "unrestricted";
export type AriaDesktopSettingsVerbosity = "silent" | "minimal" | "verbose";
export type AriaDesktopSettingsProviderType =
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "nvidia"
  | "openai-compat";
export type AriaDesktopSettingsModelTier = "performance" | "normal" | "eco";
export type AriaDesktopSettingsConnectorType =
  | "tui"
  | "telegram"
  | "discord"
  | "slack"
  | "teams"
  | "gchat"
  | "github"
  | "linear"
  | "wechat"
  | "webhook";

export interface AriaDesktopSettingsProviderPreset {
  apiKeyEnvVar: string;
  baseUrl?: string;
  id: string;
  label: string;
  type: AriaDesktopSettingsProviderType;
}

export interface AriaDesktopSettingsProviderConfig {
  apiKeyConfigured: boolean;
  apiKeyEnvVar: string;
  baseUrl?: string;
  id: string;
  label: string;
  modelCount: number;
  type: AriaDesktopSettingsProviderType;
}

export interface AriaDesktopSettingsModelOption {
  fallback?: string | null;
  label: string;
  maxTokens?: number | null;
  model: string;
  name: string;
  provider: string;
  temperature?: number | null;
  type: "chat" | "embedding";
  selected: boolean;
  tiers: AriaDesktopSettingsModelTier[];
}

export interface AriaDesktopSettingsConnectorSecret {
  configured: boolean;
  key: string;
  label: string;
  maskedValue: string | null;
}

export interface AriaDesktopSettingsConnectorStatus {
  approval: AriaDesktopSettingsApprovalMode;
  configured: boolean;
  label: string;
  name: string;
  secrets: AriaDesktopSettingsConnectorSecret[];
  webhookEnabled?: boolean;
}

export interface AriaDesktopSettingsState {
  desktop: {
    compactMode: boolean;
    defaultSpace: AriaDesktopSettingsDefaultSpace;
    settingsPath: string;
    startAtLogin: boolean;
    theme: AriaDesktopSettingsTheme;
  };
  runtime: {
    activeModel: string;
    checkpointMaxSnapshots: number;
    checkpointsEnabled: boolean;
    connectorApproval: AriaDesktopSettingsApprovalMode;
    connectorVerbosity: AriaDesktopSettingsVerbosity;
    contextFilesEnabled: boolean;
    cronTaskCount: number;
    defaultModel: string;
    heartbeatEnabled: boolean;
    heartbeatIntervalMinutes: number;
    homeDir: string;
    journalEnabled: boolean;
    mcpServerCount: number;
    memoryDirectory: string;
    memoryEnabled: boolean;
    modelTiers: Partial<Record<AriaDesktopSettingsModelTier, string>>;
    models: AriaDesktopSettingsModelOption[];
    providerPresets: AriaDesktopSettingsProviderPreset[];
    providers: AriaDesktopSettingsProviderConfig[];
    providerCount: number;
    securityMode: AriaDesktopSettingsSecurityMode;
    tuiApproval: AriaDesktopSettingsApprovalMode;
    tuiVerbosity: AriaDesktopSettingsVerbosity;
    webhookApproval: AriaDesktopSettingsApprovalMode;
    webhookEnabled: boolean;
    webhookTaskCount: number;
  };
  connectors: AriaDesktopSettingsConnectorStatus[];
  about: {
    channel: string;
    cliName: string;
    productName: string;
    runtimeName: string;
  };
  lastError: string | null;
}

export interface AriaDesktopSettingsPatch {
  desktop?: Partial<
    Pick<
      AriaDesktopSettingsState["desktop"],
      "compactMode" | "defaultSpace" | "startAtLogin" | "theme"
    >
  >;
  runtime?: Partial<
    Pick<
      AriaDesktopSettingsState["runtime"],
      | "activeModel"
      | "checkpointMaxSnapshots"
      | "checkpointsEnabled"
      | "connectorApproval"
      | "connectorVerbosity"
      | "contextFilesEnabled"
      | "heartbeatEnabled"
      | "heartbeatIntervalMinutes"
      | "journalEnabled"
      | "memoryEnabled"
      | "securityMode"
      | "tuiApproval"
      | "tuiVerbosity"
      | "webhookApproval"
      | "webhookEnabled"
    >
  >;
  provider?: {
    add?: {
      apiKey?: string;
      apiKeyEnvVar: string;
      baseUrl?: string;
      id: string;
      type: AriaDesktopSettingsProviderType;
    };
    deleteId?: string;
    updateApiKey?: {
      envVar: string;
      value: string | null;
    };
  };
  model?: {
    add?: {
      maxTokens?: number | null;
      model: string;
      name: string;
      provider: string;
      temperature?: number | null;
      type?: "chat" | "embedding";
    };
    deleteName?: string;
    setDefault?: string;
    setTier?: {
      modelName: string | null;
      tier: AriaDesktopSettingsModelTier;
    };
  };
  connector?: {
    setApproval?: {
      connector: AriaDesktopSettingsConnectorType;
      mode: AriaDesktopSettingsApprovalMode;
    };
    updateSecret?: {
      key: string;
      value: string | null;
    };
    updateSecrets?: Array<{
      key: string;
      value: string | null;
    }>;
    webhookEnabled?: boolean;
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
  pinned?: boolean;
}

export interface AriaDesktopProjectGroup {
  projectId: string;
  name: string;
  repoName?: string | null;
  rootPath?: string | null;
  threads: AriaDesktopProjectThreadItem[];
}

export interface AriaDesktopProjectThreadState {
  threadId: string;
  projectId: string;
  projectName: string;
  title: string;
  status: AriaDesktopThreadStatus;
  statusLabel: string;
  threadType: AriaDesktopThreadType;
  threadTypeLabel: string;
  environmentId?: string | null;
  environmentLabel?: string | null;
  environmentLocator?: string | null;
  agentId?: string | null;
  agentLabel?: string | null;
  modelId?: string | null;
  modelLabel?: string | null;
  backendSessionId?: string | null;
  changedFiles: string[];
  chat: AriaDesktopChatState;
  availableBranches: AriaDesktopProjectThreadBranchOption[];
  availableModels: AriaDesktopProjectThreadModelOption[];
  promptSuggestions: AriaDesktopProjectPromptSuggestions;
}

export interface AriaDesktopProjectThreadBranchOption {
  environmentId: string;
  label: string;
  locator?: string | null;
  selected: boolean;
  value: string;
}

export interface AriaDesktopProjectThreadModelOption {
  modelId: string | null;
  label: string;
  modelLabel?: string | null;
  providerLabel?: string | null;
  selected: boolean;
}

export interface AriaDesktopProjectPromptSkillSuggestion {
  description?: string | null;
  label: string;
  value: string;
}

export interface AriaDesktopProjectPromptFileSuggestion {
  detail?: string | null;
  label: string;
  value: string;
}

export interface AriaDesktopProjectPromptSuggestions {
  files: AriaDesktopProjectPromptFileSuggestion[];
  skills: AriaDesktopProjectPromptSkillSuggestion[];
}

export interface AriaDesktopProjectShellState {
  projects: AriaDesktopProjectGroup[];
  selectedProjectId: string | null;
  selectedThreadId: string | null;
  collapsedProjectIds: string[];
  pinnedThreadIds: string[];
  archivedThreadIds: string[];
  selectedThreadState: AriaDesktopProjectThreadState | null;
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
  streamingPhase: "thinking" | "responding" | null;
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
  archiveAriaChatSession: (sessionId: string) => Promise<AriaDesktopAriaShellState>;
  createAriaChatSession: () => Promise<AriaDesktopAriaShellState>;
  ping: () => Promise<string>;
  getRuntimeInfo: () => Promise<AriaDesktopRuntimeInfo>;
  getAriaShellState: () => Promise<AriaDesktopAriaShellState>;
  getProjectShellState: () => Promise<AriaDesktopProjectShellState>;
  getSettingsState: () => Promise<AriaDesktopSettingsState>;
  importLocalProjectFromDialog: () => Promise<AriaDesktopProjectShellState>;
  onAriaShellStateChanged: (listener: (state: AriaDesktopAriaShellState) => void) => () => void;
  onProjectShellStateChanged: (
    listener: (state: AriaDesktopProjectShellState) => void,
  ) => () => void;
  onSettingsStateChanged: (listener: (state: AriaDesktopSettingsState) => void) => () => void;
  createThread: (projectId: string) => Promise<AriaDesktopProjectShellState>;
  archiveProjectThread: (threadId: string) => Promise<AriaDesktopProjectShellState>;
  refreshAutomations: () => Promise<AriaDesktopAriaShellState>;
  searchAriaChatSessions: (query: string) => Promise<AriaDesktopAriaShellState>;
  searchConnectorSessions: (query: string) => Promise<AriaDesktopAriaShellState>;
  selectProject: (projectId: string) => Promise<AriaDesktopProjectShellState>;
  selectThread: (projectId: string, threadId: string) => Promise<AriaDesktopProjectShellState>;
  setProjectThreadPinned: (
    threadId: string,
    pinned: boolean,
  ) => Promise<AriaDesktopProjectShellState>;
  sendProjectThreadMessage: (
    threadId: string,
    message: string,
  ) => Promise<AriaDesktopProjectShellState>;
  createProjectThreadBranch: (
    threadId: string,
    branchName: string,
  ) => Promise<AriaDesktopProjectShellState>;
  setProjectThreadModel: (
    threadId: string,
    modelId: string | null,
  ) => Promise<AriaDesktopProjectShellState>;
  switchProjectThreadEnvironment: (
    threadId: string,
    environmentId: string,
  ) => Promise<AriaDesktopProjectShellState>;
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
  updateSettings: (patch: AriaDesktopSettingsPatch) => Promise<AriaDesktopSettingsState>;
}
