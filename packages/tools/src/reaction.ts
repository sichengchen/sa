import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";

export const reactionTool: ToolImpl = {
  name: "reaction",
  description:
    "React to the user's message with an emoji. Use this for quick acknowledgments, sentiment, or feedback without a full text response.",
  summary: "React to a message with an emoji (Telegram/Discord tap-back).",
  dangerLevel: "safe",
  parameters: Type.Object({
    emoji: Type.String({ description: "Emoji character to react with, e.g. '👍', '❤️', '😂'" }),
  }),
  async execute(args) {
    const emoji = args.emoji as string;
    if (!emoji.trim()) {
      return { content: "No emoji provided", isError: true };
    }
    // The actual reaction is handled by the connector via the reaction EngineEvent.
    // This tool just signals intent — procedures.ts intercepts tool_end for "reaction"
    // and emits a reaction event that connectors handle.
    return { content: `__reaction__:${emoji.trim()}` };
  },
};
