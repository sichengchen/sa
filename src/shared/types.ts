/** Shared types between Engine and Connectors */

/** Events emitted by the agent during streaming — mirrors AgentEvent but for tRPC transport */
export type EngineEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; name: string; id: string }
  | { type: "tool_end"; name: string; id: string; content: string; isError: boolean }
  | { type: "tool_approval_request"; name: string; id: string; args: Record<string, unknown> }
  | { type: "done"; stopReason: string }
  | { type: "error"; message: string };

/** A session represents a single Connector's conversation with the Engine */
export interface Session {
  id: string;
  connectorType: string;
  connectorId: string;
  createdAt: number;
  lastActiveAt: number;
}

/** Connector types supported by the Engine */
export type ConnectorType = "tui" | "telegram" | "discord";

/** A pending tool-approval request from Engine to Connector */
export interface ToolApprovalRequest {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  sessionId: string;
}

/** Skill metadata exposed to Connectors */
export interface SkillInfo {
  name: string;
  description: string;
  active: boolean;
}
