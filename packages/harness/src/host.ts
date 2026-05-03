import { toolIntentRequiresApproval } from "@aria/policy/capability-policy";
import type { ToolDecision, ToolIntent } from "@aria/policy/capability-policy";
import type { SecretRef } from "./session-env.js";

export interface ResolveModelInput {
  model?: string;
  role?: string;
}

export interface HarnessAuditEvent {
  type: "tool_intent" | "tool_decision" | "session_event" | "result_validation";
  sessionId?: string;
  runId?: string;
  toolName?: string;
  intent?: ToolIntent;
  decision?: ToolDecision;
  message?: string;
  at?: number;
}

export interface HarnessRunEvent {
  sessionId?: string;
  runId?: string;
  type: string;
  data?: Record<string, unknown>;
  at?: number;
}

export interface HarnessSessionData {
  id: string;
  agentId?: string;
  role?: string;
  history: unknown[];
  metadata?: Record<string, unknown>;
  updatedAt: number;
}

export interface SecretLeaseRequest {
  id: string;
  ref: SecretRef;
}

export interface AriaHarnessHost {
  resolveModel(input: ResolveModelInput): unknown;
  requestToolDecision(intent: ToolIntent): Promise<ToolDecision>;
  recordAudit(event: HarnessAuditEvent): Promise<void>;
  appendRunEvent(event: HarnessRunEvent): Promise<void>;
  loadHarnessSession(id: string): Promise<HarnessSessionData | null>;
  saveHarnessSession(id: string, data: HarnessSessionData): Promise<void>;
  resolveSecrets(leases: SecretLeaseRequest[]): Promise<Record<string, string>>;
}

export class InMemoryHarnessHost implements AriaHarnessHost {
  readonly sessions = new Map<string, HarnessSessionData>();
  readonly audit: HarnessAuditEvent[] = [];
  readonly runEvents: HarnessRunEvent[] = [];
  readonly secrets = new Map<string, string>();

  constructor(private readonly model?: unknown) {}

  resolveModel(_input: ResolveModelInput): unknown {
    return this.model;
  }

  async requestToolDecision(intent: ToolIntent): Promise<ToolDecision> {
    const decision: ToolDecision = toolIntentRequiresApproval(intent)
      ? { status: "escalate", reason: "approval required for host or full-network execution" }
      : { status: "allow" };
    this.audit.push({ type: "tool_decision", intent, decision, at: Date.now() });
    return decision;
  }

  async recordAudit(event: HarnessAuditEvent): Promise<void> {
    this.audit.push({ ...event, at: event.at ?? Date.now() });
  }

  async appendRunEvent(event: HarnessRunEvent): Promise<void> {
    this.runEvents.push({ ...event, at: event.at ?? Date.now() });
  }

  async loadHarnessSession(id: string): Promise<HarnessSessionData | null> {
    return this.sessions.get(id) ?? null;
  }

  async saveHarnessSession(id: string, data: HarnessSessionData): Promise<void> {
    this.sessions.set(id, data);
  }

  async resolveSecrets(leases: SecretLeaseRequest[]): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    for (const lease of leases) {
      const value = this.secrets.get(lease.ref.name);
      if (value !== undefined) resolved[lease.id] = value;
    }
    return resolved;
  }
}
