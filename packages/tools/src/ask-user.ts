import { Type } from "@sinclair/typebox";
import type { ToolImpl, ToolResult } from "@aria/agent-aria";

/**
 * ask_user tool — allows the agent to ask the user a clarifying question mid-turn.
 *
 * The tool itself returns a placeholder. The actual blocking question/answer flow
 * is handled by the agent's onAskUser callback, which is wired through the engine's
 * pendingQuestions broker in procedures.ts.
 */
export const askUserTool: ToolImpl = {
  name: "ask_user",
  description: "Ask the user a clarifying question. The agent pauses until the user responds. Use when you need input before proceeding.",
  summary: "ask_user [safe]: Ask the user a clarifying question. Supports free-text or multiple-choice options.",
  dangerLevel: "safe",
  parameters: Type.Object({
    question: Type.String({ description: "The question to ask the user" }),
    options: Type.Optional(
      Type.Array(Type.String(), {
        description: "Optional list of choices. If provided, the user picks one; otherwise free-text input.",
      }),
    ),
  }),
  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    // This execute() is a no-op placeholder. The agent intercepts ask_user tool calls
    // before they reach execute() and handles them via the onAskUser callback.
    // If we get here, it means onAskUser is not configured (e.g., cron context).
    return {
      content: "ask_user is not available in this context (no interactive user connected).",
      isError: true,
    };
  },
};
