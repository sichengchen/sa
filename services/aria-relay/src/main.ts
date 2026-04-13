import { runAriaRelayServiceHost } from "./index.js";

async function main() {
  const bootstrap = await runAriaRelayServiceHost();
  console.log(`[aria-relay] Ready with state at ${bootstrap.statePath}`);

  const keepAlive = setInterval(() => {}, 1_000_000);
  const shutdown = (signal: string) => {
    clearInterval(keepAlive);
    console.log(`[aria-relay] Stopping on ${signal}`);
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(
    `[aria-relay] Failed to start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
