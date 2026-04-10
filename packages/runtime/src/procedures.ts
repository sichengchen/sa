import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { router, publicProcedure, middleware } from "./trpc.js";
import type { EngineRuntime } from "./runtime.js";
import { Agent } from "../../../src/engine/agent/index.js";
import type { AgentEvent } from "../../../src/engine/agent/index.js";
import type { DangerLevel } from "../../../src/engine/agent/types.js";
import { classifyExecCommand } from "../../../src/engine/tools/exec-classifier.js";
import { ToolPolicyManager, type ToolEventContext } from "../../../src/engine/tools/policy.js";
import { ConnectorTypeSchema } from "@aria/shared/types.js";
import type { EngineEvent, SkillInfo, ConnectorType, ToolApprovalMode, EscalationChoice } from "@aria/shared/types.js";
import { type SessionSecurityOverrides, createEmptyOverrides } from "../../../src/engine/agent/security-types.js";
import type { ModelConfig, ProviderConfig } from "../../../src/engine/router/types.js";
import { heartbeatState, createHeartbeatTask } from "../../../src/engine/scheduler.js";
import { describeModeEffects } from "../../../src/engine/security-mode.js";
import { createSessionToolEnvironment, type SessionToolEnvironment } from "../../../src/engine/session-tool-environment.js";
import { preprocessContextReferences } from "../../../src/engine/context-references.js";
import type { CronTask } from "../../../src/engine/config/types.js";
import { computeNextRunAt, parseScheduleInput } from "../../../src/engine/automation-schedule.js";
import { listToolsets } from "../../../src/engine/toolsets.js";
import { buildToolCapabilityCatalog, resolveCapabilityPolicyDecision } from "../../../src/engine/capability-policy.js";
import {
  buildDelegationOptions,
  deleteWebhookTaskRecord,
  registerCronTask,
  persistCronTask,
  removeCronTaskFromConfig,
  upsertHeartbeatTaskRecord,
  upsertWebhookTaskRecord,
  updateCronTaskState,
} from "../../../src/engine/automation.js";
import { queryAuditEntries } from "../../../src/engine/audit.js";

/** Format tool args as a compact summary for IM display */
function formatArgsForIM(toolName: string, args: Record<string, unknown>): string {
  // For exec: show the command
  if (toolName === "exec" && typeof args.command === "string") {
    return args.command;
  }
  // For read/write/edit: show the file path
  if (typeof args.path === "string") {
    return args.path;
  }
  // For web_search: show the query
  if (typeof args.query === "string") {
    return args.query;
  }
  // For web_fetch: show the URL
  if (typeof args.url === "string") {
    return args.url;
  }
  // Fallback: compact JSON
  const json = JSON.stringify(args);
  return json.length > 200 ? json.slice(0, 200) + "..." : json;
}

/** Per-session agent instances */
const sessionAgents = new Map<string, Agent>();
const sessionPromptState = new Map<string, { value: string }>();
const sessionToolEnvironments = new Map<string, SessionToolEnvironment>();
const activeRunsBySession = new Map<string, string>();

/** Pending tool approval resolvers: toolCallId -> resolve(boolean) */
const pendingApprovals = new Map<string, (approved: boolean) => void>();

/** Session-level tool overrides: sessionId -> Set of auto-approved tool names */
const sessionToolOverrides = new Map<string, Set<string>>();

/** Session-level security overrides: sessionId -> allowed resources */
const sessionSecurityOverrides = new Map<string, SessionSecurityOverrides>();

/** Pending approval metadata: toolCallId -> { sessionId, toolName, runId } */
const pendingApprovalMeta = new Map<string, { sessionId: string; toolName: string; runId: string }>();

/** Pending security escalation resolvers: escalationId -> resolve(choice) */
const pendingEscalations = new Map<string, { resolve: (choice: EscalationChoice) => void; sessionId: string }>();

/** Pending user question resolvers: questionId (= tool call ID) -> resolve(answer) */
const pendingQuestions = new Map<string, { resolve: (answer: string) => void; reject: (err: Error) => void; sessionId: string }>();

/** Get or create session security overrides */
function getSecurityOverrides(sessionId: string): SessionSecurityOverrides {
  let overrides = sessionSecurityOverrides.get(sessionId);
  if (!overrides) {
    overrides = createEmptyOverrides();
    sessionSecurityOverrides.set(sessionId, overrides);
  }
  return overrides;
}

/** Shorthand for audit logging */
function auditLog(runtime: EngineRuntime, input: import("../../../src/engine/audit.js").AuditInput): void {
  try { runtime.audit.log(input); } catch { /* audit failure is non-fatal */ }
}

export async function flushProcedureState(runtime: EngineRuntime, reason = "Engine shutting down"): Promise<void> {
  for (const agent of sessionAgents.values()) {
    agent.abort();
  }

  const completedAt = Date.now();
  for (const runId of activeRunsBySession.values()) {
    runtime.store.finishRun(runId, {
      status: "interrupted",
      completedAt,
      errorMessage: reason,
    });
  }
  activeRunsBySession.clear();

  for (const sessionId of sessionAgents.keys()) {
    await persistSessionArchiveForRuntime(runtime, sessionId);
  }

  for (const [toolCallId, resolve] of pendingApprovals.entries()) {
    runtime.store.resolveApproval(toolCallId, "interrupted", completedAt);
    resolve(false);
    pendingApprovals.delete(toolCallId);
    pendingApprovalMeta.delete(toolCallId);
  }

  for (const [escalationId, pending] of pendingEscalations.entries()) {
    pending.resolve("deny");
    pendingEscalations.delete(escalationId);
  }

  for (const [questionId, pending] of pendingQuestions.entries()) {
    pending.reject(new Error(reason));
    pendingQuestions.delete(questionId);
  }
}

async function persistSessionArchiveForRuntime(runtime: EngineRuntime, sessionId: string): Promise<void> {
  const session = runtime.sessions.getSession(sessionId);
  const agent = sessionAgents.get(sessionId);
  if (!session || !agent) return;
  runtime.store.syncSessionMessages(session.id, agent.getMessages());
  await runtime.archive.syncSession(session, agent.getMessages());
}

/** Create the tRPC router bound to a runtime instance */
export function createAppRouter(runtime: EngineRuntime) {
  /** Build the policy manager from config + built-in tool danger levels */
  const builtinLevels = new Map<string, DangerLevel>(
    runtime.tools.map((t) => [t.name, t.dangerLevel]),
  );
  const policyManager = new ToolPolicyManager(
    runtime.config.getConfigFile().runtime.toolPolicy,
    builtinLevels,
  );
  const capabilityCatalog = buildToolCapabilityCatalog(runtime.tools, runtime.mcp);

  function getDangerLevel(toolName: string): DangerLevel {
    return policyManager.getDangerLevel(toolName);
  }

  function getCapability(toolName: string) {
    return capabilityCatalog.get(toolName);
  }

  function withEventMeta<T extends Omit<EngineEvent, "sessionId" | "timestamp" | "runId" | "parentRunId" | "connectorType" | "source" | "taskId">>(
    event: T,
    meta: {
      sessionId: string;
      connectorType: ConnectorType;
      runId?: string;
      source: string;
      parentRunId?: string | null;
      taskId?: string;
    },
  ): EngineEvent {
    return {
      ...event,
      sessionId: meta.sessionId,
      connectorType: meta.connectorType,
      runId: meta.runId,
      parentRunId: meta.parentRunId,
      source: meta.source,
      taskId: meta.taskId,
      timestamp: Date.now(),
    } as unknown as EngineEvent;
  }

  const retryPolicySchema = z.object({
    maxAttempts: z.number().int().min(1).max(10).optional(),
    delaySeconds: z.number().int().min(0).max(3600).optional(),
  }).optional();

  /** Resolve effective danger level — applies exec hybrid classification */
  function getEffectiveDangerLevel(toolName: string, args: Record<string, unknown>): DangerLevel {
    let level = getDangerLevel(toolName);
    if (toolName === "exec" && typeof args.command === "string") {
      const agentDeclared = (args.danger as DangerLevel | undefined) ?? "dangerous";
      level = classifyExecCommand(args.command, agentDeclared);
    }
    return level;
  }

  /** Auth middleware — validates bearer token via AuthManager */
  const authMiddleware = middleware(async ({ ctx, next }) => {
    if (!ctx.token) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing auth token" });
    }
    const entry = runtime.auth.validate(ctx.token);
    if (!entry) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid auth token" });
    }
    if (entry.type === "webhook") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Webhook tokens cannot access the tRPC API" });
    }
    return next({
      ctx: {
        ...ctx,
        connectorId: entry.connectorId,
        connectorType: entry.connectorType,
        tokenType: entry.type,
      },
    });
  });

  const protectedProcedure = publicProcedure.use(authMiddleware);
  const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
    if (ctx.tokenType !== "master") {
      throw new TRPCError({ code: "FORBIDDEN", message: "This procedure requires the master token" });
    }
    return next();
  });

  function isMasterCall(ctx: { tokenType: string | null }): boolean {
    return ctx.tokenType === "master";
  }

  function requireOwnedSession(
    ctx: { tokenType: string | null; connectorId: string | null; connectorType: string | null },
    sessionId: string,
  ) {
    const session = runtime.sessions.getSession(sessionId);
    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Session not found: ${sessionId}` });
    }
    if (isMasterCall(ctx)) {
      return session;
    }
    if (ctx.tokenType !== "session") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Session token required" });
    }
    if (session.connectorType !== ctx.connectorType || session.connectorId !== ctx.connectorId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this session" });
    }
    return session;
  }

  function requireOwnedPrefix(
    ctx: { tokenType: string | null; connectorId: string | null; connectorType: string | null },
    prefix: string,
    connectorType?: string,
  ): void {
    if (isMasterCall(ctx)) {
      return;
    }
    if (ctx.tokenType !== "session") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Session token required" });
    }
    if (connectorType && connectorType !== ctx.connectorType) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Connector type mismatch" });
    }
    if (prefix !== ctx.connectorId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only operate on your own connector prefix" });
    }
  }

  function filterOwnedRecords<T extends { connectorType: string; connectorId: string }>(
    ctx: { tokenType: string | null; connectorId: string | null; connectorType: string | null },
    entries: T[],
  ): T[] {
    if (isMasterCall(ctx)) {
      return entries;
    }
    return entries.filter((entry) => entry.connectorType === ctx.connectorType && entry.connectorId === ctx.connectorId);
  }

  async function requireOwnedArchivedSession(
    ctx: { tokenType: string | null; connectorId: string | null; connectorType: string | null },
    sessionId: string,
  ) {
    const record = await runtime.archive.getSessionRecord(sessionId);
    if (!record) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Session not found: ${sessionId}` });
    }
    if (isMasterCall(ctx)) {
      return record;
    }
    if (ctx.tokenType !== "session") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Session token required" });
    }
    if (record.connectorType !== ctx.connectorType || record.connectorId !== ctx.connectorId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this session" });
    }
    return record;
  }

  /** Resolve the tool approval mode for a session */
  function getApprovalMode(sessionId: string): ToolApprovalMode {
    const session = runtime.sessions.getSession(sessionId);
    if (!session) return "ask";
    const connectorType = session.connectorType as ConnectorType;
    const configFile = runtime.config.getConfigFile();
    return configFile.runtime.toolApproval?.[connectorType] ?? (connectorType === "tui" ? "never" : "ask");
  }

  async function persistSessionArchive(sessionId: string): Promise<void> {
    await persistSessionArchiveForRuntime(runtime, sessionId);
  }

  function cancelActiveRun(sessionId: string, errorMessage: string): boolean {
    const runId = activeRunsBySession.get(sessionId);
    if (!runId) {
      return false;
    }
    finishRun(sessionId, runId, {
      status: "cancelled",
      errorMessage,
    });
    return true;
  }

  function resolvePendingApprovalsForSession(
    sessionId: string,
    status: "denied" | "interrupted",
  ): void {
    for (const [toolCallId, meta] of pendingApprovalMeta.entries()) {
      if (meta.sessionId !== sessionId) {
        continue;
      }
      runtime.store.resolveApproval(toolCallId, status);
      const resolver = pendingApprovals.get(toolCallId);
      if (resolver) {
        resolver(false);
        pendingApprovals.delete(toolCallId);
      }
      pendingApprovalMeta.delete(toolCallId);
    }
  }

  function resolvePendingEscalationsForSession(sessionId: string): void {
    for (const [escId, pending] of pendingEscalations.entries()) {
      if (pending.sessionId !== sessionId) {
        continue;
      }
      pending.resolve("deny");
      pendingEscalations.delete(escId);
    }
  }

  function rejectPendingQuestionsForSession(sessionId: string, message: string): void {
    for (const [questionId, pending] of pendingQuestions.entries()) {
      if (pending.sessionId !== sessionId) {
        continue;
      }
      pending.reject(new Error(message));
      pendingQuestions.delete(questionId);
    }
  }

  function startRun(
    sessionId: string,
    trigger: string,
    inputText: string,
    parentRunId?: string,
  ): string {
    const runId = crypto.randomUUID();
    runtime.store.createRun({
      runId,
      sessionId,
      trigger,
      status: "running",
      inputText,
      startedAt: Date.now(),
      parentRunId,
    });
    activeRunsBySession.set(sessionId, runId);
    return runId;
  }

  function finishRun(
    sessionId: string,
    runId: string,
    updates: {
      status: "completed" | "failed" | "cancelled" | "interrupted";
      stopReason?: string;
      errorMessage?: string;
    },
  ): void {
    if (activeRunsBySession.get(sessionId) === runId) {
      activeRunsBySession.delete(sessionId);
    }
    runtime.store.finishRun(runId, {
      status: updates.status,
      completedAt: Date.now(),
      stopReason: updates.stopReason,
      errorMessage: updates.errorMessage,
    });
  }

  function resolveWorkingDir(sessionId?: string, workingDir?: string): string {
    if (workingDir && workingDir.trim()) {
      return workingDir;
    }
    const sessionDir = sessionId ? sessionToolEnvironments.get(sessionId)?.workingDir : undefined;
    return sessionDir ?? process.env.TERMINAL_CWD ?? process.cwd();
  }

  function getSessionPrompt(sessionId: string): { value: string } {
    let state = sessionPromptState.get(sessionId);
    if (!state) {
      state = { value: runtime.systemPrompt };
      sessionPromptState.set(sessionId, state);
    }
    return state;
  }

  async function refreshSessionPrompt(
    sessionId: string,
    input: {
      trigger: string;
      connectorType: string;
      overlay?: string;
      attachedSkills?: string[];
    },
  ): Promise<string> {
    const promptState = getSessionPrompt(sessionId);
    const liveMessages = sessionAgents.get(sessionId)?.getMessages() ?? runtime.store.getSessionMessages(sessionId);
    const sessionTools = sessionToolEnvironments.get(sessionId)?.tools;
    try {
      promptState.value = await runtime.promptEngine.buildSessionPrompt({
        sessionId,
        connectorType: input.connectorType,
        trigger: input.trigger,
        overlay: input.overlay,
        attachedSkills: input.attachedSkills,
        messages: liveMessages,
        tools: sessionTools,
      });
    } catch {
      promptState.value = runtime.systemPrompt;
    }
    return promptState.value;
  }

  /** Get or create an Agent for a session */
  function getSessionAgent(sessionId: string): Agent {
    let agent = sessionAgents.get(sessionId);
    if (!agent) {
      const promptState = getSessionPrompt(sessionId);
      const sessionBaseTools = runtime.mcp.filterToolsForSession(runtime.tools, sessionId);
      const toolEnvironment = createSessionToolEnvironment({
        baseTools: sessionBaseTools,
        checkpointManager: runtime.checkpoints,
        maxContextHintChars: runtime.config.getConfigFile().runtime.contextFiles?.maxHintChars,
        delegation: buildDelegationOptions(runtime),
      });
      sessionToolEnvironments.set(sessionId, toolEnvironment);

      const onAskUser = async (id: string, question: string, options?: string[]): Promise<string> => {
        return new Promise<string>((resolve, reject) => {
          pendingQuestions.set(id, { resolve, reject, sessionId });
          // 10-minute timeout — questions may need thought
          setTimeout(() => {
            if (pendingQuestions.has(id)) {
              pendingQuestions.delete(id);
              reject(new Error("Question timed out after 10 minutes"));
            }
          }, 10 * 60 * 1000);
        });
      };

      agent = new Agent({
        router: runtime.router,
        tools: toolEnvironment.tools,
        getSystemPrompt: () => promptState.value,
        onAskUser,
        onToolApproval: async (toolName, toolCallId, args) => {
          const mode = getApprovalMode(sessionId);
          const level = getEffectiveDangerLevel(toolName, args);
          const decision = resolveCapabilityPolicyDecision(getCapability(toolName), level, mode);
          const overrides = sessionToolOverrides.get(sessionId);

          if (level === "safe") {
            pendingApprovalMeta.delete(toolCallId);
            runtime.store.resolveApproval(toolCallId, "approved");
            return true;
          }

          if (overrides?.has(toolName)) {
            pendingApprovalMeta.delete(toolCallId);
            runtime.store.resolveApproval(toolCallId, "allow_session");
            return true;
          }

          if (decision.approvalRequired) {
            return new Promise<boolean>((resolve) => {
              pendingApprovals.set(toolCallId, resolve);
              setTimeout(() => {
                if (pendingApprovals.has(toolCallId)) {
                  pendingApprovals.delete(toolCallId);
                  pendingApprovalMeta.delete(toolCallId);
                  runtime.store.resolveApproval(toolCallId, "denied");
                  resolve(false);
                }
              }, 5 * 60 * 1000);
            });
          }

          pendingApprovalMeta.delete(toolCallId);
          runtime.store.resolveApproval(toolCallId, "approved");
          return true;
        },
      });
      const persistedMessages = runtime.store.getSessionMessages(sessionId);
      if (persistedMessages.length > 0) {
        agent.hydrateHistory(persistedMessages);
      }
      sessionAgents.set(sessionId, agent);
    }
    return agent;
  }

  /** Shared generator that filters agent events through the policy manager */
  async function* filterAgentEvents(
    events: AsyncIterable<AgentEvent>,
    connectorType: ConnectorType,
    approvalMode: ToolApprovalMode,
    runId: string,
    sessionId?: string,
    source = "chat",
  ): AsyncGenerator<EngineEvent> {
    const isIM = connectorType !== "tui";
    const sid = sessionId ?? "unknown";
    const toolEventMeta = new Map<string, ReturnType<typeof resolveCapabilityPolicyDecision>>();

    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
          yield withEventMeta(event, { sessionId: sid, connectorType, runId, source });
          break;
        case "thinking_delta":
          yield withEventMeta(event, { sessionId: sid, connectorType, runId, source });
          break;
        case "done":
          yield withEventMeta(event, { sessionId: sid, connectorType, runId, source });
          break;
        case "error":
          yield withEventMeta(event, { sessionId: sid, connectorType, runId, source });
          break;
        case "user_question":
          yield withEventMeta(event, { sessionId: sid, connectorType, runId, source });
          break;
        case "tool_start": {
          const dangerLevel = getEffectiveDangerLevel(event.name, event.args);
          const ctx: ToolEventContext = { toolName: event.name, dangerLevel };
          const capability = getCapability(event.name);
          const decision = resolveCapabilityPolicyDecision(capability, dangerLevel, approvalMode);
          toolEventMeta.set(event.id, decision);

          runtime.store.recordToolCallStart({
            toolCallId: event.id,
            runId,
            sessionId: sid,
            toolName: event.name,
            args: event.args,
          });

          // Audit: tool_call
          auditLog(runtime, {
            session: sid,
            connector: connectorType,
            event: "tool_call",
            run: runId,
            tool: event.name,
            toolset: decision.toolsetName,
            backend: decision.executionBackend,
            danger: dangerLevel,
            approval: decision.policyDecision,
            capabilityScope: decision.capabilityScope,
            isolation: decision.isolationBoundary,
            mcpServer: decision.mcpServer,
            mcpTrust: decision.mcpTrust,
            command: event.name === "exec" && typeof event.args.command === "string" ? event.args.command : undefined,
            url: event.name === "web_fetch" && typeof event.args.url === "string" ? event.args.url : undefined,
          });

          if (!policyManager.shouldEmitToolStart(connectorType, ctx)) break;
          if (isIM) {
            const argsStr = formatArgsForIM(event.name, event.args);
            yield withEventMeta(
              { type: "tool_end", name: event.name, id: event.id, content: argsStr, isError: false },
              { sessionId: sid, connectorType, runId, source },
            );
          } else {
            yield withEventMeta(
              { type: "tool_start", name: event.name, id: event.id },
              { sessionId: sid, connectorType, runId, source },
            );
          }
          break;
        }
        case "tool_end": {
          const decision = toolEventMeta.get(event.id)
            ?? resolveCapabilityPolicyDecision(getCapability(event.name), getDangerLevel(event.name), approvalMode);
          runtime.store.recordToolCallEnd({
            toolCallId: event.id,
            status: event.result.isError ? "failed" : "completed",
            result: event.result,
          });

          // Audit: tool_result
          auditLog(runtime, {
            session: sid,
            connector: connectorType,
            event: "tool_result",
            run: runId,
            tool: event.name,
            toolset: decision.toolsetName,
            backend: decision.executionBackend,
            approval: decision.policyDecision,
            capabilityScope: decision.capabilityScope,
            isolation: decision.isolationBoundary,
            mcpServer: decision.mcpServer,
            mcpTrust: decision.mcpTrust,
            summary: event.result.content.slice(0, 200),
          });

          // Intercept reaction tool — emit a reaction event for connectors
          if (event.name === "reaction" && event.result.content.startsWith("__reaction__:")) {
            const emoji = event.result.content.slice("__reaction__:".length);
            yield withEventMeta(
              { type: "reaction", emoji },
              { sessionId: sid, connectorType, runId, source },
            );
          } else {
            const ctx: ToolEventContext = {
              toolName: event.name,
              dangerLevel: decision.dangerLevel,
              isError: event.result.isError,
            };
            if (policyManager.shouldEmitToolEnd(connectorType, ctx)) {
              yield withEventMeta({
                type: "tool_end",
                name: event.name,
                id: event.id,
                content: event.result.content,
                isError: event.result.isError ?? false,
              }, { sessionId: sid, connectorType, runId, source });
            }
          }
          toolEventMeta.delete(event.id);
          break;
        }
        case "tool_approval_request": {
          const dangerLevel = getEffectiveDangerLevel(event.name, event.args);
          const decision = resolveCapabilityPolicyDecision(getCapability(event.name), dangerLevel, approvalMode);
          toolEventMeta.set(event.id, decision);
          pendingApprovalMeta.set(event.id, {
            sessionId: sid,
            toolName: event.name,
            runId,
          });
          runtime.store.recordApprovalPending({
            approvalId: event.id,
            runId,
            sessionId: sid,
            toolCallId: event.id,
            toolName: event.name,
            args: event.args,
          });
          const ctx: ToolEventContext = {
            toolName: event.name,
            dangerLevel,
          };
          if (!policyManager.shouldEmitApproval(connectorType, ctx, approvalMode)) break;
          yield withEventMeta({
            type: "tool_approval_request",
            name: event.name,
            id: event.id,
            args: event.args,
          }, { sessionId: sid, connectorType, runId, source });
          break;
        }
      }
    }
  }

  return router({
    /** Health check */
    health: router({
      ping: publicProcedure.query(() => {
        return {
          status: "ok" as const,
          uptime: process.uptime(),
          sessions: runtime.sessions.listSessions().length,
          model: runtime.router.getActiveModelName(),
          agentName: runtime.agentName,
        };
      }),
    }),

    /** Chat procedures */
    chat: router({
      /** Send a user message and stream back AgentEvents */
      send: protectedProcedure
        .input(z.object({ sessionId: z.string(), message: z.string() }))
        .mutation(async ({ ctx, input }): Promise<{ sessionId: string }> => {
          requireOwnedSession(ctx, input.sessionId);
          runtime.sessions.touchSession(input.sessionId);
          return { sessionId: input.sessionId };
        }),

      /** Stream AgentEvents for a chat turn */
      stream: protectedProcedure
        .input(z.object({ sessionId: z.string(), message: z.string() }))
        .subscription(async function* ({ ctx, input }): AsyncGenerator<EngineEvent> {
          let session;
          try {
            session = requireOwnedSession(ctx, input.sessionId);
          } catch (err) {
            yield withEventMeta(
              { type: "error", message: err instanceof Error ? err.message : String(err) },
              { sessionId: input.sessionId, connectorType: (ctx.connectorType as ConnectorType) ?? "engine", source: "chat" },
            );
            return;
          }

          runtime.sessions.touchSession(input.sessionId);
          const agent = getSessionAgent(input.sessionId);
          const connectorType = session.connectorType as ConnectorType;
          sessionToolEnvironments.get(input.sessionId)?.newTurn();

          // Expand @file / @folder / @diff / @url context references first.
          let chatMessage = input.message;
          try {
            const webFetchTool = runtime.tools.find((tool) => tool.name === "web_fetch");
            const contextRefs = await preprocessContextReferences(chatMessage, {
              cwd: sessionToolEnvironments.get(input.sessionId)?.workingDir,
              fetchUrl: webFetchTool
                ? async (url: string) => {
                  const result = await webFetchTool.execute({ url });
                  return result.content;
                }
                : undefined,
            });
            chatMessage = contextRefs.message;
          } catch {
            // Reference expansion is best-effort only.
          }

          // Augment message with relevant memory context
          try {
            const memContext = await runtime.memory.getMemoryContext(chatMessage);
            if (memContext) {
              chatMessage = `<memory_context>\n${memContext}\n</memory_context>\n\n${chatMessage}`;
            }
          } catch {
            // Memory context fetch failed — continue without it
          }

          await refreshSessionPrompt(input.sessionId, {
            trigger: "chat",
            connectorType,
          });
          const runId = startRun(input.sessionId, "chat", chatMessage);
          let finalStatus: "completed" | "failed" | "interrupted" = "completed";
          let finalStopReason: string | undefined;
          let finalErrorMessage: string | undefined;

          try {
            for await (const event of filterAgentEvents(
              agent.chat(chatMessage),
              connectorType,
              getApprovalMode(input.sessionId),
              runId,
              input.sessionId,
              "chat",
            )) {
              if (event.type === "done") {
                finalStopReason = event.stopReason;
              } else if (event.type === "error") {
                finalStatus = "failed";
                finalErrorMessage = event.message;
              }
              yield event;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            finalStatus = "failed";
            finalErrorMessage = message;
            yield withEventMeta(
              { type: "error", message },
              { sessionId: input.sessionId, connectorType, runId, source: "chat" },
            );
          } finally {
            finishRun(input.sessionId, runId, {
              status: finalStatus,
              stopReason: finalStopReason,
              errorMessage: finalErrorMessage,
            });
            await persistSessionArchive(input.sessionId);
          }
        }),

      /** Stop a running agent in a specific session */
      stop: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(async ({ ctx, input }): Promise<{ cancelled: boolean }> => {
          requireOwnedSession(ctx, input.sessionId);
          const agent = sessionAgents.get(input.sessionId);
          const cancelledRun = cancelActiveRun(input.sessionId, "Stopped by user");
          if (!agent && !cancelledRun) {
            return { cancelled: false };
          }
          const cancelled = agent?.abort() ?? false;

          resolvePendingApprovalsForSession(input.sessionId, "denied");
          resolvePendingEscalationsForSession(input.sessionId);
          rejectPendingQuestionsForSession(input.sessionId, "Stopped by user");

          const session = runtime.sessions.getSession(input.sessionId);
          auditLog(runtime, {
            session: input.sessionId,
            connector: session?.connectorType ?? "unknown",
            event: "tool_call",
            tool: "stop",
            summary: cancelled ? "Agent stopped" : "No agent running",
          });

          await persistSessionArchive(input.sessionId);
          return { cancelled: cancelled || cancelledRun };
        }),

      /** Stop all running agents across all sessions */
      stopAll: protectedProcedure
        .mutation(async ({ ctx }): Promise<{ cancelled: number; total: number }> => {
          if (!isMasterCall(ctx)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "stopAll requires the master token" });
          }
          const targetSessionIds = new Set<string>([
            ...sessionAgents.keys(),
            ...activeRunsBySession.keys(),
          ]);
          let cancelled = 0;
          let total = 0;

          for (const sid of targetSessionIds) {
            const agent = sessionAgents.get(sid);
            const cancelledRun = cancelActiveRun(sid, "Stopped by user");
            const aborted = agent?.abort() ?? false;
            const wasActive = cancelledRun || agent?.isRunning;
            if (!wasActive) {
              continue;
            }
            total++;
            if (aborted || cancelledRun) {
              cancelled++;
            }

            resolvePendingApprovalsForSession(sid, "denied");
            resolvePendingEscalationsForSession(sid);
            rejectPendingQuestionsForSession(sid, "Stopped by user");
          }

          auditLog(runtime, {
            session: "global",
            connector: "engine",
            event: "tool_call",
            tool: "stopAll",
            summary: `Stopped ${cancelled}/${total} agents`,
          });

          for (const sid of sessionAgents.keys()) {
            await persistSessionArchive(sid);
          }
          return { cancelled, total };
        }),

      /** Get conversation history for a session */
      history: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(async ({ ctx, input }): Promise<{ sessionId: string; messages: unknown[]; archived: boolean }> => {
          const liveSession = runtime.sessions.getSession(input.sessionId);
          const agent = sessionAgents.get(input.sessionId);
          if (agent) {
            requireOwnedSession(ctx, input.sessionId);
            await persistSessionArchive(input.sessionId);
            return {
              sessionId: input.sessionId,
              messages: Array.from(agent.getMessages()),
              archived: false,
            };
          }

          if (liveSession) {
            requireOwnedSession(ctx, input.sessionId);
            const persistedMessages = runtime.store.getSessionMessages(input.sessionId);
            if (persistedMessages.length > 0) {
              return {
                sessionId: input.sessionId,
                messages: persistedMessages,
                archived: false,
              };
            }
          } else {
            await requireOwnedArchivedSession(ctx, input.sessionId);
          }
          const messages = await runtime.archive.getHistory(input.sessionId);
          return {
            sessionId: input.sessionId,
            messages,
            archived: messages.length > 0,
          };
        }),

      /** Transcribe audio and send as a chat message */
      transcribeAndSend: protectedProcedure
        .input(z.object({
          sessionId: z.string(),
          audio: z.string(), // base64-encoded audio
          format: z.string(), // e.g. "ogg", "mp3", "wav", "m4a"
        }))
        .subscription(async function* ({ ctx, input }): AsyncGenerator<EngineEvent & { transcript?: string }> {
          let session;
          try {
            session = requireOwnedSession(ctx, input.sessionId);
          } catch (err) {
            yield withEventMeta(
              { type: "error", message: err instanceof Error ? err.message : String(err) },
              { sessionId: input.sessionId, connectorType: (ctx.connectorType as ConnectorType) ?? "engine", source: "audio_transcription" },
            );
            return;
          }

          const audioConfig = runtime.config.getConfigFile().runtime.audio;
          if (audioConfig && !audioConfig.enabled) {
            yield withEventMeta(
              { type: "error", message: "Audio transcription is disabled in config" },
              { sessionId: input.sessionId, connectorType: session.connectorType as ConnectorType, source: "audio_transcription" },
            );
            return;
          }

          runtime.sessions.touchSession(input.sessionId);

          // Transcribe audio
          let transcript: string;
          try {
            const audioBuffer = Buffer.from(input.audio, "base64");
            transcript = await runtime.transcriber.transcribe(audioBuffer, input.format);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            yield withEventMeta(
              { type: "error", message: `Transcription failed: ${message}` },
              { sessionId: input.sessionId, connectorType: session.connectorType as ConnectorType, source: "audio_transcription" },
            );
            return;
          }

          if (!transcript.trim()) {
            yield withEventMeta(
              { type: "error", message: "Transcription produced empty text" },
              { sessionId: input.sessionId, connectorType: session.connectorType as ConnectorType, source: "audio_transcription" },
            );
            return;
          }

          // Yield transcript as metadata before streaming the response
          yield {
            ...withEventMeta(
              { type: "text_delta", delta: "" },
              { sessionId: input.sessionId, connectorType: session.connectorType as ConnectorType, source: "audio_transcription" },
            ),
            transcript,
          };

          // Process transcript as a normal chat message
          const agent = getSessionAgent(input.sessionId);
          const connectorType = session.connectorType as ConnectorType;
          sessionToolEnvironments.get(input.sessionId)?.newTurn();
          await refreshSessionPrompt(input.sessionId, {
            trigger: "audio_transcription",
            connectorType,
          });
          const runId = startRun(input.sessionId, "audio_transcription", transcript);
          let finalStatus: "completed" | "failed" | "interrupted" = "completed";
          let finalStopReason: string | undefined;
          let finalErrorMessage: string | undefined;
          try {
            for await (const event of filterAgentEvents(
              agent.chat(transcript),
              connectorType,
              getApprovalMode(input.sessionId),
              runId,
              input.sessionId,
              "audio_transcription",
            )) {
              if (event.type === "done") {
                finalStopReason = event.stopReason;
              } else if (event.type === "error") {
                finalStatus = "failed";
                finalErrorMessage = event.message;
              }
              yield event;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            finalStatus = "failed";
            finalErrorMessage = message;
            yield withEventMeta(
              { type: "error", message },
              { sessionId: input.sessionId, connectorType, runId, source: "audio_transcription" },
            );
          } finally {
            finishRun(input.sessionId, runId, {
              status: finalStatus,
              stopReason: finalStopReason,
              errorMessage: finalErrorMessage,
            });
            await persistSessionArchive(input.sessionId);
          }
        }),
    }),

    /** Session management */
    session: router({
      /** Create a new session for a Connector.
       *  prefix: structured session prefix (e.g. "tui", "telegram:123456")
       */
      create: protectedProcedure
        .input(
          z.object({
            connectorType: ConnectorTypeSchema,
            prefix: z.string(),
          }),
        )
        .mutation(({ ctx, input }) => {
          requireOwnedPrefix(ctx, input.prefix, input.connectorType);
          const session = runtime.sessions.create(input.prefix, input.connectorType);
          auditLog(runtime, {
            session: session.id,
            connector: input.connectorType,
            event: "session_create",
          });
          return { session };
        }),

      /** Get the most recently active session for a prefix */
      getLatest: protectedProcedure
        .input(z.object({ prefix: z.string() }))
        .query(({ ctx, input }) => {
          requireOwnedPrefix(ctx, input.prefix);
          return runtime.sessions.getLatest(input.prefix) ?? null;
        }),

      /** List active sessions */
      list: protectedProcedure.query(({ ctx }) => {
        return filterOwnedRecords(ctx, runtime.sessions.listSessions());
      }),

      /** List recently archived sessions */
      listArchived: protectedProcedure
        .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
        .query(async ({ ctx, input }) => {
          return filterOwnedRecords(ctx, await runtime.archive.listRecent(input?.limit ?? 20));
        }),

      /** Search archived sessions by content and summary */
      search: protectedProcedure
        .input(z.object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(50).optional(),
        }))
        .query(async ({ ctx, input }) => {
          return filterOwnedRecords(ctx, await runtime.archive.search(input.query, input.limit ?? 10));
        }),

      /** Destroy a session and its Agent */
      destroy: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(async ({ ctx, input }): Promise<{ destroyed: boolean }> => {
          const existing = runtime.sessions.getSession(input.sessionId);
          if (!existing) {
            return { destroyed: false };
          }
          const session = requireOwnedSession(ctx, input.sessionId);
          sessionAgents.get(input.sessionId)?.abort();
          cancelActiveRun(input.sessionId, "Session destroyed");
          resolvePendingApprovalsForSession(input.sessionId, "denied");
          resolvePendingEscalationsForSession(input.sessionId);
          rejectPendingQuestionsForSession(input.sessionId, "Session destroyed");
          await persistSessionArchive(input.sessionId);
          auditLog(runtime, {
            session: input.sessionId,
            connector: session?.connectorType ?? "unknown",
            event: "session_destroy",
          });
          sessionAgents.delete(input.sessionId);
          sessionPromptState.delete(input.sessionId);
          sessionToolEnvironments.delete(input.sessionId);
          sessionToolOverrides.delete(input.sessionId);
          sessionSecurityOverrides.delete(input.sessionId);
          runtime.securityMode.clearMode(input.sessionId);
          return { destroyed: runtime.sessions.destroySession(input.sessionId) };
        }),
    }),

    /** Filesystem checkpoints */
    checkpoint: router({
      list: protectedProcedure
        .input(z.object({
          sessionId: z.string().optional(),
          workingDir: z.string().optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
          if (!isMasterCall(ctx) && input?.workingDir) {
            throw new TRPCError({ code: "FORBIDDEN", message: "workingDir overrides require the master token" });
          }
          if (input?.sessionId) {
            requireOwnedSession(ctx, input.sessionId);
          } else if (!isMasterCall(ctx)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "sessionId is required for checkpoint access" });
          }
          const workingDir = resolveWorkingDir(input?.sessionId, input?.workingDir);
          const checkpoints = await runtime.checkpoints.listCheckpoints(workingDir);
          return { workingDir, checkpoints };
        }),

      diff: protectedProcedure
        .input(z.object({
          commitHash: z.string(),
          sessionId: z.string().optional(),
          workingDir: z.string().optional(),
        }))
        .query(async ({ ctx, input }) => {
          if (!isMasterCall(ctx) && input.workingDir) {
            throw new TRPCError({ code: "FORBIDDEN", message: "workingDir overrides require the master token" });
          }
          if (input.sessionId) {
            requireOwnedSession(ctx, input.sessionId);
          } else if (!isMasterCall(ctx)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "sessionId is required for checkpoint access" });
          }
          const workingDir = resolveWorkingDir(input.sessionId, input.workingDir);
          const result = await runtime.checkpoints.diff(workingDir, input.commitHash);
          return { workingDir, ...result };
        }),

      restore: protectedProcedure
        .input(z.object({
          commitHash: z.string(),
          filePath: z.string().optional(),
          sessionId: z.string().optional(),
          workingDir: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          if (!isMasterCall(ctx) && input.workingDir) {
            throw new TRPCError({ code: "FORBIDDEN", message: "workingDir overrides require the master token" });
          }
          if (input.sessionId) {
            requireOwnedSession(ctx, input.sessionId);
          } else if (!isMasterCall(ctx)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "sessionId is required for checkpoint access" });
          }
          const workingDir = resolveWorkingDir(input.sessionId, input.workingDir);
          const result = await runtime.checkpoints.restore(workingDir, input.commitHash, input.filePath);
          return { workingDir, ...result };
        }),
    }),

    /** Durable operator memory inspection */
    memory: router({
      overview: adminProcedure
        .input(z.object({
          journalLimit: z.number().int().min(1).max(50).optional(),
        }).optional())
        .query(async ({ input }) => {
          const curated = await runtime.memory.loadContext();
          return {
            curatedLength: curated.length,
            curatedPreview: curated.trim() ? curated.slice(0, 400) : null,
            layers: {
              profile: await runtime.memory.listLayer("profile"),
              project: await runtime.memory.listLayer("project"),
              operational: await runtime.memory.listLayer("operational"),
            },
            journals: await runtime.memory.listJournalDates(input?.journalLimit ?? 10),
          };
        }),

      read: adminProcedure
        .input(z.object({
          layer: z.enum(["curated", "profile", "project", "operational", "journal"]),
          key: z.string().optional(),
        }))
        .query(async ({ input }) => {
          if (input.layer === "curated") {
            const content = await runtime.memory.loadContext();
            return { exists: content.length > 0, content };
          }

          if (!input.key) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "key is required for this memory layer" });
          }

          const content = input.layer === "journal"
            ? await runtime.memory.getJournal(input.key)
            : await runtime.memory.getLayer(input.layer, input.key);

          return { exists: content !== null, content };
        }),

      search: adminProcedure
        .input(z.object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(50).optional(),
        }))
        .query(({ input }) => {
          return runtime.memory.searchIndex(input.query, {
            maxResults: input.limit ?? 10,
          });
        }),
    }),

      /** Toolset metadata */
    toolset: router({
      list: adminProcedure.query(() => {
        return listToolsets(runtime.tools);
      }),
    }),

    /** MCP metadata and non-tool surfaces */
    mcp: router({
      listServers: adminProcedure.query(() => {
        return runtime.mcp.listServers();
      }),

      listSessionServers: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ ctx, input }) => {
          requireOwnedSession(ctx, input.sessionId);
          return runtime.mcp.listSessionServers(input.sessionId);
        }),

      setSessionServer: protectedProcedure
        .input(z.object({
          sessionId: z.string(),
          server: z.string(),
          enabled: z.boolean(),
        }))
        .mutation(({ ctx, input }) => {
          requireOwnedSession(ctx, input.sessionId);
          const servers = runtime.mcp.listServers();
          const server = servers.find((item) => item.name === input.server);
          if (!server) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Unknown MCP server: ${input.server}` });
          }
          if (!isMasterCall(ctx) && server.sessionAvailability === "admin_only") {
            throw new TRPCError({ code: "FORBIDDEN", message: `MCP server "${input.server}" requires the master token` });
          }
          runtime.mcp.setSessionServerEnabled(input.sessionId, input.server, input.enabled);
          return {
            sessionId: input.sessionId,
            server: input.server,
            enabled: input.enabled,
          };
        }),

      listTools: adminProcedure
        .input(z.object({ server: z.string().optional(), sessionId: z.string().optional() }).optional())
        .query(({ input }) => {
          return runtime.mcp.listTools(input?.server, input?.sessionId);
        }),

      listPrompts: adminProcedure
        .input(z.object({ server: z.string() }))
        .query(async ({ input }) => {
          return runtime.mcp.listPrompts(input.server);
        }),

      getPrompt: adminProcedure
        .input(z.object({
          server: z.string(),
          name: z.string(),
          args: z.record(z.string(), z.string()).optional(),
        }))
        .query(async ({ input }) => {
          return {
            server: input.server,
            name: input.name,
            content: await runtime.mcp.getPrompt(input.server, input.name, input.args),
          };
        }),

      listResources: adminProcedure
        .input(z.object({
          server: z.string(),
          cursor: z.string().optional(),
        }))
        .query(async ({ input }) => {
          return runtime.mcp.listResources(input.server, input.cursor);
        }),

      readResource: adminProcedure
        .input(z.object({
          server: z.string(),
          uri: z.string(),
        }))
        .query(async ({ input }) => {
          return {
            server: input.server,
            uri: input.uri,
            content: await runtime.mcp.readResource(input.server, input.uri),
          };
        }),
    }),

    /** Durable approval inspection */
    approval: router({
      list: adminProcedure
        .input(z.object({
          sessionId: z.string().optional(),
          status: z.enum(["pending", "approved", "denied", "allow_session", "interrupted"]).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        }).optional())
        .query(({ input }) => {
          return runtime.store.listApprovals(input);
        }),
    }),

    /** Tool execution */
    tool: router({
      /** Get the tool approval mode for a session */
      config: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ ctx, input }): { mode: ToolApprovalMode } => {
          requireOwnedSession(ctx, input.sessionId);
          return { mode: getApprovalMode(input.sessionId) };
        }),

      /** Approve or reject a pending tool execution */
      approve: protectedProcedure
        .input(
          z.object({
            toolCallId: z.string(),
            approved: z.boolean(),
          }),
        )
        .mutation(({ ctx, input }): { acknowledged: boolean } => {
          const resolver = pendingApprovals.get(input.toolCallId);
          const meta = pendingApprovalMeta.get(input.toolCallId);
          if (!resolver) {
            return { acknowledged: false };
          }
          if (meta) {
            requireOwnedSession(ctx, meta.sessionId);
          }
          runtime.store.resolveApproval(
            input.toolCallId,
            input.approved ? "approved" : "denied",
          );
          pendingApprovals.delete(input.toolCallId);
          pendingApprovalMeta.delete(input.toolCallId);

          // Audit: approval or denial
          if (meta) {
            const session = runtime.sessions.getSession(meta.sessionId);
            auditLog(runtime, {
              session: meta.sessionId,
              connector: session?.connectorType ?? "unknown",
              event: input.approved ? "tool_approval" : "tool_denial",
              tool: meta.toolName,
            });
          }

          resolver(input.approved);
          return { acknowledged: true };
        }),

      /** Accept all calls to a tool for the rest of this session, and approve the current call */
      acceptForSession: protectedProcedure
        .input(
          z.object({
            toolCallId: z.string(),
          }),
        )
        .mutation(({ ctx, input }): { acknowledged: boolean } => {
          const meta = pendingApprovalMeta.get(input.toolCallId);
          const resolver = pendingApprovals.get(input.toolCallId);
          if (!resolver || !meta) {
            return { acknowledged: false };
          }
          requireOwnedSession(ctx, meta.sessionId);

          // Add tool to session overrides
          let overrides = sessionToolOverrides.get(meta.sessionId);
          if (!overrides) {
            overrides = new Set();
            sessionToolOverrides.set(meta.sessionId, overrides);
          }
          overrides.add(meta.toolName);

          // Approve the current call
          runtime.store.resolveApproval(input.toolCallId, "allow_session");
          pendingApprovals.delete(input.toolCallId);
          pendingApprovalMeta.delete(input.toolCallId);
          resolver(true);
          return { acknowledged: true };
        }),
    }),

    /** Security escalation */
    escalation: router({
      /** Respond to a security escalation prompt */
      respond: protectedProcedure
        .input(z.object({
          id: z.string(),
          choice: z.enum(["allow_once", "allow_session", "add_persistent", "deny"]),
        }))
        .mutation(async ({ ctx, input }): Promise<{ acknowledged: boolean }> => {
          const pending = pendingEscalations.get(input.id);
          if (!pending) {
            return { acknowledged: false };
          }
          requireOwnedSession(ctx, pending.sessionId);
          pendingEscalations.delete(input.id);

          // Audit: escalation response
          const session = runtime.sessions.getSession(pending.sessionId);
          auditLog(runtime, {
            session: pending.sessionId,
            connector: session?.connectorType ?? "unknown",
            event: "security_escalation",
            escalation: {
              layer: "escalation",
              choice: input.choice,
            },
          });

          // If allow_session, add the resource to session overrides
          // (the resource info is attached to the escalation — handled by the caller)
          pending.resolve(input.choice as EscalationChoice);
          return { acknowledged: true };
        }),
    }),

    /** User question answering */
    question: router({
      /** Answer a pending user question from the agent */
      answer: protectedProcedure
        .input(z.object({
          id: z.string(),
          answer: z.string(),
        }))
        .mutation(({ ctx, input }): { acknowledged: boolean } => {
          const pending = pendingQuestions.get(input.id);
          if (!pending) {
            return { acknowledged: false };
          }
          requireOwnedSession(ctx, pending.sessionId);
          pendingQuestions.delete(input.id);
          pending.resolve(input.answer);
          return { acknowledged: true };
        }),
    }),

    /** Security mode management */
      securityMode: router({
      /** Get the current security mode for a session */
      get: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ ctx, input }) => {
          requireOwnedSession(ctx, input.sessionId);
          const mode = runtime.securityMode.getMode(input.sessionId);
          const remainingTTL = runtime.securityMode.getRemainingTTL(input.sessionId);
          return { mode, remainingTTL };
        }),

      /** Switch security mode for a session */
      set: protectedProcedure
        .input(z.object({
          sessionId: z.string(),
          mode: z.enum(["default", "trusted", "unrestricted"]),
        }))
        .mutation(({ ctx, input }) => {
          const session = requireOwnedSession(ctx, input.sessionId);
          const connectorType = session?.connectorType ?? "unknown";
          const isIM = connectorType !== "tui" && connectorType !== "engine";
          const previousMode = runtime.securityMode.getMode(input.sessionId);

          const result = runtime.securityMode.setMode(input.sessionId, input.mode, { isIM });
          if (!result.ok) {
            throw new TRPCError({ code: "FORBIDDEN", message: result.error });
          }

          // Audit: mode_change
          auditLog(runtime, {
            session: input.sessionId,
            connector: connectorType,
            event: "mode_change",
            summary: `${previousMode} → ${input.mode}`,
          });

          const ttl = runtime.securityMode.getRemainingTTL(input.sessionId);
          const description = describeModeEffects(input.mode, ttl);
          return { mode: input.mode, remainingTTL: ttl, description };
        }),
    }),

    /** Model management */
    model: router({
      /** List all model configurations */
      list: adminProcedure.query((): ModelConfig[] => {
        return runtime.router.listModelConfigs();
      }),

      /** Get the active model name */
      active: adminProcedure.query((): { name: string } => {
        return { name: runtime.router.getActiveModelName() };
      }),

      /** Switch the active model (supports aliases) */
      switch: adminProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ name: string }> => {
          const resolved = runtime.router.resolveAlias(input.name);
          await runtime.router.switchModel(resolved);
          return { name: resolved };
        }),

      /** Add a model configuration */
      add: adminProcedure
        .input(
          z.object({
            name: z.string(),
            provider: z.string(),
            model: z.string(),
            temperature: z.number().optional(),
            maxTokens: z.number().optional(),
          }),
        )
        .mutation(async ({ input }): Promise<{ added: boolean }> => {
          await runtime.router.addModel(input as ModelConfig);
          return { added: true };
        }),

      /** Remove a model configuration */
      remove: adminProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ removed: boolean }> => {
          await runtime.router.removeModel(input.name);
          return { removed: true };
        }),

      /** Get the current tier-to-model mapping */
      tiers: adminProcedure.query(() => {
        return runtime.router.getTierConfig();
      }),

      /** Set a tier's model */
      setTier: adminProcedure
        .input(z.object({
          tier: z.enum(["performance", "normal", "eco"]),
          modelName: z.string(),
        }))
        .mutation(async ({ input }) => {
          await runtime.router.setTierModel(input.tier, input.modelName);
          return { tier: input.tier, modelName: input.modelName };
        }),

      /** Get full routing state (tiers, aliases, active/default model) */
      routing: adminProcedure.query(() => {
        return runtime.router.getRoutingState();
      }),
    }),

    /** Provider management */
    provider: router({
      /** List all configured providers */
      list: adminProcedure.query((): ProviderConfig[] => {
        return runtime.router.listProviders();
      }),

      /** Add a provider configuration */
      add: adminProcedure
        .input(
          z.object({
            id: z.string(),
            type: z.string(),
            apiKeyEnvVar: z.string(),
            baseUrl: z.string().optional(),
          }),
        )
        .mutation(async ({ input }): Promise<{ added: boolean }> => {
          await runtime.router.addProvider(input as ProviderConfig);
          return { added: true };
        }),

      /** Remove a provider configuration */
      remove: adminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }): Promise<{ removed: boolean }> => {
          await runtime.router.removeProvider(input.id);
          return { removed: true };
        }),
    }),

    /** Skills */
    skill: router({
      /** List loaded skills */
      list: adminProcedure.query((): SkillInfo[] => {
        return runtime.skills.getMetadataList().map((s) => ({
          name: s.name,
          description: s.description,
          active: runtime.skills.isActive(s.name),
        }));
      }),

      /** Manually activate a skill */
      activate: adminProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ activated: boolean }> => {
          return { activated: await runtime.skills.activate(input.name) };
        }),

      /** Reload all skills from disk (used after skill install/update) */
      reload: adminProcedure
        .mutation(async (): Promise<{ reloaded: boolean; count: number }> => {
          await runtime.skills.loadAll();
          await runtime.refreshSystemPrompt();
          return { reloaded: true, count: runtime.skills.size };
        }),

    }),

    /** Authentication */
    auth: router({
      /** Device-flow pairing — unauthenticated endpoint */
      pair: publicProcedure
        .input(
          z.object({
            credential: z.string(),
            connectorId: z.string(),
            connectorType: ConnectorTypeSchema,
          }),
        )
        .mutation(({ input }) => {
          const result = runtime.auth.pair(
            input.credential,
            input.connectorId,
            input.connectorType,
          );

          // Audit: auth success/failure
          auditLog(runtime, {
            session: input.connectorId,
            connector: input.connectorType,
            event: result.success ? "auth_success" : "auth_failure",
            summary: result.error,
          });

          return {
            paired: result.success,
            token: result.token ?? null,
            error: result.error ?? null,
          };
        }),

      /** Get a pairing code for remote device-flow */
      code: publicProcedure.query(() => {
        return { code: runtime.auth.generatePairingCode() };
      }),
    }),

    /** Cron scheduler */
    cron: router({
      /** List all scheduled tasks */
      list: adminProcedure.query(() => {
        return runtime.scheduler.list();
      }),

      /** Add a user-defined scheduled task with real agent dispatch */
      add: adminProcedure
        .input(z.object({
          name: z.string(),
          schedule: z.string(),
          prompt: z.string(),
          oneShot: z.boolean().optional(),
          model: z.string().optional(),
          allowedTools: z.array(z.string()).optional(),
          allowedToolsets: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          retryPolicy: retryPolicySchema,
          delivery: z.object({
            connector: z.string().optional(),
          }).optional(),
        }))
        .mutation(async ({ input }) => {
          if (runtime.scheduler.list().some((task) => task.name === input.name)) {
            throw new TRPCError({ code: "CONFLICT", message: `Cron task "${input.name}" already exists` });
          }

          const parsed = parseScheduleInput(input.schedule);
          const task: CronTask = {
            id: crypto.randomUUID(),
            name: input.name,
            schedule: parsed.schedule,
            scheduleKind: parsed.scheduleKind,
            intervalMinutes: parsed.intervalMinutes,
            runAt: parsed.runAt,
            prompt: input.prompt,
            enabled: true,
            paused: false,
            oneShot: input.oneShot ?? parsed.oneShot,
            model: input.model,
            allowedTools: input.allowedTools,
            allowedToolsets: input.allowedToolsets,
            skills: input.skills,
            retryPolicy: input.retryPolicy,
            delivery: input.delivery,
            nextRunAt: computeNextRunAt({
              schedule: parsed.schedule,
              scheduleKind: parsed.scheduleKind,
              intervalMinutes: parsed.intervalMinutes,
              runAt: parsed.runAt,
              oneShot: input.oneShot ?? parsed.oneShot,
            }),
          };

          // Register with the scheduler — handler dispatches to an isolated agent
          registerCronTask(runtime, task);

          // Persist to config
          await persistCronTask(runtime, task);

          return { added: true, name: input.name };
        }),

      /** Update a scheduled task in place */
      update: adminProcedure
        .input(z.object({
          name: z.string(),
          schedule: z.string().optional(),
          prompt: z.string().optional(),
          enabled: z.boolean().optional(),
          paused: z.boolean().optional(),
          oneShot: z.boolean().optional(),
          model: z.string().optional(),
          allowedTools: z.array(z.string()).optional(),
          allowedToolsets: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          retryPolicy: retryPolicySchema,
          delivery: z.object({
            connector: z.string().optional(),
          }).optional(),
        }))
        .mutation(async ({ input }) => {
          const configFile = runtime.config.getConfigFile();
          const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
          const existing = automation.cronTasks.find((task) => task.name === input.name);
          if (!existing) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Cron task not found: ${input.name}` });
          }

          const parsed = input.schedule ? parseScheduleInput(input.schedule) : null;
          const updated: CronTask = {
            ...existing,
            schedule: parsed?.schedule ?? existing.schedule,
            scheduleKind: parsed?.scheduleKind ?? existing.scheduleKind,
            intervalMinutes: parsed?.intervalMinutes ?? existing.intervalMinutes,
            runAt: parsed?.runAt ?? existing.runAt,
            prompt: input.prompt ?? existing.prompt,
            enabled: input.enabled ?? existing.enabled,
            paused: input.paused ?? existing.paused,
            oneShot: input.oneShot ?? existing.oneShot ?? parsed?.oneShot,
            model: input.model ?? existing.model,
            allowedTools: input.allowedTools ?? existing.allowedTools,
            allowedToolsets: input.allowedToolsets ?? existing.allowedToolsets,
            skills: input.skills ?? existing.skills,
            retryPolicy: input.retryPolicy ?? existing.retryPolicy,
            delivery: input.delivery ?? existing.delivery,
          };
          updated.nextRunAt = computeNextRunAt(updated);

          runtime.scheduler.unregister(updated.name);
          registerCronTask(runtime, updated);
          await persistCronTask(runtime, updated);
          return { updated: true, name: updated.name };
        }),

      /** Pause a task without deleting it */
      pause: adminProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }) => {
          const updated = runtime.scheduler.setPaused(input.name, true);
          if (updated) {
            await updateCronTaskState(runtime, input.name, { paused: true, nextRunAt: null });
          }
          return { updated };
        }),

      /** Resume a paused task */
      resume: adminProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }) => {
          const updated = runtime.scheduler.setPaused(input.name, false);
          const task = runtime.scheduler.list().find((item) => item.name === input.name);
          if (updated) {
            await updateCronTaskState(runtime, input.name, {
              paused: false,
              nextRunAt: task?.nextRunAt ?? null,
            });
          }
          return { updated };
        }),

      /** Trigger a task immediately */
      run: adminProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }) => {
          const triggered = await runtime.scheduler.runTask(input.name);
          return { triggered };
        }),

      /** Remove a user-defined scheduled task */
      remove: adminProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }) => {
          const removed = runtime.scheduler.unregister(input.name);
          if (removed) {
            await removeCronTaskFromConfig(runtime, input.name);
          }
          return { removed };
        }),
    }),

    /** Webhook task management */
    webhookTask: router({
      /** List configured webhook tasks */
      list: adminProcedure.query(() => {
        const configFile = runtime.config.getConfigFile();
        return configFile.runtime.automation?.webhookTasks ?? [];
      }),

      /** Add a new webhook task */
      add: adminProcedure
        .input(z.object({
          name: z.string(),
          slug: z.string().regex(/^[a-zA-Z0-9_-]+$/),
          prompt: z.string(),
          enabled: z.boolean().default(true),
          model: z.string().optional(),
          allowedTools: z.array(z.string()).optional(),
          allowedToolsets: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          retryPolicy: retryPolicySchema,
          delivery: z.object({
            connector: z.string().optional(),
          }).optional(),
        }))
        .mutation(async ({ input }) => {
          const configFile = runtime.config.getConfigFile();
          const tasks = configFile.runtime.automation?.webhookTasks ?? [];

          // Check for duplicate slug
          if (tasks.some((t) => t.slug === input.slug)) {
            throw new TRPCError({ code: "CONFLICT", message: `Webhook task with slug "${input.slug}" already exists` });
          }

          if (tasks.some((t) => t.name === input.name)) {
            throw new TRPCError({ code: "CONFLICT", message: `Webhook task "${input.name}" already exists` });
          }

          const createdTask = {
            id: crypto.randomUUID(),
            name: input.name,
            slug: input.slug,
            prompt: input.prompt,
            enabled: input.enabled,
            model: input.model,
            allowedTools: input.allowedTools,
            allowedToolsets: input.allowedToolsets,
            skills: input.skills,
            retryPolicy: input.retryPolicy,
            delivery: input.delivery,
          };
          const nextTasks = [...tasks, createdTask];

          await runtime.config.saveConfig({
            ...configFile,
            runtime: {
              ...configFile.runtime,
              automation: {
                ...configFile.runtime.automation,
                cronTasks: configFile.runtime.automation?.cronTasks ?? [],
                webhookTasks: nextTasks,
              },
            },
          });
          upsertWebhookTaskRecord(runtime, createdTask);

          return { added: true, slug: input.slug };
        }),

      /** Update an existing webhook task */
      update: adminProcedure
        .input(z.object({
          slug: z.string(),
          name: z.string().optional(),
          prompt: z.string().optional(),
          enabled: z.boolean().optional(),
          model: z.string().optional(),
          allowedTools: z.array(z.string()).optional(),
          allowedToolsets: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          retryPolicy: retryPolicySchema,
          delivery: z.object({
            connector: z.string().optional(),
          }).optional(),
        }))
        .mutation(async ({ input }) => {
          const configFile = runtime.config.getConfigFile();
          const tasks = configFile.runtime.automation?.webhookTasks ?? [];
          const task = tasks.find((t) => t.slug === input.slug);
          if (!task) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Webhook task not found: ${input.slug}` });
          }

          const nextName = input.name ?? task.name;
          if (tasks.some((existingTask) => existingTask !== task && existingTask.name === nextName)) {
            throw new TRPCError({ code: "CONFLICT", message: `Webhook task "${nextName}" already exists` });
          }

          const updatedTask = {
            ...task,
            name: nextName,
            prompt: input.prompt ?? task.prompt,
            enabled: input.enabled ?? task.enabled,
            model: input.model ?? task.model,
            allowedTools: input.allowedTools ?? task.allowedTools,
            allowedToolsets: input.allowedToolsets ?? task.allowedToolsets,
            skills: input.skills ?? task.skills,
            retryPolicy: input.retryPolicy ?? task.retryPolicy,
            delivery: input.delivery ?? task.delivery,
          };

          const nextTasks = tasks.map((existingTask) => (
            existingTask.slug === input.slug ? updatedTask : existingTask
          ));

          await runtime.config.saveConfig({
            ...configFile,
            runtime: {
              ...configFile.runtime,
              automation: {
                ...configFile.runtime.automation,
                cronTasks: configFile.runtime.automation?.cronTasks ?? [],
                webhookTasks: nextTasks,
              },
            },
          });
          upsertWebhookTaskRecord(runtime, updatedTask);

          return { updated: true, slug: input.slug };
        }),

      /** Remove a webhook task */
      remove: adminProcedure
        .input(z.object({ slug: z.string() }))
        .mutation(async ({ input }) => {
          const configFile = runtime.config.getConfigFile();
          const tasks = configFile.runtime.automation?.webhookTasks ?? [];
          const idx = tasks.findIndex((t) => t.slug === input.slug);
          if (idx === -1) {
            return { removed: false };
          }

          tasks.splice(idx, 1);

          await runtime.config.saveConfig({
            ...configFile,
            runtime: {
              ...configFile.runtime,
              automation: {
                ...configFile.runtime.automation,
                cronTasks: configFile.runtime.automation?.cronTasks ?? [],
                webhookTasks: tasks,
              },
            },
          });
          deleteWebhookTaskRecord(runtime, input.slug);

          return { removed: true };
        }),
    }),

    /** Durable automation runtime state */
    automation: router({
      list: adminProcedure
        .input(z.object({
          type: z.enum(["heartbeat", "cron", "webhook"]).optional(),
        }).optional())
        .query(({ input }) => {
          return runtime.store.listAutomationTasks(input?.type);
        }),

      runs: adminProcedure
        .input(z.object({
          taskId: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        }).optional())
        .query(({ input }) => {
          return runtime.store.listAutomationRuns(input?.taskId, input?.limit ?? 20);
        }),
    }),

    /** Audit inspection */
    audit: router({
      list: adminProcedure
        .input(z.object({
          tail: z.number().int().min(1).max(500).optional(),
          tool: z.string().optional(),
          event: z.string().optional(),
          since: z.string().optional(),
          session: z.string().optional(),
          run: z.string().optional(),
          taskId: z.string().optional(),
        }).optional())
        .query(({ input }) => {
          return queryAuditEntries(runtime.audit.getLogPath(), input ?? {});
        }),
    }),

    /** Heartbeat management */
    heartbeat: router({
      /** Get heartbeat status */
      status: adminProcedure.query(() => {
        return {
          config: heartbeatState.config,
          lastResult: heartbeatState.lastResult,
          mainSessionId: runtime.mainSessionId,
        };
      }),

      /** Update heartbeat configuration (in-memory only — persisting requires config save) */
      configure: adminProcedure
        .input(z.object({
          enabled: z.boolean().optional(),
          intervalMinutes: z.number().min(1).max(1440).optional(),
        }))
        .mutation(({ input }) => {
          if (input.enabled !== undefined) {
            heartbeatState.config.enabled = input.enabled;
          }
          if (input.intervalMinutes !== undefined) {
            heartbeatState.config.intervalMinutes = input.intervalMinutes;
            runtime.scheduler.updateInterval("heartbeat", input.intervalMinutes);
          }
          const heartbeatTask = runtime.scheduler.list().find((task) => task.name === "heartbeat");
          upsertHeartbeatTaskRecord(runtime, {
            enabled: heartbeatState.config.enabled,
            intervalMinutes: heartbeatState.config.intervalMinutes,
            nextRunAt: heartbeatTask?.nextRunAt ?? null,
            lastRunAt: heartbeatTask?.lastRunAt ?? null,
            lastStatus: heartbeatTask?.lastStatus === "success" ? "success" : heartbeatTask?.lastStatus === "error" ? "error" : null,
            lastSummary: heartbeatTask?.lastSummary ?? null,
          });
          return { config: heartbeatState.config };
        }),

      /** Manually trigger a heartbeat check (runs only heartbeat, not all cron jobs) */
      trigger: adminProcedure.mutation(async () => {
        await runtime.scheduler.runTask("heartbeat");
        const heartbeatTask = runtime.scheduler.list().find((task) => task.name === "heartbeat");
        upsertHeartbeatTaskRecord(runtime, {
          enabled: heartbeatState.config.enabled,
          intervalMinutes: heartbeatState.config.intervalMinutes,
          nextRunAt: heartbeatTask?.nextRunAt ?? null,
          lastRunAt: heartbeatTask?.lastRunAt ?? null,
          lastStatus: heartbeatTask?.lastStatus === "success" ? "success" : heartbeatTask?.lastStatus === "error" ? "error" : null,
          lastSummary: heartbeatTask?.lastSummary ?? null,
        });
        return { triggered: true, lastResult: heartbeatState.lastResult };
      }),
    }),

    /** Engine lifecycle */
    engine: router({
      /** Shut down the engine process (no restart) */
      shutdown: adminProcedure.mutation(async (): Promise<{ shuttingDown: boolean }> => {
        await flushProcedureState(runtime, "Engine shutdown requested");
        auditLog(runtime, {
          session: "global",
          connector: "engine",
          event: "tool_call",
          tool: "shutdown",
          summary: "Engine shutdown requested",
        });

        // Schedule shutdown — no restart marker
        setTimeout(() => {
          process.kill(process.pid, "SIGTERM");
        }, 200);

        return { shuttingDown: true };
      }),

      /** Restart the engine process */
      restart: adminProcedure.mutation(async (): Promise<{ restarting: boolean }> => {
        await flushProcedureState(runtime, "Engine restart requested");
        auditLog(runtime, {
          session: "global",
          connector: "engine",
          event: "tool_call",
          tool: "restart",
          summary: "Engine restart requested",
        });

        // Write restart marker and schedule shutdown
        const restartMarker = join(runtime.config.homeDir, "engine.restart");
        writeFileSync(restartMarker, "");

        setTimeout(() => {
          process.kill(process.pid, "SIGTERM");
        }, 200);

        return { restarting: true };
      }),
    }),

    /** Main session info */
    mainSession: router({
      /** Get main session metadata */
      info: adminProcedure.query(() => {
        const session = runtime.sessions.getSession(runtime.mainSessionId);
        return {
          sessionId: runtime.mainSessionId,
          session: session ?? null,
        };
      }),
    }),
  });
}

/** Type helper for Connectors to import */
export type AppRouter = ReturnType<typeof createAppRouter>;
