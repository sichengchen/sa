import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { writeFile, mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { router, publicProcedure, middleware } from "./trpc.js";
import type { EngineRuntime } from "./runtime.js";
import { Agent } from "./agent/index.js";
import type { AgentEvent } from "./agent/index.js";
import type { DangerLevel } from "./agent/types.js";
import { classifyExecCommand } from "./tools/exec-classifier.js";
import { ToolPolicyManager, type ToolEventContext } from "./tools/policy.js";
import { ConnectorTypeSchema } from "@sa/shared/types.js";
import type { EngineEvent, SkillInfo, ConnectorType, ToolApprovalMode, EscalationChoice } from "@sa/shared/types.js";
import { type SessionSecurityOverrides, createEmptyOverrides } from "./agent/security-types.js";
import type { ModelConfig, ProviderConfig } from "./router/types.js";
import { heartbeatState, createHeartbeatTask } from "./scheduler.js";
import { describeModeEffects } from "./security-mode.js";
import { CRON_DEFAULT_TOOLS, WEBHOOK_DEFAULT_TOOLS } from "./config/defaults.js";
import { createSessionToolEnvironment, type SessionToolEnvironment } from "./session-tool-environment.js";
import { preprocessContextReferences } from "./context-references.js";
import type { CronTask, DeliveryTarget, WebhookTask } from "./config/types.js";
import { computeNextRunAt, parseScheduleInput } from "./automation-schedule.js";
import { listToolsets, mergeAllowedTools } from "./toolsets.js";

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
const sessionToolEnvironments = new Map<string, SessionToolEnvironment>();

/** Pending tool approval resolvers: toolCallId -> resolve(boolean) */
const pendingApprovals = new Map<string, (approved: boolean) => void>();

/** Session-level tool overrides: sessionId -> Set of auto-approved tool names */
const sessionToolOverrides = new Map<string, Set<string>>();

/** Session-level security overrides: sessionId -> allowed resources */
const sessionSecurityOverrides = new Map<string, SessionSecurityOverrides>();

/** Pending approval metadata: toolCallId -> { sessionId, toolName } */
const pendingApprovalMeta = new Map<string, { sessionId: string; toolName: string }>();

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

async function buildAttachedSkillsPrompt(runtime: EngineRuntime, skillNames?: string[]): Promise<string> {
  if (!skillNames || skillNames.length === 0) {
    return "";
  }

  const sections: string[] = [];
  for (const skillName of skillNames) {
    const content = await runtime.skills.getContent(skillName);
    if (!content) continue;
    sections.push(`## Skill: ${skillName}\n${content}`);
  }

  return sections.length > 0 ? `## Attached Skills\n${sections.join("\n\n")}` : "";
}

function buildDelegationOptions(runtime: EngineRuntime) {
  const orchestration = runtime.config.getConfigFile().runtime.orchestration;
  return {
    router: runtime.router,
    defaultTimeoutMs: orchestration?.defaultTimeoutMs,
    memoryWriteDefault: orchestration?.memoryWriteDefault,
    maxConcurrent: orchestration?.maxConcurrent,
    maxSubAgentsPerTurn: orchestration?.maxSubAgentsPerTurn,
    resultRetentionMs: orchestration?.resultRetentionMs,
  };
}

async function deliverAutomationResult(runtime: EngineRuntime, delivery: DeliveryTarget | undefined, responseText: string): Promise<void> {
  const connector = delivery?.connector;
  if (!connector || !responseText.trim()) {
    return;
  }

  const notifyTool = runtime.tools.find((tool) => tool.name === "notify");
  if (!notifyTool) return;

  try {
    await notifyTool.execute({ message: responseText, connector });
  } catch {
    // Delivery failure is non-fatal.
  }
}

async function logAutomationResult(runtime: EngineRuntime, name: string, prompt: string, responseText: string, toolCalls: Array<{ name: string; content: string }>): Promise<void> {
  try {
    const autoDir = join(runtime.config.homeDir, "automation");
    await mkdir(autoDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const logContent = [
      `# ${name} — ${new Date().toISOString()}`,
      "## Prompt",
      prompt,
      "## Response",
      responseText || "(no response)",
      toolCalls.length > 0 ? "## Tool calls" : "",
      ...toolCalls.map((toolCall) => `- ${toolCall.name}: ${toolCall.content.slice(0, 200)}`),
    ].filter(Boolean).join("\n");
    await writeFile(join(autoDir, `${name}-${ts}.md`), logContent + "\n");
  } catch {
    // Log failure is non-fatal.
  }
}

async function runAutomationAgent(
  runtime: EngineRuntime,
  task: {
    sessionPrefix: string;
    name: string;
    prompt: string;
    model?: string;
    allowedTools?: string[];
    allowedToolsets?: string[];
    skills?: string[];
  },
): Promise<{ responseText: string; toolCalls: Array<{ name: string; content: string }>; status: "success" | "error"; summary: string }> {
  const session = runtime.sessions.create(task.sessionPrefix, "cron");
  const allowedTools = mergeAllowedTools(
    runtime.tools,
    task.allowedTools ?? CRON_DEFAULT_TOOLS,
    task.allowedToolsets,
  ) ?? CRON_DEFAULT_TOOLS;
  const toolEnvironment = createSessionToolEnvironment({
    baseTools: runtime.tools.filter((tool) => allowedTools.includes(tool.name)),
    checkpointManager: runtime.checkpoints,
    maxContextHintChars: runtime.config.getConfigFile().runtime.contextFiles?.maxHintChars,
    delegation: buildDelegationOptions(runtime),
  });
  toolEnvironment.newTurn();

  const attachedSkills = await buildAttachedSkillsPrompt(runtime, task.skills);
  const systemPrompt = attachedSkills
    ? `${runtime.systemPrompt}\n\n${attachedSkills}`
    : runtime.systemPrompt;
  const agent = new Agent({
    router: runtime.router,
    tools: toolEnvironment.tools,
    systemPrompt,
    modelOverride: task.model,
  });

  sessionAgents.set(session.id, agent);
  sessionToolEnvironments.set(session.id, toolEnvironment);

  let responseText = "";
  const toolCalls: Array<{ name: string; content: string }> = [];
  let status: "success" | "error" = "success";

  try {
    for await (const event of agent.chat(task.prompt)) {
      if (event.type === "text_delta") {
        responseText += event.delta;
      }
      if (event.type === "tool_end") {
        toolCalls.push({ name: event.name, content: event.result.content });
      }
    }
  } catch (error) {
    status = "error";
    responseText = `Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    await runtime.archive.syncSession(session, agent.getMessages());
    sessionAgents.delete(session.id);
    sessionToolEnvironments.delete(session.id);
    runtime.sessions.destroySession(session.id);
  }

  return {
    responseText,
    toolCalls,
    status,
    summary: responseText.slice(0, 200) || "(no response)",
  };
}

function registerCronTask(
  runtime: EngineRuntime,
  task: CronTask,
): void {
  runtime.scheduler.register({
    name: task.name,
    schedule: task.schedule,
    scheduleKind: task.scheduleKind,
    intervalMinutes: task.intervalMinutes,
    runAt: task.runAt,
    paused: task.paused,
    prompt: task.prompt,
    oneShot: task.oneShot,
    async handler() {
      const result = await runAutomationAgent(runtime, {
        sessionPrefix: `cron:${task.name}`,
        name: task.name,
        prompt: task.prompt,
        model: task.model,
        allowedTools: task.allowedTools,
        allowedToolsets: task.allowedToolsets,
        skills: task.skills,
      });

      await logAutomationResult(runtime, task.name, task.prompt, result.responseText, result.toolCalls);
      await deliverAutomationResult(runtime, task.delivery, result.responseText);
      void updateCronTaskState(runtime, task.name, {
        lastRunAt: new Date().toISOString(),
        nextRunAt: computeNextRunAt({
          schedule: task.schedule,
          scheduleKind: task.scheduleKind,
          intervalMinutes: task.intervalMinutes,
          runAt: task.runAt,
          lastRunAt: new Date().toISOString(),
          oneShot: task.oneShot,
        }),
        lastStatus: result.status,
        lastSummary: result.summary,
      });

      console.log(`[cron] Task "${task.name}" completed: ${result.summary}`);
      return { status: result.status, summary: result.summary };
    },
    onComplete: task.oneShot ? async (taskName) => {
      await removeCronTaskFromConfig(runtime, taskName);
    } : undefined,
  });
}

/** Persist a cron task to config.json */
async function persistCronTask(
  runtime: EngineRuntime,
  task: CronTask,
): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
  // Remove existing task with same name
  automation.cronTasks = automation.cronTasks.filter((t) => t.name !== task.name);
  automation.cronTasks.push(task);
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
}

/** Remove a cron task from config.json */
async function removeCronTaskFromConfig(runtime: EngineRuntime, name: string): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
  automation.cronTasks = automation.cronTasks.filter((t) => t.name !== name);
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
}

async function updateCronTaskState(runtime: EngineRuntime, name: string, patch: Partial<CronTask>): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [], webhookTasks: [] };
  automation.cronTasks = automation.cronTasks.map((task) => (
    task.name === name ? { ...task, ...patch } : task
  ));
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
}

/** Shorthand for audit logging */
function auditLog(runtime: EngineRuntime, input: import("./audit.js").AuditInput): void {
  try { runtime.audit.log(input); } catch { /* audit failure is non-fatal */ }
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

  function getDangerLevel(toolName: string): DangerLevel {
    return policyManager.getDangerLevel(toolName);
  }

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
    return next({ ctx: { ...ctx, connectorId: entry.connectorId } });
  });

  const protectedProcedure = publicProcedure.use(authMiddleware);

  /** Resolve the tool approval mode for a session */
  function getApprovalMode(sessionId: string): ToolApprovalMode {
    const session = runtime.sessions.getSession(sessionId);
    if (!session) return "ask";
    const connectorType = session.connectorType as ConnectorType;
    const configFile = runtime.config.getConfigFile();
    return configFile.runtime.toolApproval?.[connectorType] ?? (connectorType === "tui" ? "never" : "ask");
  }

  async function persistSessionArchive(sessionId: string): Promise<void> {
    const session = runtime.sessions.getSession(sessionId);
    const agent = sessionAgents.get(sessionId);
    if (!session || !agent) return;
    await runtime.archive.syncSession(session, agent.getMessages());
  }

  function resolveWorkingDir(sessionId?: string, workingDir?: string): string {
    if (workingDir && workingDir.trim()) {
      return workingDir;
    }
    const sessionDir = sessionId ? sessionToolEnvironments.get(sessionId)?.workingDir : undefined;
    return sessionDir ?? process.env.TERMINAL_CWD ?? process.cwd();
  }

  /** Get or create an Agent for a session */
  function getSessionAgent(sessionId: string): Agent {
    let agent = sessionAgents.get(sessionId);
    if (!agent) {
      const toolEnvironment = createSessionToolEnvironment({
        baseTools: runtime.tools,
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
        systemPrompt: runtime.systemPrompt,
        onAskUser,
        onToolApproval: async (toolName, toolCallId, args) => {
        const mode = getApprovalMode(sessionId);
        const level = getEffectiveDangerLevel(toolName, args);

        // Safe tools: always auto-approve
        if (level === "safe") return true;

        // Dangerous tools: always ask (even TUI "never" mode)
        if (level === "dangerous") {
          // Check session-level overrides first
          const overrides = sessionToolOverrides.get(sessionId);
          if (overrides?.has(toolName)) return true;

          return new Promise<boolean>((resolve) => {
            pendingApprovals.set(toolCallId, resolve);
            pendingApprovalMeta.set(toolCallId, { sessionId, toolName });
            setTimeout(() => {
              if (pendingApprovals.has(toolCallId)) {
                pendingApprovals.delete(toolCallId);
                pendingApprovalMeta.delete(toolCallId);
                resolve(false);
              }
            }, 5 * 60 * 1000);
          });
        }

        // Moderate tools: auto-approve unless mode is "always"
        if (mode === "always") {
          const overrides = sessionToolOverrides.get(sessionId);
          if (overrides?.has(toolName)) return true;

          return new Promise<boolean>((resolve) => {
            pendingApprovals.set(toolCallId, resolve);
            pendingApprovalMeta.set(toolCallId, { sessionId, toolName });
            setTimeout(() => {
              if (pendingApprovals.has(toolCallId)) {
                pendingApprovals.delete(toolCallId);
                pendingApprovalMeta.delete(toolCallId);
                resolve(false);
              }
            }, 5 * 60 * 1000);
          });
        }

        return true;
        },
      });
      sessionAgents.set(sessionId, agent);
    }
    return agent;
  }

  /** Shared generator that filters agent events through the policy manager */
  async function* filterAgentEvents(
    events: AsyncIterable<AgentEvent>,
    connectorType: ConnectorType,
    approvalMode: ToolApprovalMode,
    sessionId?: string,
  ): AsyncGenerator<EngineEvent> {
    const isIM = connectorType !== "tui";
    const sid = sessionId ?? "unknown";

    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
        case "thinking_delta":
        case "done":
        case "error":
          yield event;
          break;
        case "user_question":
          yield event;
          break;
        case "tool_start": {
          const dangerLevel = getEffectiveDangerLevel(event.name, event.args);
          const ctx: ToolEventContext = { toolName: event.name, dangerLevel };

          // Audit: tool_call
          auditLog(runtime, {
            session: sid,
            connector: connectorType,
            event: "tool_call",
            tool: event.name,
            danger: dangerLevel,
            command: event.name === "exec" && typeof event.args.command === "string" ? event.args.command : undefined,
            url: event.name === "web_fetch" && typeof event.args.url === "string" ? event.args.url : undefined,
          });

          if (!policyManager.shouldEmitToolStart(connectorType, ctx)) break;
          if (isIM) {
            const argsStr = formatArgsForIM(event.name, event.args);
            yield { type: "tool_end", name: event.name, id: event.id, content: argsStr, isError: false };
          } else {
            yield { type: "tool_start", name: event.name, id: event.id };
          }
          break;
        }
        case "tool_end": {
          // Audit: tool_result
          auditLog(runtime, {
            session: sid,
            connector: connectorType,
            event: "tool_result",
            tool: event.name,
            summary: event.result.content.slice(0, 200),
          });

          // Intercept reaction tool — emit a reaction event for connectors
          if (event.name === "reaction" && event.result.content.startsWith("__reaction__:")) {
            const emoji = event.result.content.slice("__reaction__:".length);
            yield { type: "reaction", emoji };
          } else {
            const ctx: ToolEventContext = {
              toolName: event.name,
              dangerLevel: getDangerLevel(event.name),
              isError: event.result.isError,
            };
            if (policyManager.shouldEmitToolEnd(connectorType, ctx)) {
              yield {
                type: "tool_end",
                name: event.name,
                id: event.id,
                content: event.result.content,
                isError: event.result.isError ?? false,
              };
            }
          }
          break;
        }
        case "tool_approval_request": {
          const ctx: ToolEventContext = {
            toolName: event.name,
            dangerLevel: getEffectiveDangerLevel(event.name, event.args),
          };
          if (!policyManager.shouldEmitApproval(connectorType, ctx, approvalMode)) break;
          yield {
            type: "tool_approval_request",
            name: event.name,
            id: event.id,
            args: event.args,
          };
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
        .mutation(async ({ input }): Promise<{ sessionId: string }> => {
          const session = runtime.sessions.getSession(input.sessionId);
          if (!session) {
            throw new Error(`Session not found: ${input.sessionId}`);
          }
          runtime.sessions.touchSession(input.sessionId);
          return { sessionId: input.sessionId };
        }),

      /** Stream AgentEvents for a chat turn */
      stream: protectedProcedure
        .input(z.object({ sessionId: z.string(), message: z.string() }))
        .subscription(async function* ({ input }): AsyncGenerator<EngineEvent> {
          const session = runtime.sessions.getSession(input.sessionId);
          if (!session) {
            yield { type: "error", message: `Session not found: ${input.sessionId}` };
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

          try {
            yield* filterAgentEvents(agent.chat(chatMessage), connectorType, getApprovalMode(input.sessionId), input.sessionId);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            yield { type: "error", message };
          } finally {
            await persistSessionArchive(input.sessionId);
          }
        }),

      /** Stop a running agent in a specific session */
      stop: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(async ({ input }): Promise<{ cancelled: boolean }> => {
          const agent = sessionAgents.get(input.sessionId);
          if (!agent) {
            return { cancelled: false };
          }
          const cancelled = agent.abort();

          // Resolve any pending approvals for this session (auto-reject)
          for (const [toolCallId, meta] of pendingApprovalMeta.entries()) {
            if (meta.sessionId === input.sessionId) {
              const resolver = pendingApprovals.get(toolCallId);
              if (resolver) {
                resolver(false);
                pendingApprovals.delete(toolCallId);
              }
              pendingApprovalMeta.delete(toolCallId);
            }
          }

          // Resolve any pending escalations for this session
          for (const [escId, pending] of pendingEscalations.entries()) {
            if (pending.sessionId === input.sessionId) {
              pending.resolve("deny");
              pendingEscalations.delete(escId);
            }
          }

          // Reject any pending user questions for this session
          for (const [qId, pending] of pendingQuestions.entries()) {
            if (pending.sessionId === input.sessionId) {
              pending.reject(new Error("Stopped by user"));
              pendingQuestions.delete(qId);
            }
          }

          const session = runtime.sessions.getSession(input.sessionId);
          auditLog(runtime, {
            session: input.sessionId,
            connector: session?.connectorType ?? "unknown",
            event: "tool_call",
            tool: "stop",
            summary: cancelled ? "Agent stopped" : "No agent running",
          });

          await persistSessionArchive(input.sessionId);
          return { cancelled };
        }),

      /** Stop all running agents across all sessions */
      stopAll: protectedProcedure
        .mutation(async (): Promise<{ cancelled: number; total: number }> => {
          let cancelled = 0;
          const total = sessionAgents.size;

          for (const [sid, agent] of sessionAgents.entries()) {
            if (agent.abort()) {
              cancelled++;
            }

            // Resolve pending approvals for this session
            for (const [toolCallId, meta] of pendingApprovalMeta.entries()) {
              if (meta.sessionId === sid) {
                const resolver = pendingApprovals.get(toolCallId);
                if (resolver) {
                  resolver(false);
                  pendingApprovals.delete(toolCallId);
                }
                pendingApprovalMeta.delete(toolCallId);
              }
            }

            // Resolve pending escalations for this session
            for (const [escId, pending] of pendingEscalations.entries()) {
              if (pending.sessionId === sid) {
                pending.resolve("deny");
                pendingEscalations.delete(escId);
              }
            }

            // Reject pending questions for this session
            for (const [qId, pending] of pendingQuestions.entries()) {
              if (pending.sessionId === sid) {
                pending.reject(new Error("Stopped by user"));
                pendingQuestions.delete(qId);
              }
            }
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
        .query(async ({ input }): Promise<{ sessionId: string; messages: unknown[]; archived: boolean }> => {
          const agent = sessionAgents.get(input.sessionId);
          if (agent) {
            await persistSessionArchive(input.sessionId);
            return {
              sessionId: input.sessionId,
              messages: Array.from(agent.getMessages()),
              archived: false,
            };
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
        .subscription(async function* ({ input }): AsyncGenerator<EngineEvent & { transcript?: string }> {
          const session = runtime.sessions.getSession(input.sessionId);
          if (!session) {
            yield { type: "error", message: `Session not found: ${input.sessionId}` };
            return;
          }

          const audioConfig = runtime.config.getConfigFile().runtime.audio;
          if (audioConfig && !audioConfig.enabled) {
            yield { type: "error", message: "Audio transcription is disabled in config" };
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
            yield { type: "error", message: `Transcription failed: ${message}` };
            return;
          }

          if (!transcript.trim()) {
            yield { type: "error", message: "Transcription produced empty text" };
            return;
          }

          // Yield transcript as metadata before streaming the response
          yield { type: "text_delta", delta: "", transcript };

          // Process transcript as a normal chat message
          const agent = getSessionAgent(input.sessionId);
          const connectorType = session.connectorType as ConnectorType;
          sessionToolEnvironments.get(input.sessionId)?.newTurn();
          try {
            yield* filterAgentEvents(agent.chat(transcript), connectorType, getApprovalMode(input.sessionId), input.sessionId);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            yield { type: "error", message };
          } finally {
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
        .mutation(({ input }) => {
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
        .query(({ input }) => {
          return runtime.sessions.getLatest(input.prefix) ?? null;
        }),

      /** List active sessions */
      list: protectedProcedure.query(() => {
        return runtime.sessions.listSessions();
      }),

      /** List recently archived sessions */
      listArchived: protectedProcedure
        .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
        .query(async ({ input }) => {
          return runtime.archive.listRecent(input?.limit ?? 20);
        }),

      /** Search archived sessions by content and summary */
      search: protectedProcedure
        .input(z.object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(50).optional(),
        }))
        .query(async ({ input }) => {
          return runtime.archive.search(input.query, input.limit ?? 10);
        }),

      /** Destroy a session and its Agent */
      destroy: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(async ({ input }): Promise<{ destroyed: boolean }> => {
          const session = runtime.sessions.getSession(input.sessionId);
          await persistSessionArchive(input.sessionId);
          auditLog(runtime, {
            session: input.sessionId,
            connector: session?.connectorType ?? "unknown",
            event: "session_destroy",
          });
          sessionAgents.delete(input.sessionId);
          sessionToolEnvironments.delete(input.sessionId);
          sessionToolOverrides.delete(input.sessionId);
          sessionSecurityOverrides.delete(input.sessionId);
          // Reject pending questions for destroyed session
          for (const [qId, pending] of pendingQuestions.entries()) {
            if (pending.sessionId === input.sessionId) {
              pending.reject(new Error("Session destroyed"));
              pendingQuestions.delete(qId);
            }
          }
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
        .query(async ({ input }) => {
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
        .query(async ({ input }) => {
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
        .mutation(async ({ input }) => {
          const workingDir = resolveWorkingDir(input.sessionId, input.workingDir);
          const result = await runtime.checkpoints.restore(workingDir, input.commitHash, input.filePath);
          return { workingDir, ...result };
        }),
    }),

    /** Toolset metadata */
    toolset: router({
      list: protectedProcedure.query(() => {
        return listToolsets(runtime.tools);
      }),
    }),

    /** MCP metadata and non-tool surfaces */
    mcp: router({
      listServers: protectedProcedure.query(() => {
        return runtime.mcp.listServers();
      }),

      listTools: protectedProcedure
        .input(z.object({ server: z.string().optional() }).optional())
        .query(({ input }) => {
          return runtime.mcp.listTools(input?.server);
        }),

      listPrompts: protectedProcedure
        .input(z.object({ server: z.string() }))
        .query(async ({ input }) => {
          return runtime.mcp.listPrompts(input.server);
        }),

      getPrompt: protectedProcedure
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

      listResources: protectedProcedure
        .input(z.object({
          server: z.string(),
          cursor: z.string().optional(),
        }))
        .query(async ({ input }) => {
          return runtime.mcp.listResources(input.server, input.cursor);
        }),

      readResource: protectedProcedure
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

    /** Tool execution */
    tool: router({
      /** Get the tool approval mode for a session */
      config: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ input }): { mode: ToolApprovalMode } => {
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
        .mutation(({ input }): { acknowledged: boolean } => {
          const resolver = pendingApprovals.get(input.toolCallId);
          const meta = pendingApprovalMeta.get(input.toolCallId);
          if (!resolver) {
            return { acknowledged: false };
          }
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
        .mutation(({ input }): { acknowledged: boolean } => {
          const meta = pendingApprovalMeta.get(input.toolCallId);
          const resolver = pendingApprovals.get(input.toolCallId);
          if (!resolver || !meta) {
            return { acknowledged: false };
          }

          // Add tool to session overrides
          let overrides = sessionToolOverrides.get(meta.sessionId);
          if (!overrides) {
            overrides = new Set();
            sessionToolOverrides.set(meta.sessionId, overrides);
          }
          overrides.add(meta.toolName);

          // Approve the current call
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
        .mutation(async ({ input }): Promise<{ acknowledged: boolean }> => {
          const pending = pendingEscalations.get(input.id);
          if (!pending) {
            return { acknowledged: false };
          }
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
        .mutation(({ input }): { acknowledged: boolean } => {
          const pending = pendingQuestions.get(input.id);
          if (!pending) {
            return { acknowledged: false };
          }
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
        .query(({ input }) => {
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
        .mutation(({ input }) => {
          const session = runtime.sessions.getSession(input.sessionId);
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
      list: protectedProcedure.query((): ModelConfig[] => {
        return runtime.router.listModelConfigs();
      }),

      /** Get the active model name */
      active: protectedProcedure.query((): { name: string } => {
        return { name: runtime.router.getActiveModelName() };
      }),

      /** Switch the active model (supports aliases) */
      switch: protectedProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ name: string }> => {
          const resolved = runtime.router.resolveAlias(input.name);
          await runtime.router.switchModel(resolved);
          return { name: resolved };
        }),

      /** Add a model configuration */
      add: protectedProcedure
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
      remove: protectedProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ removed: boolean }> => {
          await runtime.router.removeModel(input.name);
          return { removed: true };
        }),

      /** Get the current tier-to-model mapping */
      tiers: protectedProcedure.query(() => {
        return runtime.router.getTierConfig();
      }),

      /** Set a tier's model */
      setTier: protectedProcedure
        .input(z.object({
          tier: z.enum(["performance", "normal", "eco"]),
          modelName: z.string(),
        }))
        .mutation(async ({ input }) => {
          await runtime.router.setTierModel(input.tier, input.modelName);
          return { tier: input.tier, modelName: input.modelName };
        }),

      /** Get full routing state (tiers, aliases, active/default model) */
      routing: protectedProcedure.query(() => {
        return runtime.router.getRoutingState();
      }),
    }),

    /** Provider management */
    provider: router({
      /** List all configured providers */
      list: protectedProcedure.query((): ProviderConfig[] => {
        return runtime.router.listProviders();
      }),

      /** Add a provider configuration */
      add: protectedProcedure
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
      remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }): Promise<{ removed: boolean }> => {
          await runtime.router.removeProvider(input.id);
          return { removed: true };
        }),
    }),

    /** Skills */
    skill: router({
      /** List loaded skills */
      list: protectedProcedure.query((): SkillInfo[] => {
        return runtime.skills.getMetadataList().map((s) => ({
          name: s.name,
          description: s.description,
          active: runtime.skills.isActive(s.name),
        }));
      }),

      /** Manually activate a skill */
      activate: protectedProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ activated: boolean }> => {
          return { activated: await runtime.skills.activate(input.name) };
        }),

      /** Reload all skills from disk (used after skill install/update) */
      reload: protectedProcedure
        .mutation(async (): Promise<{ reloaded: boolean; count: number }> => {
          await runtime.skills.loadAll();
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
      list: protectedProcedure.query(() => {
        return runtime.scheduler.list();
      }),

      /** Add a user-defined scheduled task with real agent dispatch */
      add: protectedProcedure
        .input(z.object({
          name: z.string(),
          schedule: z.string(),
          prompt: z.string(),
          oneShot: z.boolean().optional(),
          model: z.string().optional(),
          allowedTools: z.array(z.string()).optional(),
          allowedToolsets: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          delivery: z.object({
            connector: z.string().optional(),
            sessionId: z.string().optional(),
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
      update: protectedProcedure
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
          delivery: z.object({
            connector: z.string().optional(),
            sessionId: z.string().optional(),
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
            delivery: input.delivery ?? existing.delivery,
          };
          updated.nextRunAt = computeNextRunAt(updated);

          runtime.scheduler.unregister(updated.name);
          registerCronTask(runtime, updated);
          await persistCronTask(runtime, updated);
          return { updated: true, name: updated.name };
        }),

      /** Pause a task without deleting it */
      pause: protectedProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }) => {
          const updated = runtime.scheduler.setPaused(input.name, true);
          if (updated) {
            await updateCronTaskState(runtime, input.name, { paused: true, nextRunAt: null });
          }
          return { updated };
        }),

      /** Resume a paused task */
      resume: protectedProcedure
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
      run: protectedProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }) => {
          const triggered = await runtime.scheduler.runTask(input.name);
          return { triggered };
        }),

      /** Remove a user-defined scheduled task */
      remove: protectedProcedure
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
      list: protectedProcedure.query(() => {
        const configFile = runtime.config.getConfigFile();
        return configFile.runtime.automation?.webhookTasks ?? [];
      }),

      /** Add a new webhook task */
      add: protectedProcedure
        .input(z.object({
          name: z.string(),
          slug: z.string().regex(/^[a-zA-Z0-9_-]+$/),
          prompt: z.string(),
          enabled: z.boolean().default(true),
          model: z.string().optional(),
          connector: z.string().optional(),
          allowedTools: z.array(z.string()).optional(),
          allowedToolsets: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          delivery: z.object({
            connector: z.string().optional(),
            sessionId: z.string().optional(),
          }).optional(),
        }))
        .mutation(async ({ input }) => {
          const configFile = runtime.config.getConfigFile();
          const tasks = configFile.runtime.automation?.webhookTasks ?? [];

          // Check for duplicate slug
          if (tasks.some((t) => t.slug === input.slug)) {
            throw new TRPCError({ code: "CONFLICT", message: `Webhook task with slug "${input.slug}" already exists` });
          }

          tasks.push({
            id: crypto.randomUUID(),
            name: input.name,
            slug: input.slug,
            prompt: input.prompt,
            enabled: input.enabled,
            model: input.model,
            connector: input.connector,
            allowedTools: input.allowedTools,
            allowedToolsets: input.allowedToolsets,
            skills: input.skills,
            delivery: input.delivery,
          });

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

          return { added: true, slug: input.slug };
        }),

      /** Update an existing webhook task */
      update: protectedProcedure
        .input(z.object({
          slug: z.string(),
          name: z.string().optional(),
          prompt: z.string().optional(),
          enabled: z.boolean().optional(),
          model: z.string().optional(),
          connector: z.string().optional(),
          allowedTools: z.array(z.string()).optional(),
          allowedToolsets: z.array(z.string()).optional(),
          skills: z.array(z.string()).optional(),
          delivery: z.object({
            connector: z.string().optional(),
            sessionId: z.string().optional(),
          }).optional(),
        }))
        .mutation(async ({ input }) => {
          const configFile = runtime.config.getConfigFile();
          const tasks = configFile.runtime.automation?.webhookTasks ?? [];
          const task = tasks.find((t) => t.slug === input.slug);
          if (!task) {
            throw new TRPCError({ code: "NOT_FOUND", message: `Webhook task not found: ${input.slug}` });
          }

          if (input.name !== undefined) task.name = input.name;
          if (input.prompt !== undefined) task.prompt = input.prompt;
          if (input.enabled !== undefined) task.enabled = input.enabled;
          if (input.model !== undefined) task.model = input.model;
          if (input.connector !== undefined) task.connector = input.connector;
          if (input.allowedTools !== undefined) task.allowedTools = input.allowedTools;
          if (input.allowedToolsets !== undefined) task.allowedToolsets = input.allowedToolsets;
          if (input.skills !== undefined) task.skills = input.skills;
          if (input.delivery !== undefined) task.delivery = input.delivery;

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

          return { updated: true, slug: input.slug };
        }),

      /** Remove a webhook task */
      remove: protectedProcedure
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

          return { removed: true };
        }),
    }),

    /** Heartbeat management */
    heartbeat: router({
      /** Get heartbeat status */
      status: protectedProcedure.query(() => {
        return {
          config: heartbeatState.config,
          lastResult: heartbeatState.lastResult,
          mainSessionId: runtime.mainSessionId,
        };
      }),

      /** Update heartbeat configuration (in-memory only — persisting requires config save) */
      configure: protectedProcedure
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
          return { config: heartbeatState.config };
        }),

      /** Manually trigger a heartbeat check (runs only heartbeat, not all cron jobs) */
      trigger: protectedProcedure.mutation(async () => {
        await runtime.scheduler.runTask("heartbeat");
        return { triggered: true, lastResult: heartbeatState.lastResult };
      }),
    }),

    /** Engine lifecycle */
    engine: router({
      /** Shut down the engine process (no restart) */
      shutdown: protectedProcedure.mutation((): { shuttingDown: boolean } => {
        // Stop all running agents first
        for (const [sid, agent] of sessionAgents.entries()) {
          agent.abort();
          for (const [toolCallId, meta] of pendingApprovalMeta.entries()) {
            if (meta.sessionId === sid) {
              const resolver = pendingApprovals.get(toolCallId);
              if (resolver) {
                resolver(false);
                pendingApprovals.delete(toolCallId);
              }
              pendingApprovalMeta.delete(toolCallId);
            }
          }
        }

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
      restart: protectedProcedure.mutation((): { restarting: boolean } => {
        // Stop all running agents first
        for (const [sid, agent] of sessionAgents.entries()) {
          agent.abort();
          // Reject pending approvals
          for (const [toolCallId, meta] of pendingApprovalMeta.entries()) {
            if (meta.sessionId === sid) {
              const resolver = pendingApprovals.get(toolCallId);
              if (resolver) {
                resolver(false);
                pendingApprovals.delete(toolCallId);
              }
              pendingApprovalMeta.delete(toolCallId);
            }
          }
        }

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
      info: protectedProcedure.query(() => {
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
