import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { router, publicProcedure, middleware } from "./trpc.js";
import type { EngineRuntime } from "./runtime.js";
import type { Agent, AgentEvent } from "./agent/index.js";
import type { DangerLevel } from "./agent/types.js";
import { classifyExecCommand } from "./tools/exec-classifier.js";
import { ToolPolicyManager, type ToolEventContext } from "./tools/policy.js";
import { ConnectorTypeSchema } from "@sa/shared/types.js";
import type { EngineEvent, SkillInfo, ConnectorType, ToolApprovalMode } from "@sa/shared/types.js";
import type { ModelConfig, ProviderConfig } from "./router/types.js";
import { heartbeatState, createHeartbeatTask } from "./scheduler.js";

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

/** Pending tool approval resolvers: toolCallId -> resolve(boolean) */
const pendingApprovals = new Map<string, (approved: boolean) => void>();

/** Session-level tool overrides: sessionId -> Set of auto-approved tool names */
const sessionToolOverrides = new Map<string, Set<string>>();

/** Pending approval metadata: toolCallId -> { sessionId, toolName } */
const pendingApprovalMeta = new Map<string, { sessionId: string; toolName: string }>();

/** Register a cron task with the scheduler that dispatches to an isolated agent session */
function registerCronTask(
  runtime: EngineRuntime,
  name: string,
  schedule: string,
  prompt: string,
  opts?: { oneShot?: boolean; model?: string },
): void {
  runtime.scheduler.register({
    name,
    schedule,
    prompt,
    oneShot: opts?.oneShot,
    async handler() {
      const session = runtime.sessions.create(`cron:${name}`, "cron");
      const agent = runtime.createAgent(undefined, opts?.model);
      sessionAgents.set(session.id, agent);

      let responseText = "";
      const toolCalls: { name: string; content: string }[] = [];

      try {
        for await (const event of agent.chat(prompt)) {
          if (event.type === "text_delta") responseText += event.delta;
          if (event.type === "tool_end") {
            toolCalls.push({ name: event.name, content: event.result.content });
          }
        }
      } catch (err) {
        responseText = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }

      // Log result to automation directory
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
          ...toolCalls.map((t) => `- ${t.name}: ${t.content.slice(0, 200)}`),
        ].filter(Boolean).join("\n");
        await writeFile(join(autoDir, `${name}-${ts}.md`), logContent + "\n");
      } catch {
        // Log failure is non-fatal
      }

      console.log(`[cron] Task "${name}" completed: ${responseText.slice(0, 100)}`);
    },
    onComplete: opts?.oneShot ? async (taskName) => {
      await removeCronTaskFromConfig(runtime, taskName);
    } : undefined,
  });
}

/** Persist a cron task to config.json */
async function persistCronTask(
  runtime: EngineRuntime,
  task: { name: string; schedule: string; prompt: string; enabled: boolean; oneShot?: boolean; model?: string },
): Promise<void> {
  const configFile = runtime.config.getConfigFile();
  const automation = configFile.runtime.automation ?? { cronTasks: [] };
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
  const automation = configFile.runtime.automation ?? { cronTasks: [] };
  automation.cronTasks = automation.cronTasks.filter((t) => t.name !== name);
  await runtime.config.saveConfig({
    ...configFile,
    runtime: { ...configFile.runtime, automation },
  });
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

  /** Get or create an Agent for a session */
  function getSessionAgent(sessionId: string): Agent {
    let agent = sessionAgents.get(sessionId);
    if (!agent) {
      agent = runtime.createAgent(async (toolName, toolCallId, args) => {
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
  ): AsyncGenerator<EngineEvent> {
    const isIM = connectorType !== "tui";

    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
        case "thinking_delta":
        case "done":
        case "error":
          yield event;
          break;
        case "tool_start": {
          const ctx: ToolEventContext = {
            toolName: event.name,
            dangerLevel: getEffectiveDangerLevel(event.name, event.args),
          };
          if (!policyManager.shouldEmitToolStart(connectorType, ctx)) break;
          if (isIM) {
            const argsStr = formatArgsForIM(event.name, event.args);
            yield { type: "tool_end", name: event.name, id: event.id, content: argsStr, isError: false };
          } else {
            yield { type: "tool_start", name: event.name, id: event.id };
          }
          break;
        }
        case "tool_end":
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

          // Augment message with relevant memory context
          let chatMessage = input.message;
          try {
            const memContext = await runtime.memory.getMemoryContext(input.message);
            if (memContext) {
              chatMessage = `<memory_context>\n${memContext}\n</memory_context>\n\n${input.message}`;
            }
          } catch {
            // Memory context fetch failed — continue without it
          }

          try {
            yield* filterAgentEvents(agent.chat(chatMessage), connectorType, getApprovalMode(input.sessionId));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            yield { type: "error", message };
          }
        }),

      /** Get conversation history for a session */
      history: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ input }): { sessionId: string; messages: unknown[] } => {
          const agent = sessionAgents.get(input.sessionId);
          const messages = agent ? Array.from(agent.getMessages()) : [];
          return { sessionId: input.sessionId, messages };
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
          try {
            yield* filterAgentEvents(agent.chat(transcript), connectorType, getApprovalMode(input.sessionId));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            yield { type: "error", message };
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

      /** Destroy a session and its Agent */
      destroy: protectedProcedure
        .input(z.object({ sessionId: z.string() }))
        .mutation(({ input }): { destroyed: boolean } => {
          sessionAgents.delete(input.sessionId);
          sessionToolOverrides.delete(input.sessionId);
          return { destroyed: runtime.sessions.destroySession(input.sessionId) };
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
          if (!resolver) {
            return { acknowledged: false };
          }
          pendingApprovals.delete(input.toolCallId);
          pendingApprovalMeta.delete(input.toolCallId);
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
        }))
        .mutation(async ({ input }) => {
          // Register with the scheduler — handler dispatches to an isolated agent
          registerCronTask(runtime, input.name, input.schedule, input.prompt, {
            oneShot: input.oneShot,
            model: input.model,
          });

          // Persist to config
          await persistCronTask(runtime, {
            name: input.name,
            schedule: input.schedule,
            prompt: input.prompt,
            enabled: true,
            oneShot: input.oneShot,
            model: input.model,
          });

          return { added: true, name: input.name };
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
        }))
        .mutation(async ({ input }) => {
          const configFile = runtime.config.getConfigFile();
          const tasks = configFile.runtime.automation?.webhookTasks ?? [];

          // Check for duplicate slug
          if (tasks.some((t) => t.slug === input.slug)) {
            throw new TRPCError({ code: "CONFLICT", message: `Webhook task with slug "${input.slug}" already exists` });
          }

          tasks.push({
            name: input.name,
            slug: input.slug,
            prompt: input.prompt,
            enabled: input.enabled,
            model: input.model,
            connector: input.connector,
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
            runtime.scheduler.updateSchedule("heartbeat", `*/${input.intervalMinutes} * * * *`);
          }
          return { config: heartbeatState.config };
        }),

      /** Manually trigger a heartbeat check (runs only heartbeat, not all cron jobs) */
      trigger: protectedProcedure.mutation(async () => {
        await runtime.scheduler.runTask("heartbeat");
        return { triggered: true, lastResult: heartbeatState.lastResult };
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
