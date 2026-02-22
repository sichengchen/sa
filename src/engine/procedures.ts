import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import type { EngineRuntime } from "./runtime.js";
import type { Agent, AgentEvent } from "./agent/index.js";
import type { DangerLevel } from "./agent/types.js";
import { classifyExecCommand } from "./tools/exec-classifier.js";
import { ToolPolicyManager, type ToolEventContext } from "./tools/policy.js";
import type { EngineEvent, SkillInfo, ConnectorType, ToolApprovalMode } from "@sa/shared/types.js";
import type { ModelConfig, ProviderConfig } from "./router/types.js";

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

        // For exec: use hybrid classification (agent-declared + pattern override)
        let level = getDangerLevel(toolName);
        if (toolName === "exec" && typeof args.command === "string") {
          const agentDeclared = (args.danger as DangerLevel | undefined) ?? "dangerous";
          level = classifyExecCommand(args.command, agentDeclared);
        }

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
            dangerLevel: getDangerLevel(event.name),
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
            dangerLevel: getDangerLevel(event.name),
          };
          if (!policyManager.shouldEmitApproval(connectorType, ctx)) break;
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
      send: publicProcedure
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
      stream: publicProcedure
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

          try {
            yield* filterAgentEvents(agent.chat(input.message), connectorType);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            yield { type: "error", message };
          }
        }),

      /** Get conversation history for a session */
      history: publicProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ input }): { sessionId: string; messages: unknown[] } => {
          const agent = sessionAgents.get(input.sessionId);
          const messages = agent ? Array.from(agent.getMessages()) : [];
          return { sessionId: input.sessionId, messages };
        }),

      /** Transcribe audio and send as a chat message */
      transcribeAndSend: publicProcedure
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
            yield* filterAgentEvents(agent.chat(transcript), connectorType);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            yield { type: "error", message };
          }
        }),
    }),

    /** Session management */
    session: router({
      /** Create a new session for a Connector */
      create: publicProcedure
        .input(
          z.object({
            connectorType: z.enum(["tui", "telegram", "discord", "webhook"]),
            connectorId: z.string(),
          }),
        )
        .mutation(({ input }) => {
          return runtime.sessions.createSession(input.connectorId, input.connectorType);
        }),

      /** List active sessions */
      list: publicProcedure.query(() => {
        return runtime.sessions.listSessions();
      }),

      /** Destroy a session and its Agent */
      destroy: publicProcedure
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
      config: publicProcedure
        .input(z.object({ sessionId: z.string() }))
        .query(({ input }): { mode: ToolApprovalMode } => {
          return { mode: getApprovalMode(input.sessionId) };
        }),

      /** Approve or reject a pending tool execution */
      approve: publicProcedure
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
      acceptForSession: publicProcedure
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
      list: publicProcedure.query((): ModelConfig[] => {
        return runtime.router.listModelConfigs();
      }),

      /** Get the active model name */
      active: publicProcedure.query((): { name: string } => {
        return { name: runtime.router.getActiveModelName() };
      }),

      /** Switch the active model (supports aliases) */
      switch: publicProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ name: string }> => {
          const resolved = runtime.router.resolveAlias(input.name);
          await runtime.router.switchModel(resolved);
          return { name: resolved };
        }),

      /** Add a model configuration */
      add: publicProcedure
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
      remove: publicProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ removed: boolean }> => {
          await runtime.router.removeModel(input.name);
          return { removed: true };
        }),

      /** Get the current tier-to-model mapping */
      tiers: publicProcedure.query(() => {
        return runtime.router.getTierConfig();
      }),

      /** Set a tier's model */
      setTier: publicProcedure
        .input(z.object({
          tier: z.enum(["performance", "normal", "eco"]),
          modelName: z.string(),
        }))
        .mutation(async ({ input }) => {
          await runtime.router.setTierModel(input.tier, input.modelName);
          return { tier: input.tier, modelName: input.modelName };
        }),

      /** Get full routing state (tiers, aliases, active/default model) */
      routing: publicProcedure.query(() => {
        return runtime.router.getRoutingState();
      }),
    }),

    /** Provider management */
    provider: router({
      /** List all configured providers */
      list: publicProcedure.query((): ProviderConfig[] => {
        return runtime.router.listProviders();
      }),

      /** Add a provider configuration */
      add: publicProcedure
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
      remove: publicProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }): Promise<{ removed: boolean }> => {
          await runtime.router.removeProvider(input.id);
          return { removed: true };
        }),
    }),

    /** Skills */
    skill: router({
      /** List loaded skills */
      list: publicProcedure.query((): SkillInfo[] => {
        return runtime.skills.getMetadataList().map((s) => ({
          name: s.name,
          description: s.description,
          active: runtime.skills.isActive(s.name),
        }));
      }),

      /** Manually activate a skill */
      activate: publicProcedure
        .input(z.object({ name: z.string() }))
        .mutation(async ({ input }): Promise<{ activated: boolean }> => {
          return { activated: await runtime.skills.activate(input.name) };
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
            connectorType: z.enum(["tui", "telegram", "discord", "webhook"]),
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
      list: publicProcedure.query(() => {
        return runtime.scheduler.list();
      }),

      /** Add a user-defined scheduled task */
      add: publicProcedure
        .input(z.object({ name: z.string(), schedule: z.string(), prompt: z.string() }))
        .mutation(({ input }) => {
          runtime.scheduler.register({
            name: input.name,
            schedule: input.schedule,
            prompt: input.prompt,
            handler: async () => {
              // User-defined cron tasks send a prompt to the agent
              // The prompt will be dispatched when the scheduler ticks
              console.log(`[cron] Running user task "${input.name}": ${input.prompt}`);
            },
          });
          return { added: true, name: input.name };
        }),

      /** Remove a user-defined scheduled task */
      remove: publicProcedure
        .input(z.object({ name: z.string() }))
        .mutation(({ input }) => {
          return { removed: runtime.scheduler.unregister(input.name) };
        }),
    }),
  });
}

/** Type helper for Connectors to import */
export type AppRouter = ReturnType<typeof createAppRouter>;
