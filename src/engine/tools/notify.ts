import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "../agent/types.js";
import type { SecretsFile } from "../config/types.js";

/** Create the notify tool — pushes messages to Telegram/Discord via HTTP */
export function createNotifyTool(secrets: SecretsFile | null): ToolImpl {
  return {
    name: "notify",
    description:
      "Send a notification message to the user via Telegram or Discord. " +
      "Use this for scheduled task results, important alerts, or when the user isn't actively chatting.",
    summary:
      "Push a notification to the user's Telegram or Discord. " +
      "Safe to call — sends to the paired chat/channel only.",
    dangerLevel: "safe",
    parameters: Type.Object({
      message: Type.String({ description: "The notification text (supports Markdown)" }),
      connector: Type.Optional(
        Type.Union([
          Type.Literal("telegram"),
          Type.Literal("discord"),
          Type.Literal("all"),
        ], { description: 'Target connector: "telegram", "discord", or "all" (default: "all")' }),
      ),
    }),
    async execute(args) {
      const message = String(args.message);
      const target = (args.connector as string) ?? "all";

      if (!message.trim()) {
        return { content: "Error: empty message", isError: true };
      }

      const results: string[] = [];
      const errors: string[] = [];

      // Telegram
      if (target === "all" || target === "telegram") {
        if (secrets?.botToken && secrets.pairedChatId) {
          try {
            const resp = await fetch(
              `https://api.telegram.org/bot${secrets.botToken}/sendMessage`,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  chat_id: secrets.pairedChatId,
                  text: message,
                  parse_mode: "Markdown",
                }),
              },
            );
            if (resp.ok) {
              results.push("telegram");
            } else {
              const body = await resp.text();
              errors.push(`telegram: HTTP ${resp.status} — ${body.slice(0, 200)}`);
            }
          } catch (err) {
            errors.push(`telegram: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (target === "telegram") {
          return {
            content: "Telegram not configured. Set bot token and paired chat ID via `aria onboard` or `set_env_secret`.",
            isError: true,
          };
        }
      }

      // Discord
      if (target === "all" || target === "discord") {
        const channelId = process.env.ARIA_DISCORD_NOTIFY_CHANNEL;
        if (secrets?.discordToken && channelId) {
          try {
            const resp = await fetch(
              `https://discord.com/api/v10/channels/${channelId}/messages`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  authorization: `Bot ${secrets.discordToken}`,
                },
                body: JSON.stringify({ content: message }),
              },
            );
            if (resp.ok) {
              results.push("discord");
            } else {
              const body = await resp.text();
              errors.push(`discord: HTTP ${resp.status} — ${body.slice(0, 200)}`);
            }
          } catch (err) {
            errors.push(`discord: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else if (target === "discord") {
          return {
            content: "Discord not configured. Set discord token and ARIA_DISCORD_NOTIFY_CHANNEL.",
            isError: true,
          };
        }
      }

      if (results.length === 0 && errors.length === 0) {
        return { content: "No connectors configured for notifications. Set up Telegram or Discord via `aria onboard`." };
      }

      const parts: string[] = [];
      if (results.length > 0) parts.push(`Sent to: ${results.join(", ")}`);
      if (errors.length > 0) parts.push(`Errors: ${errors.join("; ")}`);
      return { content: parts.join(". "), isError: errors.length > 0 && results.length === 0 };
    },
  };
}
