import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import type { EngineRuntime } from "./runtime.js";
import type { Agent } from "../agent/index.js";
import type { EngineEvent, SkillInfo } from "../shared/types.js";

/** Per-session agent instances */
const sessionAgents = new Map<string, Agent>();

/** Pending tool approval resolvers: toolCallId -> resolve(boolean) */
const pendingApprovals = new Map<string, (approved: boolean) => void>();

/** Create the tRPC router bound to a runtime instance */
export function createAppRouter(runtime: EngineRuntime) {
  /** Get or create an Agent for a session */
  function getSessionAgent(sessionId: string): Agent {
    let agent = sessionAgents.get(sessionId);
    if (!agent) {
      agent = runtime.createAgent(async (_toolName, toolCallId, _args) => {
        return new Promise<boolean>((resolve) => {
          pendingApprovals.set(toolCallId, resolve);
          // Auto-reject after 5 minutes if no response
          setTimeout(() => {
            if (pendingApprovals.has(toolCallId)) {
              pendingApprovals.delete(toolCallId);
              resolve(false);
            }
          }, 5 * 60 * 1000);
        });
      });
      sessionAgents.set(sessionId, agent);
    }
    return agent;
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

          try {
            for await (const event of agent.chat(input.message)) {
              switch (event.type) {
                case "text_delta":
                case "thinking_delta":
                case "done":
                case "error":
                  yield event;
                  break;
                case "tool_start":
                  yield { type: "tool_start", name: event.name, id: event.id };
                  break;
                case "tool_end":
                  yield {
                    type: "tool_end",
                    name: event.name,
                    id: event.id,
                    content: event.result.content,
                    isError: event.result.isError ?? false,
                  };
                  break;
                case "tool_approval_request":
                  yield {
                    type: "tool_approval_request",
                    name: event.name,
                    id: event.id,
                    args: event.args,
                  };
                  break;
              }
            }
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
    }),

    /** Session management */
    session: router({
      /** Create a new session for a Connector */
      create: publicProcedure
        .input(
          z.object({
            connectorType: z.enum(["tui", "telegram", "discord"]),
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
          return { destroyed: runtime.sessions.destroySession(input.sessionId) };
        }),
    }),

    /** Tool execution */
    tool: router({
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
          resolver(input.approved);
          return { acknowledged: true };
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

      /** Search ClawHub for skills */
      search: publicProcedure
        .input(z.object({ query: z.string(), limit: z.number().optional() }))
        .query(async ({ input }) => {
          return runtime.clawhub.search(input.query, { limit: input.limit });
        }),

      /** Install a skill from ClawHub */
      install: publicProcedure
        .input(z.object({ slug: z.string(), version: z.string().optional() }))
        .mutation(async ({ input }) => {
          const result = await runtime.installer.install(input.slug, input.version);
          // Reload skills after installation
          const saHome = runtime.config.homeDir;
          await runtime.skills.loadAll(saHome);
          return result;
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
            connectorType: z.enum(["tui", "telegram", "discord"]),
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
  });
}

/** Type helper for Connectors to import */
export type AppRouter = ReturnType<typeof createAppRouter>;
