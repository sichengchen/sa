import * as z from "zod";

/** Shared types between Engine and Connectors */

/** Events emitted by the agent during streaming — mirrors AgentEvent but for tRPC transport */
/** Security layers that can block a tool call */
export type SecurityLayer = "url_policy" | "exec_fence" | "tool_restriction";

/** User choice for a security escalation prompt */
export type EscalationChoice = "allow_once" | "allow_session" | "add_persistent" | "deny";

export const ThreadTypeSchema = z.enum([
  "aria",
  "connector",
  "automation",
  "remote_project",
  "local_project",
]);
export type ThreadType = z.infer<typeof ThreadTypeSchema>;

export const ThreadStatusSchema = z.enum([
  "idle",
  "queued",
  "running",
  "dirty",
  "blocked",
  "done",
  "failed",
  "cancelled",
]);
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

export interface EngineEventMeta {
  serverId?: string;
  workspaceId?: string;
  projectId?: string;
  environmentId?: string;
  threadId?: string;
  sessionId: string;
  timestamp: number;
  runId?: string;
  jobId?: string;
  parentRunId?: string | null;
  connectorType?: ConnectorType | string;
  source?: string;
  taskId?: string;
  threadType?: ThreadType;
  environmentBindingId?: string | null;
  agentId?: string | null;
  actorId?: string | null;
}

export type EngineEvent = EngineEventMeta &
  (
    | { type: "text_delta"; delta: string }
    | { type: "thinking_delta"; delta: string }
    | { type: "tool_start"; name: string; id: string }
    | {
        type: "tool_end";
        name: string;
        id: string;
        content: string;
        isError: boolean;
      }
    | {
        type: "tool_approval_request";
        name: string;
        id: string;
        args: Record<string, unknown>;
      }
    | {
        type: "security_escalation_request";
        id: string;
        layer: SecurityLayer;
        detail: string;
        resource?: string;
        options: EscalationChoice[];
      }
    | {
        type: "mode_change";
        mode: string;
        remainingTTL: number;
        description: string;
      }
    | {
        type: "user_question";
        id: string;
        question: string;
        options?: string[];
      }
    | { type: "sub_agent_start"; subAgentId: string; task: string }
    | {
        type: "sub_agent_end";
        subAgentId: string;
        status: string;
        summary: string;
      }
    | { type: "reaction"; emoji: string }
    | { type: "done"; stopReason: string }
    | { type: "error"; message: string }
  );

/** A session represents a single Connector's conversation with the Engine */
export interface Session {
  id: string;
  connectorType: string;
  connectorId: string;
  createdAt: number;
  lastActiveAt: number;
}

/** Connector types supported by the Engine — single source of truth */
export const ConnectorTypeSchema = z.enum([
  "tui",
  "telegram",
  "discord",
  "slack",
  "teams",
  "gchat",
  "github",
  "linear",
  "wechat",
  "webhook",
  "engine",
  "cron",
]);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

/** Tool approval mode per connector */
export type ToolApprovalMode = "always" | "never" | "ask";

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
