import { Type } from "@mariozechner/pi-ai";
import type { ToolImpl } from "@aria/agent-aria";

/** Simple echo tool — returns the input message as content */
export const echoTool: ToolImpl = {
  name: "echo",
  description: "Echo back the provided message. For testing tool dispatch.",
  dangerLevel: "safe",
  parameters: Type.Object({
    message: Type.String({ description: "The message to echo back" }),
  }),
  async execute(args) {
    return { content: String(args.message) };
  },
};

/** Always-failing tool — throws an error. For testing error handling. */
export const failTool: ToolImpl = {
  name: "fail",
  description: "Always fails with an error. For testing error paths.",
  dangerLevel: "safe",
  parameters: Type.Object({
    reason: Type.Optional(Type.String({ description: "Error message" })),
  }),
  async execute(args) {
    throw new Error(String(args.reason ?? "intentional test failure"));
  },
};

/** Slow tool — delays for a given number of milliseconds, then returns. */
export const slowTool: ToolImpl = {
  name: "slow",
  description: "Wait for the specified duration then return. For testing timeouts.",
  dangerLevel: "safe",
  parameters: Type.Object({
    ms: Type.Number({ description: "Milliseconds to wait" }),
  }),
  async execute(args) {
    const ms = Number(args.ms);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { content: `waited ${ms}ms` };
  },
};
