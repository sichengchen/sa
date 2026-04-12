import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  wsLink,
  createWSClient,
} from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@aria/engine/procedures.js";

export interface ClientOptions {
  /** Engine HTTP URL (e.g. "http://127.0.0.1:7420") */
  httpUrl: string;
  /** Engine WebSocket URL (e.g. "ws://127.0.0.1:7421") */
  wsUrl: string;
  /** Bearer token for authentication */
  token?: string;
}

/** Create a typed tRPC client for connecting to the Engine */
export function createEngineClient(options: ClientOptions) {
  const headers = options.token
    ? { authorization: `Bearer ${options.token}` }
    : {};

  // Pass token in WS URL query string for WebSocket connection-level auth
  const wsUrlWithAuth = options.token
    ? `${options.wsUrl}?token=${encodeURIComponent(options.token)}`
    : options.wsUrl;
  const wsClient = createWSClient({ url: wsUrlWithAuth });

  return createTRPCClient<AppRouter>({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: wsLink({ client: wsClient, transformer: superjson }),
        false: httpBatchLink({
          url: `${options.httpUrl}/trpc`,
          transformer: superjson,
          headers: () => headers,
        }),
      }),
    ],
  });
}
