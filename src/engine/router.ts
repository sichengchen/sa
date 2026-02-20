import { z } from "zod";
import { router, publicProcedure } from "./trpc.js";
import { SessionManager } from "./sessions.js";
import type { EngineEvent, Session, SkillInfo } from "../shared/types.js";

/** Singleton session manager — shared across all procedures */
const sessionManager = new SessionManager();

/** Export for use in server bootstrap and tests */
export { sessionManager };

/** Main tRPC router — all Engine procedures */
export const appRouter = router({
  /** Health check */
  health: router({
    ping: publicProcedure.query(() => {
      return { status: "ok" as const, uptime: process.uptime() };
    }),
  }),

  /** Chat procedures */
  chat: router({
    /** Send a user message, returns session ID */
    send: publicProcedure
      .input(z.object({ sessionId: z.string(), message: z.string() }))
      .mutation(async ({ input }): Promise<{ sessionId: string }> => {
        sessionManager.touchSession(input.sessionId);
        // Stub — will be wired to Agent in plan #020
        return { sessionId: input.sessionId };
      }),

    /** Stream AgentEvents for a session */
    stream: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .subscription(async function* ({ input }): AsyncGenerator<EngineEvent> {
        sessionManager.touchSession(input.sessionId);
        // Stub — will yield events from Agent streaming in plan #020
        yield { type: "done", stopReason: "stub" };
      }),

    /** Get conversation history for a session */
    history: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ input }): Promise<{ sessionId: string; messages: unknown[] }> => {
        // Stub — will return conversation messages in plan #020
        return { sessionId: input.sessionId, messages: [] };
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
      .mutation(({ input }): Session => {
        return sessionManager.createSession(input.connectorId, input.connectorType);
      }),

    /** List active sessions */
    list: publicProcedure.query((): Session[] => {
      return sessionManager.listSessions();
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
      .mutation(async ({ input }): Promise<{ acknowledged: boolean }> => {
        // Stub — will be implemented in plan #020
        return { acknowledged: true };
      }),
  }),

  /** Skills */
  skill: router({
    /** List loaded skills */
    list: publicProcedure.query(async (): Promise<SkillInfo[]> => {
      // Stub — will be implemented in plan #026
      return [];
    }),

    /** Manually activate a skill */
    activate: publicProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ input }): Promise<{ activated: boolean }> => {
        // Stub — will be implemented in plan #026
        return { activated: true };
      }),
  }),

  /** Authentication */
  auth: router({
    /** Device-flow pairing */
    pair: publicProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input }): Promise<{ paired: boolean; sessionId: string | null }> => {
        // Stub — will be implemented in plan #022
        return { paired: false, sessionId: null };
      }),
  }),
});

/** Export the router type for use in Connectors (tRPC client) */
export type AppRouter = typeof appRouter;
