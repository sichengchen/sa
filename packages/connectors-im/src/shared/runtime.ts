export interface ConnectorRuntimeHandle {
  name: string;
  stop(): Promise<void>;
}

export function installConnectorSignalHandlers(
  label: string,
  stop: () => Promise<void>,
): () => void {
  const shutdown = async () => {
    console.log(`\nShutting down ${label} connector...`);
    await stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
  };
}
