import type { TSchema } from "@sinclair/typebox";
import type { ModelRouter } from "../router/index.js";

/** A tool implementation that the agent can invoke */
export interface ToolImpl<TParams extends TSchema = TSchema> {
  name: string;
  description: string;
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

export interface AgentOptions {
  router: ModelRouter;
  tools?: ToolImpl[];
  systemPrompt?: string;
  maxToolRounds?: number;
  /** Optional callback for tool approval. If provided, called before tool execution. */
  onToolApproval?: ToolApprovalCallback;
}

/** Events emitted by the agent during streaming */
export type AgentEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; name: string; id: string }
  | { type: "tool_end"; name: string; id: string; result: ToolResult }
  | { type: "tool_approval_request"; name: string; id: string; args: Record<string, unknown> }
  | { type: "done"; stopReason: string }
  | { type: "error"; message: string };
