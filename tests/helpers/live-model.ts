import { describe } from "bun:test";
import { ModelRouter } from "@sa/engine/router/index.js";
import type { KnownProvider } from "@mariozechner/pi-ai";

/** True when a live API key is available for LLM tests */
export const LIVE = !!process.env.ANTHROPIC_API_KEY;

/**
 * Create a ModelRouter configured for cheap live testing.
 * Uses claude-3-5-haiku with low maxTokens and temperature 0 for determinism.
 *
 * Throws a clear error if ANTHROPIC_API_KEY is not set.
 */
export function makeLiveRouter(): ModelRouter {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "makeLiveRouter() requires ANTHROPIC_API_KEY in environment. " +
        "Set it or use describeLive() to skip live tests automatically.",
    );
  }

  return ModelRouter.fromConfig({
    defaultModel: "haiku",
    providers: [
      {
        id: "anthropic",
        type: "anthropic" as KnownProvider,
        apiKeyEnvVar: "ANTHROPIC_API_KEY",
      },
    ],
    models: [
      {
        name: "haiku",
        provider: "anthropic",
        model: "claude-3-5-haiku-20241022",
        temperature: 0,
        maxTokens: 128,
      },
    ],
  });
}

/**
 * Wrapper around describe.if(LIVE) for live LLM tests.
 * Tests inside will skip gracefully when ANTHROPIC_API_KEY is absent.
 */
export const describeLive: typeof describe = describe.if(LIVE) as typeof describe;
