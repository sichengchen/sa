import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { EngineContext } from "./context.js";

/** Initialize tRPC with superjson transformer and context type */
const t = initTRPC.context<EngineContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
