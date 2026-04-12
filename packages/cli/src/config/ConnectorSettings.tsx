import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { AriaConfigFile } from "@aria/engine/config/index.js";
import { loadSecrets, saveSecrets } from "@aria/engine/config/secrets.js";
import type { SecretsFile } from "@aria/engine/config/types.js";
import type { ToolApprovalMode, ConnectorType } from "@aria/protocol";

type Substep = "menu" | "edit-telegram-token" | "edit-discord-token" | "edit-discord-guild"
  | "edit-slack-token" | "edit-slack-secret"
  | "edit-teams-id" | "edit-teams-password"
  | "edit-gchat-key"
  | "edit-github-token" | "edit-github-secret"
  | "edit-linear-key" | "edit-linear-secret"
  | "wechat-accounts";

interface ConnectorSettingsProps {
  config: AriaConfigFile;
  homeDir: string;
  onSave: (config: AriaConfigFile) => Promise<void>;
  onBack: () => void;
}

const APPROVAL_MODES: ToolApprovalMode[] = ["ask", "never", "always"];
const APPROVAL_LABELS: Record<ToolApprovalMode, string> = {
  ask: "ask (allow per-session override)",
  never: "never (auto-approve all)",
  always: "always (ask every time)",
};

const MENU_ITEMS = [
  { key: "telegram-token", label: "Telegram bot token" },
  { key: "discord-token", label: "Discord bot token" },
  { key: "discord-guild", label: "Discord guild ID" },
  { key: "slack-token", label: "Slack bot token" },
  { key: "slack-secret", label: "Slack signing secret" },
  { key: "teams-id", label: "Teams bot ID" },
  { key: "teams-password", label: "Teams bot password" },
  { key: "gchat-key", label: "Google Chat service account key" },
  { key: "github-token", label: "GitHub token" },
  { key: "github-secret", label: "GitHub webhook secret" },
  { key: "linear-key", label: "Linear API key" },
  { key: "linear-secret", label: "Linear webhook secret" },
  { key: "wechat-accounts", label: "WeChat linked accounts" },
  { key: "tui-approval", label: "TUI tool approval" },
  { key: "telegram-approval", label: "Telegram tool approval" },
  { key: "discord-approval", label: "Discord tool approval" },
  { key: "slack-approval", label: "Slack tool approval" },
  { key: "teams-approval", label: "Teams tool approval" },
  { key: "gchat-approval", label: "Google Chat tool approval" },
  { key: "github-approval", label: "GitHub tool approval" },
  { key: "linear-approval", label: "Linear tool approval" },
  { key: "wechat-approval", label: "WeChat tool approval" },
  { key: "webhook-enabled", label: "Webhook connector" },
  { key: "webhook-approval", label: "Webhook tool approval" },
] as const;

function getApprovalMode(config: AriaConfigFile, connector: ConnectorType): ToolApprovalMode {
  return config.runtime.toolApproval?.[connector] ?? (connector === "tui" ? "never" : "ask");
}

function cycleApprovalMode(current: ToolApprovalMode): ToolApprovalMode {
  const idx = APPROVAL_MODES.indexOf(current);
  return APPROVAL_MODES[(idx + 1) % APPROVAL_MODES.length]!;
}

export function ConnectorSettings({ config, homeDir, onSave, onBack }: ConnectorSettingsProps) {
  const [substep, setSubstep] = useState<Substep>("menu");
  const [selected, setSelected] = useState(0);
  const [secrets, setSecrets] = useState<SecretsFile | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSecrets(homeDir).then((s) => setSecrets(s ?? { apiKeys: {} }));
  }, [homeDir]);

  const rawTelegram = secrets?.apiKeys?.TELEGRAM_BOT_TOKEN ?? secrets?.botToken;
  const rawDiscord = secrets?.apiKeys?.DISCORD_TOKEN ?? secrets?.discordToken;
  const rawGuild = secrets?.apiKeys?.DISCORD_GUILD_ID ?? secrets?.discordGuildId;
  const rawSlackToken = secrets?.apiKeys?.SLACK_BOT_TOKEN;
  const rawSlackSecret = secrets?.apiKeys?.SLACK_SIGNING_SECRET;
  const rawTeamsId = secrets?.apiKeys?.TEAMS_BOT_ID;
  const rawTeamsPassword = secrets?.apiKeys?.TEAMS_BOT_PASSWORD;
  const rawGchatKey = secrets?.apiKeys?.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY;
  const rawGithubToken = secrets?.apiKeys?.GITHUB_TOKEN;
  const rawGithubSecret = secrets?.apiKeys?.GITHUB_WEBHOOK_SECRET;
  const rawLinearKey = secrets?.apiKeys?.LINEAR_API_KEY;
  const rawLinearSecret = secrets?.apiKeys?.LINEAR_WEBHOOK_SECRET;
  const wechatAccounts = secrets?.wechatAccounts ?? [];

  const mask = (v: string | undefined) => v ? "●●●●" + v.slice(-4) : "(not set)";
  const telegramToken = mask(rawTelegram);
  const discordToken = mask(rawDiscord);
  const discordGuild = rawGuild || "(not set)";

  useInput((input, key) => {
    if (saved) return;

    // --- MENU ---
    if (substep === "menu") {
      if (key.escape) { onBack(); return; }
      if (key.upArrow) { setSelected((s) => Math.max(0, s - 1)); return; }
      if (key.downArrow) { setSelected((s) => Math.min(MENU_ITEMS.length - 1, s + 1)); return; }
      if (key.return) {
        const item = MENU_ITEMS[selected];
        if (item.key === "telegram-token") {
          setEditValue(rawTelegram ?? "");
          setSubstep("edit-telegram-token");
        } else if (item.key === "discord-token") {
          setEditValue(rawDiscord ?? "");
          setSubstep("edit-discord-token");
        } else if (item.key === "discord-guild") {
          setEditValue(rawGuild ?? "");
          setSubstep("edit-discord-guild");
        } else if (item.key === "slack-token") {
          setEditValue(rawSlackToken ?? "");
          setSubstep("edit-slack-token");
        } else if (item.key === "slack-secret") {
          setEditValue(rawSlackSecret ?? "");
          setSubstep("edit-slack-secret");
        } else if (item.key === "teams-id") {
          setEditValue(rawTeamsId ?? "");
          setSubstep("edit-teams-id");
        } else if (item.key === "teams-password") {
          setEditValue(rawTeamsPassword ?? "");
          setSubstep("edit-teams-password");
        } else if (item.key === "gchat-key") {
          setEditValue(rawGchatKey ?? "");
          setSubstep("edit-gchat-key");
        } else if (item.key === "github-token") {
          setEditValue(rawGithubToken ?? "");
          setSubstep("edit-github-token");
        } else if (item.key === "github-secret") {
          setEditValue(rawGithubSecret ?? "");
          setSubstep("edit-github-secret");
        } else if (item.key === "linear-key") {
          setEditValue(rawLinearKey ?? "");
          setSubstep("edit-linear-key");
        } else if (item.key === "linear-secret") {
          setEditValue(rawLinearSecret ?? "");
          setSubstep("edit-linear-secret");
        } else if (item.key === "wechat-accounts") {
          setSubstep("wechat-accounts");
        } else if (item.key.endsWith("-approval")) {
          const connector = item.key.replace("-approval", "") as ConnectorType;
          const current = getApprovalMode(config, connector);
          const next = cycleApprovalMode(current);
          const updated: AriaConfigFile = {
            ...config,
            runtime: {
              ...config.runtime,
              toolApproval: {
                ...config.runtime.toolApproval,
                [connector]: next,
              },
            },
          };
          setSaved(true);
          onSave(updated).then(() => setSaved(false));
        } else if (item.key === "webhook-enabled") {
          const current = config.runtime.webhook?.enabled ?? false;
          const updated: AriaConfigFile = {
            ...config,
            runtime: {
              ...config.runtime,
              webhook: {
                ...config.runtime.webhook,
                enabled: !current,
              },
            },
          };
          setSaved(true);
          onSave(updated).then(() => setSaved(false));
        }
      }
      return;
    }

    // --- EDIT FIELDS ---
    if (key.escape) { setSubstep("menu"); return; }
    if (substep === "wechat-accounts") {
      return;
    }
    if (key.return) {
      const updated: SecretsFile = { ...secrets!, apiKeys: { ...secrets!.apiKeys } };
      if (substep === "edit-telegram-token") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.TELEGRAM_BOT_TOKEN = val; } else { delete updated.apiKeys.TELEGRAM_BOT_TOKEN; }
        delete updated.botToken; // migrate away from legacy field
      } else if (substep === "edit-discord-token") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.DISCORD_TOKEN = val; } else { delete updated.apiKeys.DISCORD_TOKEN; }
        delete updated.discordToken;
      } else if (substep === "edit-discord-guild") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.DISCORD_GUILD_ID = val; } else { delete updated.apiKeys.DISCORD_GUILD_ID; }
        delete updated.discordGuildId;
      } else if (substep === "edit-slack-token") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.SLACK_BOT_TOKEN = val; } else { delete updated.apiKeys.SLACK_BOT_TOKEN; }
      } else if (substep === "edit-slack-secret") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.SLACK_SIGNING_SECRET = val; } else { delete updated.apiKeys.SLACK_SIGNING_SECRET; }
      } else if (substep === "edit-teams-id") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.TEAMS_BOT_ID = val; } else { delete updated.apiKeys.TEAMS_BOT_ID; }
      } else if (substep === "edit-teams-password") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.TEAMS_BOT_PASSWORD = val; } else { delete updated.apiKeys.TEAMS_BOT_PASSWORD; }
      } else if (substep === "edit-gchat-key") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY = val; } else { delete updated.apiKeys.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY; }
      } else if (substep === "edit-github-token") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.GITHUB_TOKEN = val; } else { delete updated.apiKeys.GITHUB_TOKEN; }
      } else if (substep === "edit-github-secret") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.GITHUB_WEBHOOK_SECRET = val; } else { delete updated.apiKeys.GITHUB_WEBHOOK_SECRET; }
      } else if (substep === "edit-linear-key") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.LINEAR_API_KEY = val; } else { delete updated.apiKeys.LINEAR_API_KEY; }
      } else if (substep === "edit-linear-secret") {
        const val = editValue.trim();
        if (val) { updated.apiKeys.LINEAR_WEBHOOK_SECRET = val; } else { delete updated.apiKeys.LINEAR_WEBHOOK_SECRET; }
      }
      setSaved(true);
      saveSecrets(homeDir, updated).then(() => {
        setSecrets(updated);
        setSaved(false);
        setSubstep("menu");
      });
      return;
    }
    if (key.backspace || key.delete) {
      setEditValue((v) => v.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setEditValue((v) => v + input);
    }
  });

  if (!secrets) {
    return (
      <Box padding={1}>
        <Text>Loading secrets...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Connectors</Text>
      <Text />

      {substep === "menu" && (
        <>
          {MENU_ITEMS.map((item, i) => {
            let detail = "";
            if (item.key === "telegram-token") detail = ` ${telegramToken}`;
            else if (item.key === "discord-token") detail = ` ${discordToken}`;
            else if (item.key === "discord-guild") detail = ` ${discordGuild}`;
            else if (item.key === "slack-token") detail = ` ${mask(rawSlackToken)}`;
            else if (item.key === "slack-secret") detail = ` ${mask(rawSlackSecret)}`;
            else if (item.key === "teams-id") detail = ` ${rawTeamsId || "(not set)"}`;
            else if (item.key === "teams-password") detail = ` ${mask(rawTeamsPassword)}`;
            else if (item.key === "gchat-key") detail = ` ${mask(rawGchatKey)}`;
            else if (item.key === "github-token") detail = ` ${mask(rawGithubToken)}`;
            else if (item.key === "github-secret") detail = ` ${mask(rawGithubSecret)}`;
            else if (item.key === "linear-key") detail = ` ${mask(rawLinearKey)}`;
            else if (item.key === "linear-secret") detail = ` ${mask(rawLinearSecret)}`;
            else if (item.key === "wechat-accounts") detail = ` ${wechatAccounts.length === 0 ? "(none linked)" : `${wechatAccounts.length} linked`}`;
            else if (item.key.endsWith("-approval")) {
              const connector = item.key.replace("-approval", "") as ConnectorType;
              detail = ` ${APPROVAL_LABELS[getApprovalMode(config, connector)]}`;
            }
            else if (item.key === "webhook-enabled") detail = ` ${config.runtime.webhook?.enabled ? "enabled" : "disabled"}`;
            return (
              <Text key={item.key}>
                {i === selected ? <Text color="green">{"● "}</Text> : <Text>{"○ "}</Text>}
                {item.label}
                <Text dimColor>{detail}</Text>
              </Text>
            );
          })}
          <Text />
          <Text dimColor>↑↓ navigate | Enter edit/cycle | Esc back</Text>
        </>
      )}

      {substep === "wechat-accounts" && (
        <>
          <Text bold>WeChat Linked Accounts</Text>
          <Text dimColor>Use `aria wechat login` in your shell to add or refresh a linked WeChat account.</Text>
          <Text />
          {wechatAccounts.length === 0 ? (
            <Text dimColor>No accounts saved in secrets.enc.</Text>
          ) : (
            <>
              {wechatAccounts.map((account) => (
                <Text key={account.accountId}>
                  {account.accountId}
                  <Text dimColor>
                    {`  ${account.apiBaseUrl ?? "(default base URL)"}`}
                    {account.allowedUserIds?.length ? `  allow: ${account.allowedUserIds.join(", ")}` : ""}
                  </Text>
                </Text>
              ))}
            </>
          )}
          <Text />
          <Text dimColor>Esc back</Text>
        </>
      )}

      {substep === "edit-telegram-token" && (
        <>
          <Text bold>Telegram Bot Token</Text>
          <Text dimColor>Leave empty to clear. Obtain from @BotFather.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Token: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-discord-token" && (
        <>
          <Text bold>Discord Bot Token</Text>
          <Text dimColor>Leave empty to clear. Obtain from Discord Developer Portal.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Token: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-discord-guild" && (
        <>
          <Text bold>Discord Guild ID</Text>
          <Text dimColor>Leave empty to clear. Right-click server → Copy Server ID.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Guild ID: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-slack-token" && (
        <>
          <Text bold>Slack Bot Token</Text>
          <Text dimColor>Leave empty to clear. Obtain from Slack App settings → OAuth & Permissions.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Token: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-slack-secret" && (
        <>
          <Text bold>Slack Signing Secret</Text>
          <Text dimColor>Leave empty to clear. Found in Slack App settings → Basic Information.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Secret: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-teams-id" && (
        <>
          <Text bold>Teams Bot ID</Text>
          <Text dimColor>Leave empty to clear. Found in Azure Bot registration.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Bot ID: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-teams-password" && (
        <>
          <Text bold>Teams Bot Password</Text>
          <Text dimColor>Leave empty to clear. Found in Azure Bot registration → Certificates & secrets.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Password: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-gchat-key" && (
        <>
          <Text bold>Google Chat Service Account Key</Text>
          <Text dimColor>Leave empty to clear. Paste the JSON key from Google Cloud Console.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Key: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-github-token" && (
        <>
          <Text bold>GitHub Token</Text>
          <Text dimColor>Leave empty to clear. Create a PAT or GitHub App token.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Token: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-github-secret" && (
        <>
          <Text bold>GitHub Webhook Secret</Text>
          <Text dimColor>Leave empty to clear. Set in your GitHub webhook configuration.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Secret: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-linear-key" && (
        <>
          <Text bold>Linear API Key</Text>
          <Text dimColor>Leave empty to clear. Generate at linear.app/settings/api.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>API Key: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {substep === "edit-linear-secret" && (
        <>
          <Text bold>Linear Webhook Secret</Text>
          <Text dimColor>Leave empty to clear. Set in your Linear webhook configuration.</Text>
          <Text />
          <Box>
            <Text color="blue" bold>Secret: </Text>
            <Text>{editValue}</Text>
            <Text color="blue">▊</Text>
          </Box>
          <Text />
          <Text dimColor>Enter to save | Esc cancel</Text>
        </>
      )}

      {saved && <Text color="yellow">Saving...</Text>}
    </Box>
  );
}
