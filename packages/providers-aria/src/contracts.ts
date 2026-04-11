export type RuntimeBackendId =
  | "aria"
  | "codex"
  | "claude-code"
  | "opencode"
  | (string & {});

export type RuntimeBackendApprovalMode = "auto" | "gated" | "suggest";

export type RuntimeBackendExecutionStatus =
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled";

export type RuntimeBackendEventType =
  | "execution.started"
  | "execution.waiting_approval"
  | "execution.stdout"
  | "execution.stderr"
  | "execution.completed";

export interface RuntimeBackendTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface RuntimeBackendCapabilities {
  supportsStreamingEvents: boolean;
  supportsCancellation: boolean;
  supportsStructuredOutput: boolean;
  supportsFileEditing: boolean;
  supportsBackgroundExecution: boolean;
  supportsAuthProbe: boolean;
}

export interface RuntimeBackendAvailability {
  available: boolean;
  detectedVersion?: string | null;
  authState?: "configured" | "missing" | "unknown";
  reason?: string | null;
}

export interface RuntimeBackendExecutionRequest {
  executionId: string;
  prompt: string;
  workingDirectory: string;
  timeoutMs: number;
  maxTurns?: number | null;
  approvalMode: RuntimeBackendApprovalMode;
  env?: Record<string, string>;
  sessionId?: string | null;
  threadId?: string | null;
  taskId?: string | null;
  metadata?: Record<string, string>;
}

export interface RuntimeBackendExecutionEvent {
  type: RuntimeBackendEventType;
  backend: RuntimeBackendId;
  executionId: string;
  timestamp: number;
  chunk?: string;
  status?: RuntimeBackendExecutionStatus;
  summary?: string | null;
  metadata?: Record<string, string>;
}

export interface RuntimeBackendExecutionResult {
  backend: RuntimeBackendId;
  executionId: string;
  status: RuntimeBackendExecutionStatus;
  exitCode: number;
  stdout: string;
  stderr: string;
  summary?: string | null;
  filesChanged: string[];
  tokenUsage?: RuntimeBackendTokenUsage;
  metadata?: Record<string, string>;
}

export interface RuntimeBackendExecutionObserver {
  onEvent?(event: RuntimeBackendExecutionEvent): void | Promise<void>;
}

export interface RuntimeBackendAdapter {
  readonly backend: RuntimeBackendId;
  readonly displayName: string;
  readonly capabilities: RuntimeBackendCapabilities;
  probeAvailability(): Promise<RuntimeBackendAvailability>;
  execute(
    request: RuntimeBackendExecutionRequest,
    observer?: RuntimeBackendExecutionObserver
  ): Promise<RuntimeBackendExecutionResult>;
  cancel(executionId: string): Promise<void>;
}
