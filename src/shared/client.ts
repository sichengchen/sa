import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  wsLink,
  createWSClient,
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../engine/router.js";

export interface ClientOptions {
  /** Engine HTTP URL (e.g. "http://127.0.0.1:7420") */
  httpUrl: string;
  /** Engine WebSocket URL (e.g. "ws://127.0.0.1:7421") */
  wsUrl: string;
}

/** Create a typed tRPC client for connecting to the Engine */
export function createEngineClient(options: ClientOptions) {
  const wsClient = createWSClient({ url: options.wsUrl });

  return createTRPCClient<AppRouter>({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: wsLink({ client: wsClient, transformer: superjson }),
        false: httpBatchLink({
          url: `${options.httpUrl}/trpc`,
          transformer: superjson,
        }),
      }),
    ],
  });
}
