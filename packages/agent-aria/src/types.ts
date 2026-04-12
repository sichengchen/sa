import type { TSchema } from "@sinclair/typebox";
import type { ModelRouter } from "@aria/gateway/router";

/** Tool danger classification for approval policy */
export type DangerLevel = "safe" | "moderate" | "dangerous";

/** A tool implementation that the agent can invoke */
export interface ToolImpl<TParams extends TSchema = TSchema> {
  name: string;
  description: string;
  /** Richer summary for the system prompt (falls back to description if omitted) */
  summary?: string;
  /** Danger level for approval policy: safe (auto-approve), moderate (context-dependent), dangerous (always ask) */
  dangerLevel: DangerLevel;
  parameters: TParams;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

/** Callback for tool approval — returns true if approved, false if rejected */
export type ToolApprovalCallback = (
  toolName: string,
  toolCallId: string,
  args: Record<string, unknown>,
) => Promise<boolean>;

/** Callback for ask_user — blocks the agent until the user responds */
export type AskUserCallback = (
  id: string,
  question: string,
  options?: string[],
) => Promise<string>;

/** Configuration for tool loop detection thresholds */
export interface ToolLoopConfig {
  /** Emit warning after this many repeated identical calls (default: 10) */
  warnThreshold?: number;
  /** Block the tool call after this many repeats (default: 20) */
  blockThreshold?: number;
  /** Hard-stop the agent loop after this many repeats (default: 30) */
  circuitBreakerThreshold?: number;
  /** Sliding window size for tracking recent calls (default: 30) */
  windowSize?: number;
}

export interface AgentOptions {
  router: ModelRouter;
  tools?: ToolImpl[];
  systemPrompt?: string;
  getSystemPrompt?: () => string;
  /** Agent timeout in milliseconds. 0 = no timeout. Default: 600_000 (10 minutes). */
  timeoutMs?: number;
  /** Tool loop detection. true = enabled with defaults, false = disabled, object = custom config. Default: true. */
  toolLoopDetection?: boolean | ToolLoopConfig;
  /** Maximum characters per tool result before truncation. Default: 400_000. */
  maxToolResultChars?: number;
  /** Optional callback for tool approval. If provided, called before tool execution. */
  onToolApproval?: ToolApprovalCallback;
  /** Optional callback for ask_user tool. If provided, the agent can ask the user questions mid-turn. */
  onAskUser?: AskUserCallback;
  /** Override the router's active model for this agent instance (e.g. for cron task model overrides) */
  modelOverride?: string;
}

/** Events emitted by the agent during streaming */
export type AgentEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; name: string; id: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; id: string; result: ToolResult }
  | { type: "tool_approval_request"; name: string; id: string; args: Record<string, unknown> }
  | { type: "user_question"; id: string; question: string; options?: string[] }
  | { type: "warning"; message: string }
  | { type: "done"; stopReason: string }
  | { type: "error"; message: string };
