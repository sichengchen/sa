import {
  hasDiscordCredentials,
  hasGChatCredentials,
  hasGitHubCredentials,
  hasLinearCredentials,
  hasSlackCredentials,
  hasSlackSocketModeCredentials,
  hasTeamsCredentials,
  hasTelegramCredentials,
  loadWeChatAccounts,
  startDiscordConnector,
  startGChatConnector,
  startGitHubConnector,
  startLinearConnector,
  startSlackConnector,
  startTeamsConnector,
  startTelegramConnector,
  startWeChatConnector,
} from "@aria/connectors-im";
import { getRuntimeHome } from "./brand.js";

export interface ServerConnectorHandle {
  name: string;
  stop(): Promise<void>;
}

export interface ServerConnectorRuntime {
  handles: ServerConnectorHandle[];
  stop(): Promise<void>;
}

export interface StartConfiguredConnectorsOptions {
  homeDir?: string;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

export async function startConfiguredConnectors(
  options: StartConfiguredConnectorsOptions = {},
): Promise<ServerConnectorRuntime> {
  const homeDir = options.homeDir ?? getRuntimeHome();
  const log = options.log ?? ((message: string) => console.log(message));
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const handles: ServerConnectorHandle[] = [];
  const startedLabels: string[] = [];

  async function startOne(
    label: string,
    enabled: boolean,
    start: () => Promise<ServerConnectorHandle>,
  ): Promise<void> {
    if (!enabled) return;

    try {
      const handle = await start();
      handles.push(handle);
      startedLabels.push(label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warn(`[aria] Failed to auto-start ${label} connector: ${message}`);
    }
  }

  await startOne("telegram", hasTelegramCredentials(), () =>
    startTelegramConnector({ registerSignalHandlers: false }),
  );
  await startOne("discord", hasDiscordCredentials(), () =>
    startDiscordConnector({ registerSignalHandlers: false }),
  );
  await startOne(
    hasSlackSocketModeCredentials() ? "slack (socket)" : "slack",
    hasSlackSocketModeCredentials() || hasSlackCredentials(),
    () =>
      hasSlackSocketModeCredentials()
        ? startSlackConnector({ mode: "socket", registerSignalHandlers: false })
        : startSlackConnector({ mode: "webhook", registerSignalHandlers: false }),
  );
  await startOne("teams", hasTeamsCredentials(), () =>
    startTeamsConnector({ registerSignalHandlers: false }),
  );
  await startOne("gchat", hasGChatCredentials(), () =>
    startGChatConnector({ registerSignalHandlers: false }),
  );
  await startOne("github", hasGitHubCredentials(), () =>
    startGitHubConnector({ registerSignalHandlers: false }),
  );
  await startOne("linear", hasLinearCredentials(), () =>
    startLinearConnector({ registerSignalHandlers: false }),
  );

  const wechatAccounts = await loadWeChatAccounts(homeDir);
  await startOne("wechat", wechatAccounts.length > 0, () =>
    startWeChatConnector({ homeDir, registerSignalHandlers: false }),
  );

  if (startedLabels.length > 0) {
    log(`[aria] Auto-started connectors: ${startedLabels.join(", ")}`);
  } else {
    log("[aria] No connectors configured for auto-start.");
  }

  return {
    handles,
    async stop(): Promise<void> {
      for (const handle of [...handles].reverse()) {
        try {
          await handle.stop();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warn(`[aria] Failed to stop ${handle.name} connector cleanly: ${message}`);
        }
      }
    },
  };
}
