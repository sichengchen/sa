import type { EscalationChoice } from "@aria/protocol";
import { createEmptyOverrides } from "@aria/agent";
import type { AgentEvent, SessionSecurityOverrides } from "@aria/agent";
import type { ToolIntent } from "@aria/policy";
import type { Message } from "@mariozechner/pi-ai";
import type { SessionToolEnvironment } from "@aria/tools/session-tool-environment";
import type { EngineRuntime } from "./runtime.js";

export interface RuntimeChatSession {
  readonly isRunning: boolean;
  abort(): boolean;
  chat(userText: string, options?: unknown): AsyncGenerator<AgentEvent>;
  getMessages(): readonly Message[];
  hydrateHistory(messages: readonly Message[]): void;
}

export class RuntimeSessionCoordinator {
  readonly sessionAgents = new Map<string, RuntimeChatSession>();
  readonly sessionPromptState = new Map<string, { value: string }>();
  readonly sessionToolEnvironments = new Map<string, SessionToolEnvironment>();
  readonly activeRunsBySession = new Map<string, string>();
  readonly pendingApprovals = new Map<string, (approved: boolean) => void>();
  readonly sessionToolOverrides = new Map<string, Set<string>>();
  readonly sessionSecurityOverrides = new Map<string, SessionSecurityOverrides>();
  readonly pendingApprovalMeta = new Map<
    string,
    { sessionId: string; toolName: string; runId: string; intent?: ToolIntent }
  >();
  readonly pendingEscalations = new Map<
    string,
    { resolve: (choice: EscalationChoice) => void; sessionId: string }
  >();
  readonly pendingQuestions = new Map<
    string,
    {
      resolve: (answer: string) => void;
      reject: (err: Error) => void;
      sessionId: string;
    }
  >();

  getSecurityOverrides(sessionId: string): SessionSecurityOverrides {
    let overrides = this.sessionSecurityOverrides.get(sessionId);
    if (!overrides) {
      overrides = createEmptyOverrides();
      this.sessionSecurityOverrides.set(sessionId, overrides);
    }
    return overrides;
  }
}

const coordinators = new WeakMap<EngineRuntime, RuntimeSessionCoordinator>();

export function getRuntimeSessionCoordinator(runtime: EngineRuntime): RuntimeSessionCoordinator {
  let coordinator = coordinators.get(runtime);
  if (!coordinator) {
    coordinator = new RuntimeSessionCoordinator();
    coordinators.set(runtime, coordinator);
  }
  return coordinator;
}
